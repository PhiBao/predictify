import { createGenLayerClient, switchToGenLayerNetwork, GENLAYER_NETWORK } from '../lib/genlayer/client'
import type {
  GenLayerResolution,
  Dispute,
  Stake,
  PoolEntry,
} from '../types/market'
export type { Dispute, Stake }

const CONTRACT_ADDRESS = import.meta.env.VITE_GENLAYER_CONTRACT || ''
const RPC_URL = GENLAYER_NETWORK.rpcUrls[0] || 'https://studio.genlayer.com/api'

function parseU256(raw: unknown): number {
  if (typeof raw === 'bigint') return Number(raw)
  if (typeof raw === 'number') return raw
  if (typeof raw === 'string') return Number(raw)
  const obj = raw as { value?: bigint | number | string }
  return Number(obj.value ?? 0)
}

async function pollTransaction(
  client: ReturnType<typeof createGenLayerClient>,
  txHash: string,
  onProgress?: (stage: string) => void
): Promise<boolean> {
  try {
    onProgress?.('proposing')

    const receipt = await client.waitForTransactionReceipt({
      hash: txHash as `0x${string}`,
      status: 'FINALIZED',
      interval: 3000,
      retries: 200,
    } as Parameters<typeof client.waitForTransactionReceipt>[0])

    const isFinalized = receipt.status === 'FINALIZED' || receipt.status === 7
    if (isFinalized) {
      onProgress?.('completed')
      return true
    }
    return false
  } catch {
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
          const statusOk = json.result.status === '0x1' || json.result.status === 1 || json.result.status === '0x7' || json.result.status === 7
          if (statusOk) {
            onProgress?.('completed')
            return true
          }
          return false
        }
      } catch {
        // individual poll attempt failed, will retry
      }
      if (i < 10) onProgress?.('proposing')
      else if (i < 50) onProgress?.('verifying')
      else onProgress?.('finalizing')
    }

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

  onProgress?.('submitted')

  const txHash = await client.writeContract({
    address: CONTRACT_ADDRESS,
    functionName: 'stake',
    args: [marketId, question, outcomesStr, endDate, BigInt(outcomeIndex)],
    value: amountWei,
  })

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
  account: string,
  marketId: string,
  question: string,
  outcomes: string[],
  endDate: string,
  onProgress?: (stage: string) => void
): Promise<GenLayerResolution | null> {
  if (!CONTRACT_ADDRESS) throw new Error('GenLayer contract address not configured')

  await switchToGenLayerNetwork()

  const client = createGenLayerClient(account as `0x${string}`)
  const outcomesStr = outcomes.join(', ')

  onProgress?.('submitted')

  const txHash = await client.writeContract({
    address: CONTRACT_ADDRESS,
    functionName: 'resolve_market',
    args: [marketId, question, outcomesStr, endDate],
    value: 0n,
  })

  const success = await pollTransaction(client, txHash, onProgress)
  if (!success) throw new Error('Resolution transaction failed or timed out')

  onProgress?.('fetching_result')

  for (let attempt = 0; attempt < 200; attempt++) {
    try {
      const marketRaw = await client.readContract({
        address: CONTRACT_ADDRESS,
        functionName: 'get_market',
        args: [marketId],
      })

      let jsonStr = ''
      if (typeof marketRaw === 'string') {
        jsonStr = marketRaw
        if (jsonStr.startsWith('"') && jsonStr.endsWith('"')) {
          try { jsonStr = JSON.parse(jsonStr) } catch { /* keep as-is */ }
        }
      }

      if (!jsonStr || jsonStr === 'null' || jsonStr.length < 10) {
        await new Promise((r) => setTimeout(r, 3000))
        continue
      }

      const market = JSON.parse(jsonStr) as Record<string, unknown>

      if (market.is_resolved === true) {
        const outcomes = market.outcomes as string
        const outcomeList = outcomes.split(',').map((o) => o.trim())
        const outcomeIndex = parseU256(market.resolved_outcome_index)
        return {
          id: 0,
          marketId,
          resolvedOutcome: outcomeList[outcomeIndex] || `Outcome ${outcomeIndex + 1}`,
          outcomeIndex,
          confidence: 100,
          reasoning: String(market.resolution_reasoning || ''),
          timestamp: new Date().toISOString(),
          txHash,
          status: 'finalized',
          isFinalized: true,
        }
      }

      await new Promise((r) => setTimeout(r, 3000))
    } catch {
      await new Promise((r) => setTimeout(r, 3000))
    }
  }

  throw new Error('Resolution completed but state not yet propagated')
}

