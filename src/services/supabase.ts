import { createClient } from '@supabase/supabase-js'
import type {
  SupabaseMarketRow,
  SupabaseResolutionRow,
  SupabaseDisputeRow,
  SupabaseStakeRow,
  MarketStatus,
  ResolutionStatus,
} from '../types/market'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase environment variables not set. Market indexing will be disabled.')
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key'
)

export async function upsertMarket(market: SupabaseMarketRow): Promise<void> {
  const { error } = await supabase
    .from('markets')
    .upsert(market, { onConflict: 'id' })
  if (error) throw new Error(`Failed to upsert market: ${error.message}`)
}

export async function upsertMarkets(markets: SupabaseMarketRow[]): Promise<void> {
  const { error } = await supabase
    .from('markets')
    .upsert(markets, { onConflict: 'id' })
  if (error) throw new Error(`Failed to upsert markets: ${error.message}`)
}

export async function getMarkets(options?: {
  status?: MarketStatus
  category?: string
  limit?: number
  offset?: number
  search?: string
  orderBy?: 'volume' | 'end_date' | 'volume_24h'
}): Promise<SupabaseMarketRow[]> {
  let query = supabase.from('markets').select('*')

  if (options?.status) {
    query = query.eq('status', options.status)
  }
  if (options?.category) {
    query = query.eq('category', options.category)
  }
  if (options?.search) {
    query = query.or(`question.ilike.%${options.search}%,description.ilike.%${options.search}%`)
  }

  const orderBy = options?.orderBy || 'volume'
  const ascending = orderBy === 'end_date'
  query = query.order(orderBy, { ascending })

  if (options?.limit) {
    query = query.limit(options.limit)
  }
  if (options?.offset) {
    query = query.range(options.offset, (options.offset + (options.limit || 20)) - 1)
  }

  const { data, error } = await query
  if (error) throw new Error(`Failed to fetch markets: ${error.message}`)
  return data || []
}

export async function getMarketById(id: string): Promise<SupabaseMarketRow | null> {
  const { data, error } = await supabase
    .from('markets')
    .select('*')
    .eq('id', id)
    .single()
  if (error && error.code !== 'PGRST116') throw new Error(`Failed to fetch market: ${error.message}`)
  return data
}

export async function getMarketsByGroupSlug(slug: string): Promise<SupabaseMarketRow[]> {
  const { data, error } = await supabase
    .from('markets')
    .select('*')
    .eq('group_slug', slug)
    .order('volume', { ascending: false })
  if (error) throw new Error(`Failed to fetch group markets: ${error.message}`)
  return data || []
}

export async function insertResolution(resolution: Omit<SupabaseResolutionRow, 'created_at'>): Promise<number> {
  const { data, error } = await supabase
    .from('resolutions')
    .insert(resolution)
    .select('id')
    .single()
  if (error) throw new Error(`Failed to insert resolution: ${error.message}`)
  return data.id
}

export async function getResolutionByMarketId(marketId: string): Promise<SupabaseResolutionRow | null> {
  const { data, error } = await supabase
    .from('resolutions')
    .select('*')
    .eq('market_id', marketId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`Failed to fetch resolution: ${error.message}`)
  return data
}

export async function updateResolutionStatus(id: number, status: ResolutionStatus): Promise<void> {
  const { error } = await supabase
    .from('resolutions')
    .update({ status })
    .eq('id', id)
  if (error) throw new Error(`Failed to update resolution: ${error.message}`)
}

export async function insertDispute(dispute: Omit<SupabaseDisputeRow, 'created_at'>): Promise<number> {
  const { data, error } = await supabase
    .from('disputes')
    .insert(dispute)
    .select('id')
    .single()
  if (error) throw new Error(`Failed to insert dispute: ${error.message}`)
  return data.id
}

