import type { PolymarketMarket, MarketStatus, SupabaseMarketRow } from '../types/market'

const POLYMARKET_DATA_API = 'https://gamma-api.polymarket.com'

async function fetchFromGamma(path: string): Promise<unknown> {
  const response = await fetch(`${POLYMARKET_DATA_API}${path}`)
  if (!response.ok) {
    throw new Error(`Polymarket API error: ${response.status} ${response.statusText}`)
  }
  return response.json()
}

function mapStatus(raw: string, endDate?: string): MarketStatus {
  const now = new Date()
  if (endDate) {
    const end = new Date(endDate)
    if (now > end) return 'closed'
  }
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
  let outcomes: string[] = []
  if (Array.isArray(raw.outcomes)) {
    outcomes = raw.outcomes as string[]
  } else if (typeof raw.outcomes === 'string') {
    try { outcomes = JSON.parse(raw.outcomes) } catch { outcomes = [raw.outcomes] }
  }

  let outcomePricesRaw: string[] = []
  if (Array.isArray(raw.outcomePrices)) {
    outcomePricesRaw = raw.outcomePrices as string[]
  } else if (typeof raw.outcomePrices === 'string') {
    try { outcomePricesRaw = JSON.parse(raw.outcomePrices) } catch { outcomePricesRaw = [raw.outcomePrices] }
  }

  const probabilities = outcomePricesRaw.map((p) => parseFloat(String(p)))

  let category = 'Other'
  if (typeof raw.category === 'string') {
    try {
      const parsed = JSON.parse(raw.category)
      category = parsed.label || parsed.name || raw.category
    } catch {
      category = raw.category
    }
  } else if (typeof raw.category === 'object' && raw.category !== null) {
    category = (raw.category as { label?: string }).label || 'Other'
  }

  const endDate = (raw.end_date as string) || (raw.endDate as string) || ''

  return {
    id: (raw.id as string) || '',
    conditionId: (raw.condition_id as string) || (raw.conditionId as string) || '',
    question: (raw.question as string) || '',
    description: (raw.description as string) || '',
    slug: (raw.slug as string) || '',
    category,
    tags: (raw.tags as string[]) || [],
    outcomes,
    outcomePrices: outcomePricesRaw,
    probabilities,
    volume: parseFloat(String(raw.volume || 0)),
    volume24h: parseFloat(String(raw.volume_24h || raw.volume24hr || 0)),
    liquidity: parseFloat(String(raw.liquidity || 0)),
    status: mapStatus(String(raw.closed || raw.status || 'active'), endDate),
    closeDate: (raw.close_date as string) || (raw.closeDate as string) || '',
    endDate,
    image: (raw.image as string) || '',
    icon: (raw.icon as string) || '',
    resolutionSource: (raw.resolution_source as string) || (raw.resolutionSource as string) || '',
    groupSlug: (raw.group_slug as string) || (raw.groupSlug as string) || undefined,
    groupName: (raw.group_name as string) || (raw.groupName as string) || undefined,
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
  params.set('active', 'true')
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
  const week = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
  const markets = await getActiveMarkets({ limit: 200, closed: false })
  return markets
    .filter((m) => {
      if (!m.endDate) return false
      const endDate = new Date(m.endDate)
      return endDate > now && endDate <= week
    })
    .sort((a, b) => new Date(a.endDate).getTime() - new Date(b.endDate).getTime())
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
