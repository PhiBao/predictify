import { TransactionStatus, ExecutionResult } from 'genlayer-js/types';
import { createGenLayerClient, getContractAddress } from '../lib/genlayer/client';

export const GENLAYER_CONTRACT_ADDRESS = getContractAddress();

/** Minimum fee in wei (1 GEN = 10^18 wei) */
export const MIN_ANALYSIS_FEE_WEI = BigInt(1 * 10 ** 18);

export interface MarketAnalysis {
  sentiment: 'bullish' | 'bearish' | 'neutral';
  confidence: number;
  summary: string;
  keyFactors: string[];
  riskLevel: 'low' | 'medium' | 'high';
  recommendedAction: string;
  timestamp: string;
  analyst: string;
}

export interface AnalysisRequest {
  marketQuestion: string;
  marketDescription: string;
  category: string;
  outcomeNames: string[];
}

/** Convert a JS Map (returned by readContract) to a plain object */
function mapToObject(map: unknown): Record<string, unknown> {
  if (!(map instanceof Map)) {
    return map as Record<string, unknown>;
  }
  const obj: Record<string, unknown> = {};
  map.forEach((value, key) => {
    obj[key as string] = value instanceof Map ? mapToObject(value) : value;
  });
  return obj;
}

/**
 * Parse a u256 value returned by genlayer-js readContract.
 * genlayer-js returns primitive types directly (bigint for u256),
 * NOT wrapped in { value: bigint }.
 */
function parseU256(raw: unknown): number {
  if (typeof raw === 'bigint') return Number(raw);
  if (typeof raw === 'number') return raw;
  if (typeof raw === 'string') return Number(raw);
  // Fallback for object-wrapped values (future SDK versions)
  const obj = raw as { value?: bigint | number | string };
  if (obj.value !== undefined) {
    return typeof obj.value === 'bigint' ? Number(obj.value) : Number(obj.value);
  }
  return 0;
}

/** Parse an AnalysisResult Map/dict into our frontend type */
function parseAnalysisResult(raw: unknown): MarketAnalysis {
  const obj = mapToObject(raw);

  // key_factors may be an array (old contract) or a JSON string (new contract)
  let keyFactors: string[] = [];
  const factors = obj.key_factors;
  if (typeof factors === 'string') {
    try {
      const parsed = JSON.parse(factors);
      if (Array.isArray(parsed)) {
        keyFactors = parsed.map(f => String(f));
      }
    } catch {
      // If not valid JSON, treat as single string
      keyFactors = [factors];
    }
  } else if (Array.isArray(factors)) {
    keyFactors = factors.map(f => String(f));
  }

  const sentiment = (obj.sentiment as string) || 'neutral';
  const riskLevel = (obj.risk_level as string) || 'medium';

  return {
    sentiment: (['bullish', 'bearish', 'neutral'].includes(sentiment) ? sentiment : 'neutral') as MarketAnalysis['sentiment'],
    confidence: Number(obj.confidence) || 0,
    summary: (obj.summary as string) || '',
    keyFactors,
    riskLevel: (['low', 'medium', 'high'].includes(riskLevel) ? riskLevel : 'medium') as MarketAnalysis['riskLevel'],
    recommendedAction: (obj.recommended_action as string) || '',
    timestamp: (obj.timestamp as string) || '',
    analyst: (obj.analyst as string) || '',
  };
}

export type PollProgress =
  | { stage: 'submitted'; txHash: string }
  | { stage: 'proposing'; elapsedSec: number }
  | { stage: 'verifying'; elapsedSec: number }
  | { stage: 'finalizing'; elapsedSec: number }
  | { stage: 'completed'; elapsedSec: number }
  | { stage: 'fetching_result'; elapsedSec: number; attempt: number };

interface GenLayerTxResponse {
  status?: string | number;
  statusName?: string;
  result?: unknown;
  txExecutionResult?: number;
  txExecutionResultName?: string;
  data?: { result?: unknown; calldata?: unknown };
  leaderReceipt?: { result?: unknown; calldata?: unknown };
  calldata?: unknown;
  execution_result?: string;
  consensus_data?: {
    votes?: Record<string, string>;
    leader_receipt?: Array<{ execution_result?: string; result?: unknown }>;
    validator_results?: Array<{ execution_result?: string; result?: unknown }>;
  };
}

