import { createGenLayerClient, switchToGenLayerNetwork, switchToBSC } from '../lib/genlayer/client'
import type {
  GenLayerAnalysis,
  GenLayerResolution,
  Dispute,
} from '../types/market'

const TransactionStatus = {
  UNINITIALIZED: 'UNINITIALIZED',
  PENDING: 'PENDING',
  PROPOSING: 'PROPOSING',
  COMMITTING: 'COMMITTING',
  GRACE: 'GRACE',
  FINALIZED: 'FINALIZED',
  FAILED: 'FAILED',
} as const

const CONTRACT_ADDRESS = import.meta.env.VITE_GENLAYER_CONTRACT || ''

function parseU256(raw: unknown): number {
  if (typeof raw === 'bigint') return Number(raw)
  if (typeof raw === 'number') return raw
  if (typeof raw === 'string') return Number(raw)
  const obj = raw as { value?: bigint | number | string }
  return Number(obj.value ?? 0)
}

function parseJsonField(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : [raw]
  } catch {
    return [raw]
  }
}

function parseAnalysisResult(raw: unknown): GenLayerAnalysis {
  const obj = raw as Record<string, unknown>
  return {
    id: 0,
    marketId: '',
    sentiment: String(obj.sentiment || 'neutral'),
    confidence: parseU256(obj.confidence),
    summary: String(obj.summary || ''),
    keyFactors: parseJsonField(String(obj.key_factors || '[]')),
    riskLevel: String(obj.risk_level || 'medium'),
    recommendedAction: String(obj.recommended_action || ''),
    timestamp: String(obj.timestamp || ''),
    txHash: '',
  }
}

function parseResolutionResult(raw: unknown, marketId: string): GenLayerResolution {
  const obj = raw as Record<string, unknown>
  return {
    id: 0,
    marketId,
    resolvedOutcome: String(obj.resolved_outcome || ''),
    outcomeIndex: parseU256(obj.outcome_index),
    confidence: parseU256(obj.confidence),
    reasoning: String(obj.reasoning || ''),
    evidence: parseJsonField(String(obj.evidence || '[]')),
    timestamp: String(obj.timestamp || ''),
    txHash: '',
    status: obj.is_finalized === true ? 'finalized' : 'resolved',
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
    evidence: String(obj.evidence || ''),
    reasoning: String(obj.reasoning || ''),
    status: obj.is_valid === true ? 'accepted' : 'rejected',
    timestamp: String(obj.timestamp || ''),
    txHash: '',
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
      hash: txHash,
      status: TransactionStatus.FINALIZED,
      interval: 3000,
      retries: 200,
    })

    if (receipt.status === 'success' || receipt.status === TransactionStatus.FINALIZED) {
      onProgress?.('completed')
      return true
    }
    return false
  } catch {
    return false
  }
}

export async function analyzeMarket(
  question: string,
  description: string,
  outcomes: string[],
  feeGen: number,
  onProgress?: (stage: string) => void
): Promise<GenLayerAnalysis | null> {
  if (!CONTRACT_ADDRESS) throw new Error('GenLayer contract address not configured')

  await switchToGenLayerNetwork()

  const client = createGenLayerClient()
  const feeWei = BigInt(Math.floor(feeGen * 1e18))

  onProgress?.('submitted')

  const txHash = await client.writeContract({
    address: CONTRACT_ADDRESS,
    functionName: 'analyze_market',
    args: [question, description, outcomes],
    value: feeWei,
  })

  const success = await pollTransaction(client, txHash, onProgress)
  if (!success) throw new Error('Analysis transaction failed or timed out')

  onProgress?.('fetching_result')

  const countAfter = parseU256(
    await client.readContract({
      address: CONTRACT_ADDRESS,
      functionName: 'get_analysis_count',
      args: [],
    })
  )

  for (let i = countAfter; i >= Math.max(1, countAfter - 3); i--) {
    try {
      const raw = await client.readContract({
        address: CONTRACT_ADDRESS,
        functionName: 'get_analysis',
        args: [BigInt(i)],
      })
      const parsed = parseAnalysisResult(raw)
      if (parsed.sentiment && parsed.sentiment !== 'neutral') {
        parsed.id = i
        parsed.txHash = txHash
        return parsed
      }
      if (parsed.summary && parsed.summary.length > 10) {
        parsed.id = i
        parsed.txHash = txHash
        return parsed
      }
    } catch {
      continue
    }
  }

  throw new Error('Analysis completed but result could not be retrieved')
}

export async function resolveMarket(
  marketId: string,
  question: string,
  description: string,
  outcomes: string[],
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
    args: [marketId, question, description, outcomes],
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
  outcomes: string[],
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
    args: [BigInt(resolutionId), marketId, outcomes],
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

export async function getAnalysis(_marketId: string): Promise<GenLayerAnalysis | null> {
  if (!CONTRACT_ADDRESS) return null

  const client = createGenLayerClient()
  const count = parseU256(
    await client.readContract({
      address: CONTRACT_ADDRESS,
      functionName: 'get_analysis_count',
      args: [],
    })
  )

  for (let i = count; i >= Math.max(1, count - 10); i--) {
    try {
      const raw = await client.readContract({
        address: CONTRACT_ADDRESS,
        functionName: 'get_analysis',
        args: [BigInt(i)],
      })
      const parsed = parseAnalysisResult(raw)
      parsed.id = i
      if (parsed.summary && parsed.summary.length > 10) {
        return parsed
      }
    } catch {
      continue
    }
  }

  return null
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

export async function getMinFees(): Promise<{ analysis: number; resolution: number; dispute: number }> {
  if (!CONTRACT_ADDRESS) {
    return { analysis: 1, resolution: 2, dispute: 0.5 }
  }

  const client = createGenLayerClient()

  const [analysisRaw, resolutionRaw, disputeRaw] = await Promise.all([
    client.readContract({
      address: CONTRACT_ADDRESS,
      functionName: 'get_min_analysis_fee',
      args: [],
    }),
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
    analysis: parseU256(analysisRaw) / 1e18,
    resolution: parseU256(resolutionRaw) / 1e18,
    dispute: parseU256(disputeRaw) / 1e18,
  }
}

export { switchToGenLayerNetwork, switchToBSC }
