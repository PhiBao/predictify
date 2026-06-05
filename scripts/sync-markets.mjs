import { createClient } from '@supabase/supabase-js'

const POLYMARKET_DATA_API = 'https://gamma-api.polymarket.com'
const LIMIT = 100

const supabaseUrl = process.env.SUPABASE_URL
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    'Missing SUPABASE_URL or SUPABASE_ANON_KEY environment variables',
  )
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseAnonKey)

async function fetchFromGamma(path) {
  const response = await fetch(`${POLYMARKET_DATA_API}${path}`)
  if (!response.ok) {
    throw new Error(
      `Polymarket API error: ${response.status} ${response.statusText}`,
    )
  }
  return response.json()
}

function mapStatus(raw, endDate) {
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

function parsePolymarketMarket(raw) {
  let outcomes = []
  if (Array.isArray(raw.outcomes)) {
    outcomes = raw.outcomes
  } else if (typeof raw.outcomes === 'string') {
    try {
      outcomes = JSON.parse(raw.outcomes)
    } catch {
      outcomes = [raw.outcomes]
    }
  }

  let outcomePricesRaw = []
  if (Array.isArray(raw.outcomePrices)) {
    outcomePricesRaw = raw.outcomePrices
  } else if (typeof raw.outcomePrices === 'string') {
    try {
      outcomePricesRaw = JSON.parse(raw.outcomePrices)
    } catch {
      outcomePricesRaw = [raw.outcomePrices]
    }
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
    category = raw.category.label || 'Other'
  }

  const endDate = raw.end_date || raw.endDate || ''

  return {
    id: raw.id || '',
    conditionId: raw.condition_id || raw.conditionId || '',
    question: raw.question || '',
    description: raw.description || '',
    slug: raw.slug || '',
    category,
    tags: raw.tags || [],
    outcomes,
    outcomePrices: outcomePricesRaw,
    probabilities,
    volume: parseFloat(String(raw.volume || 0)),
    volume24h: parseFloat(
      String(raw.volume_24h || raw.volume24hr || 0),
    ),
    liquidity: parseFloat(String(raw.liquidity || 0)),
    status: mapStatus(
      String(raw.closed || raw.status || 'active'),
      endDate,
    ),
    closeDate: raw.close_date || raw.closeDate || '',
    endDate,
    image: raw.image || '',
    icon: raw.icon || '',
    resolutionSource:
      raw.resolution_source || raw.resolutionSource || '',
    groupSlug: raw.group_slug || raw.groupSlug || undefined,
    groupName: raw.group_name || raw.groupName || undefined,
  }
}

function toSupabaseRow(market) {
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
    updated_at: now,
  }
}

async function getActiveMarkets(options = {}) {
  const params = new URLSearchParams()

  if (options.limit) params.set('limit', String(options.limit))
  if (options.offset) params.set('offset', String(options.offset))
  params.set('active', 'true')
  if (options.closed !== undefined)
    params.set('closed', String(options.closed))
  if (options.archived !== undefined)
    params.set('archived', String(options.archived))
  if (options.id) params.set('id', options.id)
  if (options.slug) params.set('slug', options.slug)
  if (options.category) params.set('category', options.category)
  if (options.tag) params.set('tag', options.tag)

  params.set('order', 'volume')
  params.set('ascending', 'false')

  const data = await fetchFromGamma(`/events?${params.toString()}`)
  const events = data

  const markets = []
  for (const event of events) {
    const markets_raw = event.markets || []
    for (const m of markets_raw) {
      const merged = {
        ...m,
        group_slug: event.slug,
        group_name: event.title,
        category:
          event.category ||
          (event.tags && event.tags[0]) ||
          'Other',
        tags: event.tags || [],
      }
      markets.push(parsePolymarketMarket(merged))
    }
  }

  return markets
}

async function main() {
  console.log(`[${new Date().toISOString()}] Starting market sync...`)

  try {
    const markets = await getActiveMarkets({
      limit: LIMIT,
      closed: false,
    })
    console.log(`Fetched ${markets.length} markets from Polymarket`)

    if (markets.length === 0) {
      console.log('No markets fetched, skipping upsert')
      return
    }

    const rows = markets.map(toSupabaseRow)

    const { error } = await supabase
      .from('markets')
      .upsert(rows, { onConflict: 'id' })

    if (error) {
      throw new Error(`Failed to upsert markets: ${error.message}`)
    }

    console.log(`Upserted ${rows.length} markets to Supabase`)

    const now = new Date().toISOString()
    const { error: metaError } = await supabase
      .from('sync_metadata')
      .upsert({ id: 1, last_sync: now }, { onConflict: 'id' })

    if (metaError) {
      console.warn(
        `Failed to update sync_metadata: ${metaError.message}`,
      )
    } else {
      console.log(`Sync metadata updated: ${now}`)
    }

    console.log('Sync complete.')
  } catch (err) {
    console.error(`Sync failed: ${err.message}`)
    process.exit(1)
  }
}

main()
