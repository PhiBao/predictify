import { createGenLayerClient, switchToGenLayerNetwork } from '../lib/genlayer/client'
import type {
  GenLayerResolution,
  Dispute,
  Position,
  Trade,
} from '../types/market'

const CONTRACT_ADDRESS = import.meta.env.VITE_GENLAYER_CONTRACT || ''

function parseU256(raw: unknown): number {
  if (typeof raw === 'bigint') return Number(raw)
  if (typeof raw === 'number') return raw
  if (typeof raw === 'string') return Number(raw)
  const obj = raw as { value?: bigint | number | string }
  return Number(obj.value ?? 0)
}

function parseResolutionResult(raw: unknown, marketId: string): GenLayerResolution {
  const obj = raw as Record<string, unknown>
  return {
    id: 0,
    marketId,
    resolvedOutcome: String(obj.resolved_outcome || ''),
    outcomeIndex: parseU256(obj.resolved_outcome_index),
    confidence: parseU256(obj.confidence),
    reasoning: String(obj.reasoning || ''),
    timestamp: String(obj.timestamp || ''),
    txHash: '',
    status: obj.is_finalized === true ? 'finalized' : 'resolved',
    isFinalized: obj.is_finalized === true,
  }
}

function parseDisputeResult(raw: unknown, marketId: string): Dispute {
  const obj = raw as Record<string, unknown>
  return {
    id: 0,
    marketId,
    resolutionId: parseU256(obj.resolution_id),
    challenger: String(obj.challenger || ''),
    proposedOutcome: String(obj.proposed_outcome || ''),
    proposedOutcomeIndex: parseU256(obj.proposed_outcome_index),
    evidenceUrl: String(obj.evidence_url || ''),
    reasoning: String(obj.reasoning || ''),
    status: obj.is_valid === true ? 'accepted' : 'rejected',
    timestamp: String(obj.timestamp || ''),
    txHash: '',
  }
}

function parsePositionResult(raw: unknown): Position {
  const obj = raw as Record<string, unknown>
  return {
    marketId: String(obj.market_id || ''),
    user: String(obj.user || ''),
    outcomeIndex: parseU256(obj.outcome_index),
    shares: parseU256(obj.shares),
    avgPrice: parseU256(obj.avg_price),
  }
}

function parseTradeResult(raw: unknown): Trade {
  const obj = raw as Record<string, unknown>
  return {
    tradeId: parseU256(obj.trade_id),
    marketId: String(obj.market_id || ''),
    user: String(obj.user || ''),
    outcomeIndex: parseU256(obj.outcome_index),
    shares: parseU256(obj.shares),
    pricePerShare: parseU256(obj.price_per_share),
    totalCost: parseU256(obj.total_cost),
    tradeType: String(obj.trade_type || 'buy') as 'buy' | 'sell',
    timestamp: String(obj.timestamp || ''),
  }
}

async function pollTransaction(
  client: ReturnType<typeof createGenLayerClient>,
  txHash: string,
  onProgress?: (stage: string) => void
): Promise<boolean> {
  try {
    onProgress?.('proposing')
    const receipt = await client.waitForTransactionReceipt({
      hash: txHash as any,
      status: 'FINALIZED' as any,
      interval: 3000,
      retries: 200,
    })

    if (receipt.status === 'FINALIZED') {
      onProgress?.('completed')
      return true
    }
    return false
  } catch {
    return false
  }
}

export async function buyShares(
  account: string,
  marketId: string,
  question: string,
  outcomes: string[],
  endDate: string,
  outcomeIndex: number,
  amountGen: number,
  onProgress?: (stage: string) => void
): Promise<boolean> {
  if (!CONTRACT_ADDRESS) throw new Error('GenLayer contract address not configured')

  await switchToGenLayerNetwork()

  const client = createGenLayerClient(account as `0x${string}`)
  const amountWei = BigInt(Math.floor(amountGen * 1e18))
  const outcomesStr = outcomes.join(', ')

  onProgress?.('submitted')

  const txHash = await client.writeContract({
    address: CONTRACT_ADDRESS,
    functionName: 'buy_shares',
    args: [marketId, question, outcomesStr, endDate, BigInt(outcomeIndex)],
    value: amountWei,
  })

  const success = await pollTransaction(client, txHash, onProgress)
  if (!success) throw new Error('Buy shares transaction failed or timed out')
  return true
}

export async function sellShares(
  account: string,
  marketId: string,
  outcomeIndex: number,
  sharesAmount: number,
  onProgress?: (stage: string) => void
): Promise<boolean> {
  if (!CONTRACT_ADDRESS) throw new Error('GenLayer contract address not configured')

  await switchToGenLayerNetwork()

  const client = createGenLayerClient(account as `0x${string}`)

  onProgress?.('submitted')

  const txHash = await client.writeContract({
    address: CONTRACT_ADDRESS,
    functionName: 'sell_shares',
    args: [marketId, BigInt(outcomeIndex), BigInt(sharesAmount)],
    value: 0n,
  })

  const success = await pollTransaction(client, txHash, onProgress)
  if (!success) throw new Error('Sell shares transaction failed or timed out')
  return true
}

