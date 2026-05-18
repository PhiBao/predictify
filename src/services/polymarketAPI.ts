import type { PolymarketMarket, MarketStatus, SupabaseMarketRow } from '../types/market'

const POLYMARKET_DATA_API = 'https://gamma-api.polymarket.com'

async function fetchFromGamma(path: string): Promise<unknown> {
  const response = await fetch(`${POLYMARKET_DATA_API}${path}`)
  if (!response.ok) {
    throw new Error(`Polymarket API error: ${response.status} ${response.statusText}`)
  }
  return response.json()
}

function mapStatus(raw: string): MarketStatus {
  switch (raw) {
    case 'active':
    case 'open':
      return 'active'
    case 'closed':
      return 'closed'
    case 'resolved':
      return 'resolved'
    default:
      return 'active'
  }
}

function parsePolymarketMarket(raw: Record<string, unknown>): PolymarketMarket {
  const outcomes = (raw.outcomes as string[]) || []
  const outcomePrices = (raw.outcomePrices as string[]) || []
  const probabilities = outcomePrices.map((p) => parseFloat(p))

  return {
    id: (raw.id as string) || '',
    conditionId: (raw.condition_id as string) || '',
    question: (raw.question as string) || '',
    description: (raw.description as string) || '',
    slug: (raw.slug as string) || '',
    category: (raw.category as string) || 'Other',
    tags: (raw.tags as string[]) || [],
    outcomes,
    outcomePrices,
    probabilities,
    volume: parseFloat(String(raw.volume || 0)),
    volume24h: parseFloat(String(raw.volume_24h || 0)),
    liquidity: parseFloat(String(raw.liquidity || 0)),
    status: mapStatus(String(raw.closed || raw.status || 'active')),
    closeDate: (raw.close_date as string) || '',
    endDate: (raw.end_date as string) || '',
    image: (raw.image as string) || '',
    icon: (raw.icon as string) || '',
    resolutionSource: (raw.resolution_source as string) || '',
    groupSlug: (raw.group_slug as string) || undefined,
    groupName: (raw.group_name as string) || undefined,
  }
}

function toSupabaseRow(market: PolymarketMarket): SupabaseMarketRow {
  const now = new Date().toISOString()
  return {
    id: market.id,
    condition_id: market.conditionId,
    question: market.question,
    description: market.description,
    slug: market.slug,
    category: market.category,
    tags: market.tags,
    outcomes: market.outcomes,
    outcome_prices: market.outcomePrices,
    probabilities: market.probabilities,
    volume: market.volume,
    volume_24h: market.volume24h,
    liquidity: market.liquidity,
    status: market.status,
    close_date: market.closeDate,
    end_date: market.endDate,
    image: market.image,
    icon: market.icon,
    resolution_source: market.resolutionSource,
    group_slug: market.groupSlug || null,
    group_name: market.groupName || null,
    last_synced: now,
    created_at: now,
    updated_at: now,
  }
}

export async function getActiveMarkets(options?: {
  limit?: number
  offset?: number
  closed?: boolean
  archived?: boolean
  id?: string
  slug?: string
  category?: string
  tag?: string
}): Promise<PolymarketMarket[]> {
  const params = new URLSearchParams()

  if (options?.limit) params.set('limit', String(options.limit))
  if (options?.offset) params.set('offset', String(options.offset))
  if (options?.closed !== undefined) params.set('closed', String(options.closed))
  if (options?.archived !== undefined) params.set('archived', String(options.archived))
  if (options?.id) params.set('id', options.id)
  if (options?.slug) params.set('slug', options.slug)
  if (options?.category) params.set('category', options.category)
  if (options?.tag) params.set('tag', options.tag)

  params.set('order', 'volume')
  params.set('ascending', 'false')

  const data = await fetchFromGamma(`/events?${params.toString()}`)
  const events = data as Record<string, unknown>[]

  const markets: PolymarketMarket[] = []
  for (const event of events) {
    const markets_raw = (event.markets as Record<string, unknown>[]) || []
    for (const m of markets_raw) {
      const merged = {
        ...m,
        group_slug: event.slug as string | undefined,
        group_name: event.title as string | undefined,
        category: (event.category as string) || (event.tags as string[])?.[0] || 'Other',
        tags: (event.tags as string[]) || [],
      }
      markets.push(parsePolymarketMarket(merged))
    }
  }

  return markets
}

export async function getMarketById(id: string): Promise<PolymarketMarket | null> {
  const markets = await getActiveMarkets({ id, limit: 1 })
  return markets[0] || null
}

export async function getMarketsByGroupSlug(slug: string): Promise<PolymarketMarket[]> {
  return getActiveMarkets({ slug, limit: 100 })
}

export async function getMarketsByCategory(category: string, limit = 20): Promise<PolymarketMarket[]> {
  return getActiveMarkets({ category, limit })
}

export async function getMarketsByTag(tag: string, limit = 20): Promise<PolymarketMarket[]> {
  return getActiveMarkets({ tag, limit })
}

export async function getTrendingMarkets(limit = 20): Promise<PolymarketMarket[]> {
  return getActiveMarkets({ limit, closed: false })
}

export async function getClosingSoonMarkets(limit = 20): Promise<PolymarketMarket[]> {
  const now = new Date()
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000)
  const markets = await getActiveMarkets({ limit: 100, closed: false })
  return markets
    .filter((m) => {
      if (!m.closeDate) return false
      const closeDate = new Date(m.closeDate)
      return closeDate > now && closeDate <= tomorrow
    })
    .slice(0, limit)
}

export async function syncMarketsToSupabase(options?: {
  limit?: number
}): Promise<{ synced: number; total: number }> {
  const { upsertMarkets } = await import('./supabase')
  const markets = await getActiveMarkets({ limit: options?.limit || 100, closed: false })
  const rows = markets.map(toSupabaseRow)
  await upsertMarkets(rows)
  return { synced: rows.length, total: rows.length }
}

export function getOutcomeIndex(market: PolymarketMarket, outcomeName: string): number {
  return market.outcomes.indexOf(outcomeName)
}

export function getProbability(market: PolymarketMarket, outcomeIndex: number): number {
  return market.probabilities[outcomeIndex] || 0
}

export function formatVolume(volume: number): string {
  if (volume >= 1_000_000) return `$${(volume / 1_000_000).toFixed(1)}M`
  if (volume >= 1_000) return `$${(volume / 1_000).toFixed(1)}K`
  return `$${volume.toFixed(0)}`
}