/** Check if any validator or the leader had an execution error */
function hasExecutionError(tx: GenLayerTxResponse): boolean {
  // SDK-native receipt fields
  if (tx.txExecutionResultName === ExecutionResult.FINISHED_WITH_ERROR) return true;
  if (tx.txExecutionResult === 2) return true; // FINISHED_WITH_ERROR numeric value

  // Fallback for raw RPC responses
  if (tx.execution_result === 'ERROR') return true;
  const leaderReceipts = tx.consensus_data?.leader_receipt;
  if (Array.isArray(leaderReceipts)) {
    for (const r of leaderReceipts) {
      if (r?.execution_result === 'ERROR') return true;
    }
  }
  const validatorResults = tx.consensus_data?.validator_results;
  if (Array.isArray(validatorResults)) {
    for (const r of validatorResults) {
      if (r?.execution_result === 'ERROR') return true;
    }
  }
  return false;
}

/**
 * Poll a GenLayer transaction until it reaches a decided state.
 * Uses the SDK-native waitForTransactionReceipt (same pattern as gotham-court).
 */
export async function pollTransaction(
  txHash: string,
  options?: { intervalMs?: number; timeoutMs?: number; onProgress?: (p: PollProgress) => void }
): Promise<GenLayerTxResponse> {
  const timeoutMs = options?.timeoutMs ?? 600000; // 10 minutes
  const onProgress = options?.onProgress;
  const client = createGenLayerClient();
  const start = Date.now();

  onProgress?.({ stage: 'submitted', txHash });

  // Keep UI updated with progress while we wait for finalization
  const progressInterval = setInterval(() => {
    const elapsedSec = Math.floor((Date.now() - start) / 1000);
    if (elapsedSec < 15) {
      onProgress?.({ stage: 'proposing', elapsedSec });
    } else if (elapsedSec < 45) {
      onProgress?.({ stage: 'verifying', elapsedSec });
    } else {
      onProgress?.({ stage: 'finalizing', elapsedSec });
    }
  }, 2000);

  try {
    const receipt = await Promise.race([
      client.waitForTransactionReceipt({
        hash: txHash as `0x${string}`,
        status: TransactionStatus.FINALIZED,
        interval: 3000,
        retries: 200,
      }) as Promise<GenLayerTxResponse>,
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error('Transaction polling timed out after 10 minutes. The GenLayer network may be congested. You can check your transaction status in GenLayer Studio.')),
          timeoutMs
        )
      ),
    ]);

    const elapsedSec = Math.floor((Date.now() - start) / 1000);
    console.log('[GenLayer poll] Finalized after', elapsedSec, 'seconds');

    if (hasExecutionError(receipt)) {
      throw new Error(
        'Transaction finalized but contract execution failed. ' +
        'This usually means the contract threw an error. ' +
        'Check GenLayer Studio for detailed validator stderr logs.'
      );
    }

    onProgress?.({ stage: 'completed', elapsedSec });
    return receipt;
  } finally {
    clearInterval(progressInterval);
  }
}

/**
 * Call the GenLayer MarketAnalyzer contract to perform AI analysis.
 *
 * Strategy: read analysis count before tx, submit, poll for finalization,
 * then read get_analysis(count+1) with retries since state may need a moment
 * to propagate after finalization.
 */