export async function disputeResolution(
  account: string,
  marketId: string,
  evidenceUrl: string,
  reasoning: string,
  feeGen: number,
  onProgress?: (stage: string) => void
): Promise<Dispute | null> {
  if (!CONTRACT_ADDRESS) throw new Error('GenLayer contract address not configured')

  await switchToGenLayerNetwork()

  const client = createGenLayerClient(account as `0x${string}`)
  const feeWei = BigInt(Math.floor(feeGen * 1e18))

  onProgress?.('submitted')

  const txHash = await client.writeContract({
    address: CONTRACT_ADDRESS,
    functionName: 'dispute_resolution',
    args: [marketId, evidenceUrl, reasoning],
    value: feeWei,
  })

  const success = await pollTransaction(client, txHash, onProgress)
  if (!success) throw new Error('Dispute transaction failed or timed out')

  onProgress?.('fetching_result')

  try {
    const parsed = await fetchDisputeFromContract(client, marketId, account)
    return {
      id: 0,
      marketId,
      challenger: String(parsed.challenger || account),
      proposedOutcome: '',
      proposedOutcomeIndex: parseU256(parsed.proposed_outcome_index),
      evidenceUrl: String(parsed.evidence_urls || ''),
      reasoning: String(parsed.reasoning || ''),
      status: parsed.is_valid ? 'accepted' : 'rejected',
      isValid: Boolean(parsed.is_valid),
      reviewed: Boolean(parsed.reviewed),
      judgmentReasoning: String(parsed.judgment_reasoning || ''),
      timestamp: new Date().toISOString(),
      txHash,
    }
  } catch {
    throw new Error('Dispute completed but result could not be retrieved')
  }
}

async function fetchDisputeFromContract(client: ReturnType<typeof createGenLayerClient>, marketId: string, user: string): Promise<Record<string, unknown>> {
  const raw = await client.readContract({
    address: CONTRACT_ADDRESS,
    functionName: 'get_dispute',
    args: [marketId, user],
  })
  const jsonStr = typeof raw === 'string' ? raw : String(raw ?? 'null')
  if (jsonStr === 'null' || !jsonStr) {
    throw new Error('Dispute record not found')
  }
  return JSON.parse(jsonStr) as Record<string, unknown>
}

export async function getDispute(marketId: string, user: string): Promise<Dispute | null> {
  if (!CONTRACT_ADDRESS) return null
  const client = createGenLayerClient()
  try {
    const parsed = await fetchDisputeFromContract(client, marketId, user)
    return {
      id: 0,
      marketId,
      challenger: String(parsed.challenger || user),
      proposedOutcome: '',
      proposedOutcomeIndex: parseU256(parsed.proposed_outcome_index),
      evidenceUrl: String(parsed.evidence_urls || ''),
      reasoning: String(parsed.reasoning || ''),
      status: parsed.is_valid ? 'accepted' : 'rejected',
      isValid: Boolean(parsed.is_valid),
      reviewed: Boolean(parsed.reviewed),
      judgmentReasoning: String(parsed.judgment_reasoning || ''),
      timestamp: new Date().toISOString(),
      txHash: '',
    }
  } catch {
    return null
  }
}

export async function getUserStakes(marketId: string, user: string): Promise<Stake[]> {
  if (!CONTRACT_ADDRESS) return []

  const client = createGenLayerClient()

  try {
    const raw = await client.readContract({
      address: CONTRACT_ADDRESS,
      functionName: 'get_user_stakes',
      args: [marketId, user],
    })

    const jsonStr = typeof raw === 'string' ? raw : String(raw ?? '[]')
    const parsed = JSON.parse(jsonStr) as Record<string, unknown>[]
    if (!Array.isArray(parsed)) return []

    return parsed.map((s) => ({
      marketId: String(s.market_id),
      user: String(s.user),
      outcomeIndex: parseU256(s.outcome_index),
      amount: parseU256(s.amount),
      claimed: Boolean(s.claimed),
    }))
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

    const jsonStr = typeof raw === 'string' ? raw : String(raw ?? '')
    const parsed = JSON.parse(jsonStr) as Record<string, unknown>[]
    if (!Array.isArray(parsed)) return []

    return parsed.map((p) => ({
      outcomeIndex: parseU256(p.outcome_index),
      amount: parseU256(p.amount),
    }))
  } catch {
    return []
  }
}

export async function getMarketState(marketId: string): Promise<Record<string, unknown> | null> {
  if (!CONTRACT_ADDRESS) return null

  const client = createGenLayerClient()

  try {
    const raw = await client.readContract({
      address: CONTRACT_ADDRESS,
      functionName: 'get_market',
      args: [marketId],
    })

    const jsonStr = typeof raw === 'string' ? raw : String(raw ?? 'null')
    if (jsonStr === 'null' || !jsonStr || jsonStr.length < 10) return null

    return JSON.parse(jsonStr) as Record<string, unknown>
  } catch {
    return null
  }
}

export async function getMinFees(): Promise<{ stake: number; dispute: number }> {
  if (!CONTRACT_ADDRESS) {
    return { stake: 0.001, dispute: 0.5 }
  }

  const client = createGenLayerClient()

  try {
    const [stakeRaw, disputeRaw] = await Promise.all([
      client.readContract({
        address: CONTRACT_ADDRESS,
        functionName: 'get_min_stake',
        args: [],
      }),
      client.readContract({
        address: CONTRACT_ADDRESS,
        functionName: 'get_min_dispute_fee',
        args: [],
      }),
    ])

    return {
      stake: parseU256(stakeRaw) / 1e18,
      dispute: parseU256(disputeRaw) / 1e18,
    }
  } catch {
    return { stake: 0.001, dispute: 0.5 }
  }
}

export { switchToGenLayerNetwork }
