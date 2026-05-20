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

      console.log(`[GenLayer] get_market (${attempt + 1}) type=${typeof marketRaw}:`, JSON.stringify(marketRaw).slice(0, 300))

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
    } catch (err) {
      console.error(`[GenLayer] get_market error (${attempt + 1}):`, err)
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

  console.log('[disputeResolution] Starting — switching to GenLayer network')
  await switchToGenLayerNetwork()
  console.log('[disputeResolution] Network switch done')

  const client = createGenLayerClient(account as `0x${string}`)
  const feeWei = BigInt(Math.floor(feeGen * 1e18))

  console.log('[disputeResolution] Calling writeContract with args:', { marketId, evidenceUrl: evidenceUrl.slice(0, 50), reasoning: reasoning.slice(0, 50), feeWei })
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
    const raw = await client.readContract({
      address: CONTRACT_ADDRESS,
      functionName: 'get_dispute',
      args: [marketId, account],
    })

    const jsonStr = typeof raw === 'string' ? raw : String(raw ?? 'null')
    if (jsonStr === 'null' || !jsonStr) {
      throw new Error('Dispute record not found')
    }

    const parsed = JSON.parse(jsonStr) as Record<string, unknown>
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
      timestamp: new Date().toISOString(),
      txHash,
    }
  } catch (err) {
    console.error('[GenLayer] Failed to fetch dispute result:', err)
    throw new Error('Dispute completed but result could not be retrieved')
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
    }))
  } catch (err) {
    console.error('[GenLayer] getUserStakes error:', err)
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
  } catch (err) {
    console.error('[GenLayer] getPools error:', err)
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