export async function analyzeMarket(
  request: AnalysisRequest,
  feeWei: bigint,
  address: string,
  onProgress?: (p: PollProgress) => void
): Promise<MarketAnalysis> {
  if (!GENLAYER_CONTRACT_ADDRESS || GENLAYER_CONTRACT_ADDRESS === '0x0000000000000000000000000000000000000000') {
    throw new Error(
      'GenLayer contract address not configured. ' +
      'Set VITE_GENLAYER_ANALYSIS_CONTRACT in your .env file after deploying the contract.'
    );
  }

  if (feeWei < MIN_ANALYSIS_FEE_WEI) {
    throw new Error(`Minimum fee is 1 GEN (${MIN_ANALYSIS_FEE_WEI.toString()} wei)`);
  }

  const client = createGenLayerClient(address);

  // 1. Read current analysis count BEFORE submitting
  console.log('[GenLayer] Reading analysis count before tx...');
  const countBefore = await client.readContract({
    address: GENLAYER_CONTRACT_ADDRESS as `0x${string}`,
    functionName: 'get_analysis_count',
    args: [],
  });
  const countBeforeNum = parseU256(countBefore);
  console.log('[GenLayer] Count before:', countBeforeNum);

  // 2. Submit the analysis transaction (sends native GEN)
  console.log('[GenLayer] Submitting analyze_market tx...');
  const txHash = await client.writeContract({
    address: GENLAYER_CONTRACT_ADDRESS as `0x${string}`,
    functionName: 'analyze_market',
    args: [
      request.marketQuestion,
      request.marketDescription,
      request.outcomeNames,
    ],
    value: feeWei,
  });
  console.log('[GenLayer] Tx submitted:', txHash);

  // 3. Poll for transaction completion
  console.log('[GenLayer] Polling for finalization...');
  await pollTransaction(txHash, { onProgress });
  console.log('[GenLayer] Tx finalized.');

  // 4. Determine which analysis ID to read.
  //    The contract stores analyses sequentially. After finalization, read the
  //    post-tx count to know exactly which slot was just written.
  console.log('[GenLayer] Reading post-tx analysis count...');
  let countAfterNum: number;
  try {
    const countAfter = await client.readContract({
      address: GENLAYER_CONTRACT_ADDRESS as `0x${string}`,
      functionName: 'get_analysis_count',
      args: [],
    });
    countAfterNum = parseU256(countAfter);
    console.log('[GenLayer] Count after:', countAfterNum);
  } catch {
    countAfterNum = countBeforeNum + 1;
    console.log('[GenLayer] Failed to read post-tx count, assuming:', countAfterNum);
  }

  // Try multiple candidate IDs in order of likelihood.
  // The contract stores at index `analysis_count` (0-based) then increments.
  // get_analysis(N) likely returns the Nth stored item. We try the most
  // probable IDs and pick the first one with a non-empty sentiment.
  const candidateIds = Array.from(new Set([
    countAfterNum,          // Most likely: count after tx = next free slot
    countAfterNum - 1,      // Fallback: last stored slot
    countBeforeNum + 1,     // Legacy fallback
    countBeforeNum,         // Edge case
  ])).filter(id => id > 0);

  console.log('[GenLayer] Candidate analysis IDs:', candidateIds);

  const maxRetries = 5;
  const retryDelayMs = 2000;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    onProgress?.({ stage: 'fetching_result', elapsedSec: 0, attempt });

    for (const id of candidateIds) {
      try {
        console.log(`[GenLayer] Trying get_analysis(${id})...`);
        const result = await client.readContract({
          address: GENLAYER_CONTRACT_ADDRESS as `0x${string}`,
          functionName: 'get_analysis',
          args: [BigInt(id)],
        });

        console.log('[GenLayer] get_analysis raw result:', result);
        const parsed = parseAnalysisResult(result);
        console.log('[GenLayer] Parsed:', parsed);

        // Sanity check: if sentiment is empty, this ID might be stale/empty
        if (parsed.sentiment && parsed.sentiment !== 'neutral') {
          console.log(`[GenLayer] Analysis ID ${id} looks valid. Returning.`);
          return parsed;
        }

        // Even if sentiment is neutral, if we have a summary that's non-trivial, accept it
        if (parsed.summary && parsed.summary.length > 10) {
          console.log(`[GenLayer] Analysis ID ${id} has content. Returning.`);
          return parsed;
        }

        console.log(`[GenLayer] Analysis ID ${id} seems empty, trying next candidate...`);
      } catch (err) {
        console.warn(`[GenLayer] get_analysis(${id}) failed:`, err instanceof Error ? err.message : String(err));
      }
    }

    if (attempt < maxRetries) {
      console.log(`[GenLayer] All candidates empty on attempt ${attempt}, retrying in ${retryDelayMs}ms...`);
      await new Promise(r => setTimeout(r, retryDelayMs));
    }
  }

  throw new Error(
    `Failed to fetch a valid analysis result after ${maxRetries} attempts. ` +
    `Tried IDs: ${candidateIds.join(', ')}. ` +
    `The transaction finalized successfully but the stored analysis appears empty or unreadable. ` +
    `Check GenLayer Studio to verify the contract state.`
  );
}

/**
 * Get the current minimum fee from the contract.
 */
export async function getMinFee(): Promise<bigint> {
  if (!GENLAYER_CONTRACT_ADDRESS) return MIN_ANALYSIS_FEE_WEI;

  const client = createGenLayerClient();
  const result = await client.readContract({
    address: GENLAYER_CONTRACT_ADDRESS as `0x${string}`,
    functionName: 'get_min_fee',
    args: [],
  });

  return BigInt(parseU256(result) || MIN_ANALYSIS_FEE_WEI);
}

/**
 * Get the total number of analyses performed by the contract.
 */
export async function getAnalysisCount(): Promise<number> {
  if (!GENLAYER_CONTRACT_ADDRESS) return 0;

  const client = createGenLayerClient();
  const result = await client.readContract({
    address: GENLAYER_CONTRACT_ADDRESS as `0x${string}`,
    functionName: 'get_analysis_count',
    args: [],
  });

  return parseU256(result);
}

/**
 * Get a specific analysis by ID.
 */
export async function getAnalysis(analysisId: number): Promise<MarketAnalysis | null> {
  if (!GENLAYER_CONTRACT_ADDRESS) return null;

  const client = createGenLayerClient();
  try {
    const result = await client.readContract({
      address: GENLAYER_CONTRACT_ADDRESS as `0x${string}`,
      functionName: 'get_analysis',
      args: [BigInt(analysisId)],
    });
    return parseAnalysisResult(result);
  } catch {
    return null;
  }
}