export async function resolveMarket(
  marketId: string,
  feeGen: number,
  onProgress?: (stage: string) => void
): Promise<GenLayerResolution | null> {
  if (!CONTRACT_ADDRESS) throw new Error('GenLayer contract address not configured')

  await switchToGenLayerNetwork()

  const client = createGenLayerClient()
  const feeWei = BigInt(Math.floor(feeGen * 1e18))

  onProgress?.('submitted')

  const txHash = await client.writeContract({
    address: CONTRACT_ADDRESS,
    functionName: 'resolve_market',
    args: [marketId],
    value: feeWei,
  })

  const success = await pollTransaction(client, txHash, onProgress)
  if (!success) throw new Error('Resolution transaction failed or timed out')

  onProgress?.('fetching_result')

  const countAfter = parseU256(
    await client.readContract({
      address: CONTRACT_ADDRESS,
      functionName: 'get_resolution_count',
      args: [],
    })
  )

  for (let i = countAfter; i >= Math.max(1, countAfter - 3); i--) {
    try {
      const raw = await client.readContract({
        address: CONTRACT_ADDRESS,
        functionName: 'get_resolution',
        args: [BigInt(i)],
      })
      const parsed = parseResolutionResult(raw, marketId)
      if (parsed.resolvedOutcome && parsed.resolvedOutcome.length > 0) {
        parsed.id = i
        parsed.txHash = txHash
        return parsed
      }
    } catch {
      continue
    }
  }

  throw new Error('Resolution completed but result could not be retrieved')
}

export async function disputeResolution(
  resolutionId: number,
  marketId: string,
  evidenceUrl: string,
  reasoning: string,
  feeGen: number,
  onProgress?: (stage: string) => void
): Promise<Dispute | null> {
  if (!CONTRACT_ADDRESS) throw new Error('GenLayer contract address not configured')

  await switchToGenLayerNetwork()

  const client = createGenLayerClient()
  const feeWei = BigInt(Math.floor(feeGen * 1e18))

  onProgress?.('submitted')

  const txHash = await client.writeContract({
    address: CONTRACT_ADDRESS,
    functionName: 'dispute_resolution',
    args: [BigInt(resolutionId), marketId, evidenceUrl, reasoning],
    value: feeWei,
  })

  const success = await pollTransaction(client, txHash, onProgress)
  if (!success) throw new Error('Dispute transaction failed or timed out')

  onProgress?.('fetching_result')

  const countAfter = parseU256(
    await client.readContract({
      address: CONTRACT_ADDRESS,
      functionName: 'get_dispute_count',
      args: [],
    })
  )

  for (let i = countAfter; i >= Math.max(1, countAfter - 3); i--) {
    try {
      const raw = await client.readContract({
        address: CONTRACT_ADDRESS,
        functionName: 'get_dispute',
        args: [BigInt(i)],
      })
      const parsed = parseDisputeResult(raw, marketId)
      if (parsed.proposedOutcome && parsed.proposedOutcome.length > 0) {
        parsed.id = i
        parsed.txHash = txHash
        return parsed
      }
    } catch {
      continue
    }
  }

  throw new Error('Dispute completed but result could not be retrieved')
}

export async function getPosition(marketId: string, user: string, outcomeIndex: number): Promise<Position | null> {
  if (!CONTRACT_ADDRESS) return null

  const client = createGenLayerClient()

  try {
    const raw = await client.readContract({
      address: CONTRACT_ADDRESS,
      functionName: 'get_position',
      args: [marketId, user, BigInt(outcomeIndex)],
    })

    if (!raw) return null

    const parsed = parsePositionResult(raw)
    return parsed
  } catch {
    return null
  }
}

export async function getUserPositions(marketId: string, user: string): Promise<Position[]> {
  if (!CONTRACT_ADDRESS) return []

  const client = createGenLayerClient()

  try {
    const raw = await client.readContract({
      address: CONTRACT_ADDRESS,
      functionName: 'get_user_positions',
      args: [marketId, user],
    })

    if (!Array.isArray(raw)) return []

    return raw.map(parsePositionResult)
  } catch {
    return []
  }
}

export async function getResolution(marketId: string): Promise<GenLayerResolution | null> {
  if (!CONTRACT_ADDRESS) return null

  const client = createGenLayerClient()

  try {
    const raw = await client.readContract({
      address: CONTRACT_ADDRESS,
      functionName: 'get_resolution_by_market',
      args: [marketId],
    })

    if (!raw) return null

    const parsed = parseResolutionResult(raw, marketId)
    return parsed
  } catch {
    return null
  }
}

export async function getMarketTrades(marketId: string): Promise<Trade[]> {
  if (!CONTRACT_ADDRESS) return []

  const client = createGenLayerClient()

  try {
    const raw = await client.readContract({
      address: CONTRACT_ADDRESS,
      functionName: 'get_market_trades',
      args: [marketId],
    })

    if (!Array.isArray(raw)) return []

    return raw.map(parseTradeResult)
  } catch {
    return []
  }
}

export async function getMinFees(): Promise<{ resolution: number; dispute: number }> {
  if (!CONTRACT_ADDRESS) {
    return { resolution: 2, dispute: 0.5 }
  }

  const client = createGenLayerClient()

  const [resolutionRaw, disputeRaw] = await Promise.all([
    client.readContract({
      address: CONTRACT_ADDRESS,
      functionName: 'get_min_resolution_fee',
      args: [],
    }),
    client.readContract({
      address: CONTRACT_ADDRESS,
      functionName: 'get_min_dispute_fee',
      args: [],
    }),
  ])

  return {
    resolution: parseU256(resolutionRaw) / 1e18,
    dispute: parseU256(disputeRaw) / 1e18,
  }
}

export { switchToGenLayerNetwork }
