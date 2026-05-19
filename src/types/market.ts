export type MarketStatus = 'active' | 'resolved' | 'closed' | 'disputed'

export type ResolutionStatus = 'pending' | 'resolving' | 'resolved' | 'disputed' | 'finalized'

export interface Outcome {
  id: string
  name: string
  price: number
  probability: number
  volume: number
}

export interface PolymarketMarket {
  id: string
  conditionId: string
  question: string
  description: string
  slug: string
  category: string
  tags: string[]
  outcomes: string[]
  outcomePrices: string[]
  probabilities: number[]
  volume: number
  volume24h: number
  liquidity: number
  status: MarketStatus
  closeDate: string
  endDate: string
  image: string
  icon: string
  resolutionSource: string
  groupSlug?: string
  groupName?: string
}

export interface GenLayerResolution {
  id: number
  marketId: string
  resolvedOutcome: string
  outcomeIndex: number
  confidence: number
  reasoning: string
  timestamp: string
  txHash: string
  status: ResolutionStatus
  isFinalized: boolean
}

export interface Dispute {
  id: number
  marketId: string
  resolutionId: number
  challenger: string
  proposedOutcome: string
  proposedOutcomeIndex: number
  evidenceUrl: string
  reasoning: string
  status: 'pending' | 'under_review' | 'accepted' | 'rejected'
  timestamp: string
  txHash: string
}

export interface Stake {
  marketId: string
  user: string
  outcomeIndex: number
  amount: number
}

export interface PoolEntry {
  outcomeIndex: number
  amount: number
}

export interface MarketWithGenLayer extends PolymarketMarket {
  resolution?: GenLayerResolution
  disputes?: Dispute[]
  userStakes?: Stake[]
  pools?: PoolEntry[]
  totalPool?: number
  hasActiveDispute: boolean
}

export interface SupabaseMarketRow {
  id: string
  condition_id: string
  question: string
  description: string
  slug: string
  category: string
  tags: string[]
  outcomes: string[]
  outcome_prices: string[]
  probabilities: number[]
  volume: number
  volume_24h: number
  liquidity: number
  status: MarketStatus
  close_date: string
  end_date: string
  image: string
  icon: string
  resolution_source: string
  group_slug: string | null
  group_name: string | null
  last_synced: string
  created_at: string
  updated_at: string
}

export interface SupabaseResolutionRow {
  id: number
  market_id: string
  resolved_outcome: string
  outcome_index: number
  confidence: number
  reasoning: string
  timestamp: string
  tx_hash: string
  status: ResolutionStatus
  is_finalized: boolean
  created_at: string
}

export interface SupabaseDisputeRow {
  id: number
  market_id: string
  resolution_id: number
  challenger: string
  proposed_outcome: string
  proposed_outcome_index: number
  evidence_url: string
  reasoning: string
  status: string
  timestamp: string
  tx_hash: string
  created_at: string
}

export interface SupabaseStakeRow {
  id: number
  market_id: string
  user: string
  outcome_index: number
  amount: number
  created_at: string
}

export type MarketFilter = 'active' | 'resolved' | 'trending' | 'closing-soon'

export function formatPriceLevel(price: number): string {
  if (price >= 0.99) return '99¢'
  if (price >= 0.10) return `${Math.round(price * 100)}¢`
  return `${(price * 100).toFixed(1)}¢`
}

export function formatVolume(volume: number): string {
  if (volume >= 1_000_000) return `$${(volume / 1_000_000).toFixed(1)}M`
  if (volume >= 1_000) return `$${(volume / 1_000).toFixed(1)}K`
  return `$${volume.toFixed(0)}`
}

export function formatGen(wei: number): string {
  const gen = wei / 1e18
  if (gen >= 1000) return `${(gen / 1000).toFixed(1)}K GEN`
  return `${gen.toFixed(2)} GEN`
}
