import { createGenLayerClient, getContractAddress } from '../lib/genlayer/client';
import { TransactionStatus } from 'genlayer-js/types';

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

/** Parse an AnalysisResult Map into our frontend type */
function parseAnalysisResult(raw: unknown): MarketAnalysis {
  const obj = mapToObject(raw);
  const factors = obj.key_factors;
  const keyFactors = Array.isArray(factors)
    ? factors.map(f => String(f))
    : [];

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
  | { stage: 'finalizing'; elapsedSec: number };

/**
 * Poll a GenLayer transaction until it reaches a decided state.
 */
export async function pollTransaction(
  txHash: string,
  options?: { intervalMs?: number; timeoutMs?: number; onProgress?: (p: PollProgress) => void }
): Promise<unknown> {
  const intervalMs = options?.intervalMs ?? 2000;
  const timeoutMs = options?.timeoutMs ?? 600000; // 10 minutes
  const onProgress = options?.onProgress;
  const client = createGenLayerClient();
  const start = Date.now();

  onProgress?.({ stage: 'submitted', txHash });

  while (Date.now() - start < timeoutMs) {
    const tx = await client.getTransaction({ hash: txHash as `0x${string}` });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const txData = tx as any;
    const status = txData?.status ?? txData?.statusName;
    const elapsedSec = Math.floor((Date.now() - start) / 1000);

    if (
      status === TransactionStatus.ACCEPTED ||
      status === TransactionStatus.FINALIZED ||
      status === 'ACCEPTED' ||
      status === 'FINALIZED'
    ) {
      return tx;
    }

    if (
      status === TransactionStatus.UNDETERMINED ||
      status === 'UNDETERMINED'
    ) {
      throw new Error('Transaction was undetermined by validators');
    }

    // Report progress based on elapsed time
    if (elapsedSec < 15) {
      onProgress?.({ stage: 'proposing', elapsedSec });
    } else if (elapsedSec < 45) {
      onProgress?.({ stage: 'verifying', elapsedSec });
    } else {
      onProgress?.({ stage: 'finalizing', elapsedSec });
    }

    await new Promise(r => setTimeout(r, intervalMs));
  }

  throw new Error('Transaction polling timed out after 10 minutes. The GenLayer network may be congested. You can check your transaction status in GenLayer Studio.');
}

/**
 * Call the GenLayer MarketAnalyzer contract to perform AI analysis.
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

  // 1. Submit the analysis transaction (sends native GEN)
  const txHash = await client.writeContract({
    address: GENLAYER_CONTRACT_ADDRESS as `0x${string}`,
    functionName: 'analyze_market',
    args: [
      request.marketQuestion,
      request.marketDescription,
      request.outcomeNames,
    ],
    value: feeWei,
    leaderOnly: false,
  });

  // 2. Poll for transaction completion
  const tx = await pollTransaction(txHash, { onProgress });

  // 3. Extract result from transaction data
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const txData = tx as any;
  const resultRaw =
    txData?.result ??
    txData?.data?.result ??
    txData?.leaderReceipt?.result ??
    txData?.calldata;

  if (!resultRaw) {
    throw new Error('Could not extract analysis result from transaction');
  }

  return parseAnalysisResult(resultRaw);
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

  return BigInt((result as { value?: bigint }).value ?? MIN_ANALYSIS_FEE_WEI);
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

  return Number((result as { value?: bigint }).value ?? 0);
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
