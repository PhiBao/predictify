import { useEffect, useState, useMemo, useCallback } from 'react'
import { MarketCard } from './MarketCard'
import { GroupedMarketCard, type MarketGroup } from './GroupedMarketCard'
import { MarketsSkeleton } from './MarketSkeleton'
import { getActiveMarkets, getTrendingMarkets, getClosingSoonMarkets } from '../services/polymarketAPI'
import { getMarkets as getSupabaseMarkets, upsertMarkets } from '../services/supabase'
import type { PolymarketMarket, MarketFilter, SupabaseMarketRow } from '../types/market'

function toPolymarketMarket(row: SupabaseMarketRow): PolymarketMarket {
  return {
    id: row.id,
    conditionId: row.condition_id,
    question: row.question,
    description: row.description,
    slug: row.slug,
    category: row.category,
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
  const firstQuestion = markets[0].question
  return firstQuestion
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

  const fetchMarkets = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      let polymarketMarkets: PolymarketMarket[]

      try {
        const supabaseMarkets = await getSupabaseMarkets({
          status: filter === 'all' ? undefined : filter === 'active' ? 'active' : filter === 'resolved' ? 'resolved' : undefined,
          limit: 100,
        })
        if (supabaseMarkets.length > 0) {
          polymarketMarkets = supabaseMarkets.map(toPolymarketMarket)
        } else {
          throw new Error('No cached data')
        }
      } catch {
        switch (filter) {
          case 'trending':
            polymarketMarkets = await getTrendingMarkets(50)
            break
          case 'closing-soon':
            polymarketMarkets = await getClosingSoonMarkets(50)
            break
          case 'resolved':
            polymarketMarkets = await getActiveMarkets({ limit: 50, closed: true })
            break
          default:
            polymarketMarkets = await getActiveMarkets({ limit: 50, closed: false })
        }

        const rows = polymarketMarkets.map((m) => ({
          id: m.id,
          condition_id: m.conditionId,
          question: m.question,
          description: m.description,
          slug: m.slug,
          category: m.category,
          tags: m.tags,
          outcomes: m.outcomes,
          outcome_prices: m.outcomePrices,
          probabilities: m.probabilities,
          volume: m.volume,
          volume_24h: m.volume24h,
          liquidity: m.liquidity,
          status: m.status,
          close_date: m.closeDate,
          end_date: m.endDate,
          image: m.image,
          icon: m.icon,
          resolution_source: m.resolutionSource,
          group_slug: m.groupSlug || null,
          group_name: m.groupName || null,
          last_synced: new Date().toISOString(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }))
        await upsertMarkets(rows)
      }

      setMarkets(polymarketMarkets)
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to fetch markets'
      setError(errorMsg)
      console.error('Market fetch error:', err)
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => {
    fetchMarkets()
  }, [fetchMarkets])

  const filteredItems = useMemo(() => {
    let filtered = markets
    if (filter === 'active') {
      filtered = markets.filter((m) => m.status === 'active')
    } else if (filter === 'resolved') {
      filtered = markets.filter((m) => m.status === 'resolved' || m.status === 'closed')
    }
    return groupMarkets(filtered)
  }, [markets, filter])

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
        <div className="markets-filter-bar" role="tablist" aria-label="Market filter">
          {(['active', 'trending', 'closing-soon', 'resolved', 'all'] as MarketFilter[]).map((f) => (
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

      {filteredItems.length === 0 ? (
        <div className="no-markets">No markets available for this filter.</div>
      ) : (
        <div className="markets-grid">
          {filteredItems.map((item, index) => {
            if ('markets' in item) {
              return <GroupedMarketCard key={`group-${index}`} group={item} />
            }
            return <MarketCard key={item.id} market={item} animationDelay={index * 60} />
          })}
        </div>
      )}
    </div>
  )
}
