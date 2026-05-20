import { useEffect, useState, useMemo, useRef } from 'react'
import { MarketCard } from './MarketCard'
import { GroupedMarketCard, type MarketGroup } from './GroupedMarketCard'
import { MarketsSkeleton } from './MarketSkeleton'
import { getMarkets as getSupabaseMarkets, getClosingSoonMarkets, getAllMarketPools } from '../services/supabase'
import type { PolymarketMarket, MarketFilter, SupabaseMarketRow, PoolEntry } from '../types/market'

function parseCategory(raw: string): string {
  if (!raw) return 'Other'
  try {
    const parsed = JSON.parse(raw)
    return parsed.label || parsed.name || raw
  } catch {
    return raw
  }
}

function toPolymarketMarket(row: SupabaseMarketRow): PolymarketMarket {
  return {
    id: row.id,
    conditionId: row.condition_id,
    question: row.question,
    description: row.description,
    slug: row.slug,
    category: parseCategory(row.category),
    tags: row.tags,
    outcomes: row.outcomes,
    outcomePrices: row.outcome_prices,
    probabilities: row.probabilities,
    volume: row.volume,
    volume24h: row.volume_24h,
    liquidity: row.liquidity,
    status: row.status,
    closeDate: row.close_date,
    endDate: row.end_date,
    image: row.image,
    icon: row.icon,
    resolutionSource: row.resolution_source,
    groupSlug: row.group_slug || undefined,
    groupName: row.group_name || undefined,
  }
}

function deriveGroupTitle(markets: PolymarketMarket[]): string {
  if (markets.length === 0) return ''
  if (markets[0].groupName) return markets[0].groupName
  return markets[0].question
}

function groupMarkets(markets: PolymarketMarket[]): (PolymarketMarket | MarketGroup)[] {
  const groups = new Map<string, PolymarketMarket[]>()
  const singles: PolymarketMarket[] = []

  for (const market of markets) {
    const key = market.groupSlug?.trim().toLowerCase() || `market-${market.id}`
    const existing = groups.get(key)
    if (existing) {
      existing.push(market)
    } else {
      const hasSibling = markets.some(
        (m) => m.id !== market.id && m.groupSlug?.trim().toLowerCase() === key
      )
      if (hasSibling) {
        groups.set(key, [market])
      } else {
        singles.push(market)
      }
    }
  }

  const result: (PolymarketMarket | MarketGroup)[] = [...singles]

  for (const [, groupMarkets] of groups) {
    if (groupMarkets.length === 1) {
      result.push(groupMarkets[0])
    } else {
      const first = groupMarkets[0]
      result.push({
        question: deriveGroupTitle(groupMarkets),
        imageUrl: first.image,
        description: first.description,
        category: first.category,
        status: first.status,
        volume: first.volume,
        groupSlug: first.groupSlug || '',
        markets: groupMarkets,
      })
    }
  }

  return result
}