export async function getDisputesByMarketId(marketId: string): Promise<SupabaseDisputeRow[]> {
  const { data, error } = await supabase
    .from('disputes')
    .select('*')
    .eq('market_id', marketId)
    .order('created_at', { ascending: false })
  if (error) throw new Error(`Failed to fetch disputes: ${error.message}`)
  return data || []
}

export async function getActiveDisputes(): Promise<SupabaseDisputeRow[]> {
  const { data, error } = await supabase
    .from('disputes')
    .select('*')
    .in('status', ['pending', 'under_review'])
    .order('created_at', { ascending: false })
  if (error) throw new Error(`Failed to fetch active disputes: ${error.message}`)
  return data || []
}

export async function updateDisputeStatus(id: number, status: string): Promise<void> {
  const { error } = await supabase
    .from('disputes')
    .update({ status })
    .eq('id', id)
  if (error) throw new Error(`Failed to update dispute: ${error.message}`)
}

export async function upsertStake(stake: Omit<SupabaseStakeRow, 'created_at'>): Promise<void> {
  const { error } = await supabase
    .from('stakes')
    .upsert(stake, { onConflict: 'market_id,user,outcome_index' })
  if (error) throw new Error(`Failed to upsert stake: ${error.message}`)
}

export async function getUserStakes(marketId: string, user: string): Promise<SupabaseStakeRow[]> {
  const { data, error } = await supabase
    .from('stakes')
    .select('*')
    .eq('market_id', marketId)
    .eq('user', user)
    .gt('amount', 0)
  if (error) throw new Error(`Failed to fetch stakes: ${error.message}`)
  return data || []
}

export async function getAllUserStakes(user: string): Promise<SupabaseStakeRow[]> {
  const { data, error } = await supabase
    .from('stakes')
    .select('*')
    .eq('user', user)
    .gt('amount', 0)
  if (error) throw new Error(`Failed to fetch stakes: ${error.message}`)
  return data || []
}

export async function getLastSyncTime(): Promise<string | null> {
  const { data, error } = await supabase
    .from('sync_metadata')
    .select('last_sync')
    .single()
  if (error) return null
  return data.last_sync
}

export async function updateLastSyncTime(timestamp: string): Promise<void> {
  const { error } = await supabase
    .from('sync_metadata')
    .upsert({ id: 1, last_sync: timestamp }, { onConflict: 'id' })
  if (error) throw new Error(`Failed to update sync time: ${error.message}`)
}

export interface MarketPoolRow {
  market_id: string
  pools_json: string
  total_staked: number
  updated_at: string
}

export async function upsertMarketPools(marketId: string, pools: { outcomeIndex: number; amount: number }[]): Promise<void> {
  const totalStaked = pools.reduce((sum, p) => sum + p.amount, 0)
  const { error } = await supabase
    .from('market_pools')
    .upsert({
      market_id: marketId,
      pools_json: JSON.stringify(pools),
      total_staked: totalStaked,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'market_id' })
  if (error) throw new Error(`Failed to upsert market pools: ${error.message}`)
}

export async function getMarketPools(marketId: string): Promise<{ outcomeIndex: number; amount: number }[]> {
  const { data, error } = await supabase
    .from('market_pools')
    .select('pools_json')
    .eq('market_id', marketId)
    .single()
  if (error) return []
  try {
    return JSON.parse(data.pools_json)
  } catch {
    return []
  }
}

export async function getAllMarketPools(marketIds: string[]): Promise<Record<string, { outcomeIndex: number; amount: number }[]>> {
  if (marketIds.length === 0) return {}
  const { data, error } = await supabase
    .from('market_pools')
    .select('market_id, pools_json')
    .in('market_id', marketIds)
  if (error) return {}

  const result: Record<string, { outcomeIndex: number; amount: number }[]> = {}
  for (const row of data || []) {
    try {
      result[row.market_id] = JSON.parse(row.pools_json)
    } catch {
      // skip invalid
    }
  }
  return result
}
