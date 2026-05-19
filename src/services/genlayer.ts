import { createGenLayerClient, switchToGenLayerNetwork, GENLAYER_NETWORK } from '../lib/genlayer/client'
import type {
  GenLayerResolution,
  Dispute,
  Stake,
  PoolEntry,
} from '../types/market'

const CONTRACT_ADDRESS = import.meta.env.VITE_GENLAYER_CONTRACT || ''
const RPC_URL = GENLAYER_NETWORK.rpcUrls[0] || 'https://studio.genlayer.com/api'

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

function parseStakeResult(raw: unknown): Stake {
  const obj = raw as Record<string, unknown>
  return {
    marketId: String(obj.market_id || ''),
    user: String(obj.user || ''),
    outcomeIndex: parseU256(obj.outcome_index),
    amount: parseU256(obj.amount),
  }
}

function parsePoolResult(raw: unknown): PoolEntry {
  const obj = raw as Record<string, unknown>
  return {
    outcomeIndex: parseU256(obj.outcome_index),
    amount: parseU256(obj.amount),
  }
}

async function pollTransaction(
  client: ReturnType<typeof createGenLayerClient>,
  txHash: string,
  onProgress?: (stage: string) => void
): Promise<boolean> {
  try {
    onProgress?.('proposing')
    console.log('[GenLayer] Waiting for receipt, txHash:', txHash)

    const receipt = await client.waitForTransactionReceipt({
      hash: txHash as any,
      status: 'FINALIZED' as any,
      interval: 3000,
      retries: 200,
    })

    console.log('[GenLayer] Receipt received:', receipt?.status)
    const isFinalized = receipt.status === 'FINALIZED' || receipt.status === 7
    if (isFinalized) {
      onProgress?.('completed')
      return true
    }
    console.warn('[GenLayer] Receipt status not FINALIZED:', receipt.status)
    return false
  } catch (err) {
    console.error('[GenLayer] waitForTransactionReceipt error:', err)
    console.log('[GenLayer] Falling back to raw RPC polling...')

    for (let i = 0; i < 100; i++) {
      await new Promise((resolve) => setTimeout(resolve, 3000))
      try {
        const response = await fetch(RPC_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            method: 'eth_getTransactionReceipt',
            params: [txHash],
            id: 1,
          }),
        })
        const json = await response.json()
        if (json.result) {
          console.log('[GenLayer] Raw RPC receipt:', json.result)
          const statusOk = json.result.status === '0x1' || json.result.status === 1 || json.result.status === '0x7' || json.result.status === 7
          if (statusOk) {
            onProgress?.('completed')
            return true
          }
          return false
        }
      } catch (fetchErr) {
        console.log('[GenLayer] RPC poll attempt', i + 1, 'failed:', fetchErr)
      }
      if (i < 10) onProgress?.('proposing')
      else if (i < 50) onProgress?.('verifying')
      else onProgress?.('finalizing')
    }

    console.warn('[GenLayer] Polling timed out after 100 attempts')
    return false
  }
}

export async function stake(
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

  console.log('[GenLayer] Stake params:', { marketId, outcomeIndex, amountGen, amountWei, contract: CONTRACT_ADDRESS })

  onProgress?.('submitted')

  // Single tx: stake auto-registers market if missing
  const txHash = await client.writeContract({
    address: CONTRACT_ADDRESS,
    functionName: 'stake',
    args: [marketId, question, outcomesStr, endDate, BigInt(outcomeIndex)],
    value: amountWei,
  })

  console.log('[GenLayer] Stake txHash:', txHash)

  const success = await pollTransaction(client, txHash, onProgress)
  if (!success) throw new Error('Stake transaction failed or timed out')

  return true
}

export async function getPoolsWithRetry(marketId: string, retries = 3, delayMs = 3000): Promise<PoolEntry[]> {
  for (let i = 0; i < retries; i++) {
    const pools = await getPools(marketId)
    if (pools.length > 0 && pools.some((p) => p.amount > 0)) {
      return pools
    }
    if (i < retries - 1) {
      await new Promise((resolve) => setTimeout(resolve, delayMs))
    }
  }
  return []
}

export async function claim(
  account: string,
  marketId: string,
  _outcomeIndex: number,
  onProgress?: (stage: string) => void
): Promise<boolean> {
  if (!CONTRACT_ADDRESS) throw new Error('GenLayer contract address not configured')

  await switchToGenLayerNetwork()

  const client = createGenLayerClient(account as `0x${string}`)

  onProgress?.('submitted')

  const txHash = await client.writeContract({
    address: CONTRACT_ADDRESS,
    functionName: 'claim_winnings',
    args: [marketId],
    value: 0n,
  })

  const success = await pollTransaction(client, txHash, onProgress)
  if (!success) throw new Error('Claim transaction failed or timed out')
  return true
}

export async function resolveMarket(
  marketId: string,
  outcomeIndex: number,
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
    args: [marketId, BigInt(outcomeIndex)],
    value: feeWei,
  })

  const success = await pollTransaction(client, txHash, onProgress)
  if (!success) throw new Error('Resolution transaction failed or timed out')

  onProgress?.('fetching_result')

  const marketRaw = await client.readContract({
    address: CONTRACT_ADDRESS,
    functionName: 'get_market',
    args: [marketId],
  })

  const market = marketRaw as Record<string, unknown> | null
  if (market && market.resolved_outcome !== undefined) {
    return {
      id: 0,
      marketId,
      resolvedOutcome: String(market.resolved_outcome || ''),
      outcomeIndex: parseU256(market.resolved_outcome_index),
      confidence: 100,
      reasoning: '',
      timestamp: new Date().toISOString(),
      txHash,
      status: 'finalized',
      isFinalized: true,
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

export async function getUserStakes(marketId: string, user: string): Promise<Stake[]> {
  if (!CONTRACT_ADDRESS) return []

  const client = createGenLayerClient()

  try {
    const raw = await client.readContract({
      address: CONTRACT_ADDRESS,
      functionName: 'get_user_stakes',
      args: [marketId, user as any],
    })

    if (!Array.isArray(raw)) return []

    return raw.map(parseStakeResult)
  } catch {
    return []
  }
}

export async function getPools(marketId: string): Promise<PoolEntry[]> {
  if (!CONTRACT_ADDRESS) return []

  const client = createGenLayerClient()

  try {
    const raw = await client.readContract({
      address: CONTRACT_ADDRESS,
      functionName: 'get_all_pools',
      args: [marketId],
    })

    console.log('[GenLayer] getPools raw:', JSON.stringify(raw))

    if (!Array.isArray(raw)) return []

    return raw.map(parsePoolResult)
  } catch (err) {
    console.error('[GenLayer] getPools error:', err)
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