export function MarketsList() {
  const [markets, setMarkets] = useState<PolymarketMarket[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<MarketFilter>('active')
  const [poolsByMarketId, setPoolsByMarketId] = useState<Record<string, PoolEntry[]>>({})
  const [search, setSearch] = useState('')
  const marketsRef = useRef<PolymarketMarket[]>([])

  // Keep ref in sync
  useEffect(() => {
    marketsRef.current = markets
  }, [markets])

  useEffect(() => {
    let cancelled = false

    // Clear markets immediately when filter changes to avoid showing stale data
    setMarkets([])
    setPoolsByMarketId({})
    setLoading(true)

    async function fetchMarkets() {
      try {
        setError(null)

        let supabaseMarkets: SupabaseMarketRow[]

        if (filter === 'closing-soon') {
          supabaseMarkets = await getClosingSoonMarkets(100)
        } else if (filter === 'trending') {
          supabaseMarkets = await getSupabaseMarkets({
            status: 'active',
            limit: 200,
            orderBy: 'volume_24h',
          })
        } else if (filter === 'resolved') {
          supabaseMarkets = await getSupabaseMarkets({
            status: 'resolved',
            limit: 200,
          })
        } else {
          supabaseMarkets = await getSupabaseMarkets({
            status: 'active',
            limit: 500,
          })
        }

        if (cancelled) return

        const polymarketMarkets = supabaseMarkets.map(toPolymarketMarket)
        console.log(`[MarketsList] ${filter}: fetched ${supabaseMarkets.length} markets`)
        setMarkets(polymarketMarkets)

        const marketIds = polymarketMarkets.map((m) => m.id)
        const poolsMap = await getAllMarketPools(marketIds)

        if (cancelled) return
        setPoolsByMarketId(poolsMap)
      } catch (err) {
        if (cancelled) return
        const errorMsg = err instanceof Error ? err.message : 'Failed to fetch markets'
        console.error('[MarketsList] Fetch error, keeping stale data:', errorMsg)
        if (marketsRef.current.length === 0) {
          setError(errorMsg)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchMarkets()
    return () => { cancelled = true }
  }, [filter])

  const filteredItems = useMemo(() => {
    const now = new Date()

    function getDaysLeft(m: PolymarketMarket): number {
      if (!m.endDate) return Infinity
      const end = new Date(m.endDate)
      return Math.max(0, (end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    }

    function isExpired(m: PolymarketMarket): boolean {
      if (!m.endDate) return false
      return now > new Date(m.endDate)
    }

    let filtered = [...markets]

    if (filter === 'active') {
      filtered = filtered.filter((m) => m.status === 'active' && !isExpired(m))
      filtered.sort((a, b) => getDaysLeft(a) - getDaysLeft(b))
    } else if (filter === 'trending') {
      filtered = filtered.filter((m) => m.status === 'active' && !isExpired(m))
      filtered.sort((a, b) => b.volume24h - a.volume24h)
    } else if (filter === 'closing-soon') {
      filtered = filtered.filter((m) => m.status === 'active' && !isExpired(m) && m.endDate)
      filtered.sort((a, b) => getDaysLeft(a) - getDaysLeft(b))
    } else if (filter === 'resolved') {
      filtered = filtered.filter((m) => m.status === 'resolved' || m.status === 'closed')
      filtered.sort((a, b) => new Date(b.endDate || 0).getTime() - new Date(a.endDate || 0).getTime())
    }

    if (search.trim()) {
      const q = search.trim().toLowerCase()
      filtered = filtered.filter((m) =>
        m.question.toLowerCase().includes(q) ||
        m.description.toLowerCase().includes(q) ||
        m.category.toLowerCase().includes(q) ||
        m.tags.some((t) => t.toLowerCase().includes(q))
      )
    }

    console.log(`[MarketsList] ${filter}: ${markets.length} total -> ${filtered.length} after filter`)
    return groupMarkets(filtered)
  }, [markets, filter, search])

  if (loading) {
    return <MarketsSkeleton />
  }

  if (error) {
    return (
      <div className="markets-list">
        <h2 className="section-title light">Prediction Markets</h2>
        <div className="error">Error: {error}</div>
      </div>
    )
  }

  return (
    <div className="markets-list">
      <div className="markets-header">
        <h2 className="section-title light">Prediction Markets</h2>
        <div className="markets-controls">
          <div className="markets-search">
            <svg className="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
            <input
              type="text"
              className="search-input"
              placeholder="Search markets..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button className="search-clear" onClick={() => setSearch('')}>&times;</button>
            )}
          </div>
          <div className="markets-filter-bar" role="tablist" aria-label="Market filter">
            {(['active', 'trending', 'closing-soon', 'resolved'] as MarketFilter[]).map((f) => (
              <button
                key={f}
                className={`filter-segment ${filter === f ? 'active' : ''}`}
                onClick={() => setFilter(f)}
                role="tab"
                aria-selected={filter === f}
              >
                {f === 'active' ? 'Live' : f === 'closing-soon' ? 'Closing Soon' : f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {filteredItems.length === 0 ? (
        <div className="no-markets">
          {filter === 'active' ? 'No markets indexed yet. Ask the admin to sync markets.' : 'No markets available for this filter.'}
        </div>
      ) : (
        <div className="markets-grid">
          {filteredItems.map((item, index) => {
            if ('markets' in item) {
              const groupPools: Record<string, PoolEntry[]> = {}
              for (const m of item.markets) {
                if (poolsByMarketId[m.id]) {
                  groupPools[m.id] = poolsByMarketId[m.id]
                }
              }
              return <GroupedMarketCard key={`group-${index}`} group={item} poolsByMarketId={groupPools} />
            }
            return <MarketCard key={item.id} market={item} animationDelay={index * 60} pools={poolsByMarketId[item.id]} />
          })}
        </div>
      )}
    </div>
  )
}
