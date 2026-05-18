import { useEffect, useState, useMemo, useCallback } from 'react'
import { MarketCard } from './MarketCard'
import { GroupedMarketCard, type MarketGroup } from './GroupedMarketCard'
import { MarketsSkeleton } from './MarketSkeleton'
import { getMarkets as getSupabaseMarkets } from '../services/supabase'
import type { PolymarketMarket, MarketFilter, SupabaseMarketRow } from '../types/market'

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

  const fetchMarkets = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const supabaseMarkets = await getSupabaseMarkets({
        status: filter === 'all' ? undefined : filter === 'active' ? 'active' : filter === 'resolved' ? 'resolved' : undefined,
        limit: 200,
      })

      const polymarketMarkets = supabaseMarkets.map(toPolymarketMarket)
      setMarkets(polymarketMarkets)
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to fetch markets'
      setError(errorMsg)
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
        <div className="no-markets">
          {filter === 'active' ? 'No markets indexed yet. Ask the admin to sync markets.' : 'No markets available for this filter.'}
        </div>
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
