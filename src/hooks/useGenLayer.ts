import { useState, useCallback } from 'react';
import { analyzeMarket, getMinFee, MIN_ANALYSIS_FEE_WEI, type MarketAnalysis, type AnalysisRequest, type PollProgress } from '../services/genlayer';

interface UseGenLayerAnalysisReturn {
  analysis: MarketAnalysis | null;
  loading: boolean;
  error: string | null;
  txStatus: string | null;
  progress: PollProgress | null;
  minFee: bigint;
  analyze: (request: AnalysisRequest, feeGen: string, address: string) => Promise<void>;
  reset: () => void;
  fetchMinFee: () => Promise<void>;
}

export function useGenLayerAnalysis(): UseGenLayerAnalysisReturn {
  const [analysis, setAnalysis] = useState<MarketAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txStatus, setTxStatus] = useState<string | null>(null);
  const [progress, setProgress] = useState<PollProgress | null>(null);
  const [minFee, setMinFee] = useState<bigint>(MIN_ANALYSIS_FEE_WEI);

  const fetchMinFee = useCallback(async () => {
    try {
      const fee = await getMinFee();
      setMinFee(fee);
    } catch (err) {
      console.error('Failed to fetch min fee:', err);
      setMinFee(MIN_ANALYSIS_FEE_WEI);
    }
  }, []);

  const analyze = useCallback(async (request: AnalysisRequest, feeGen: string, address: string) => {
    setLoading(true);
    setError(null);
    setAnalysis(null);
    setTxStatus('Submitting...');
    setProgress(null);

    try {
      const feeNum = parseFloat(feeGen);
      if (isNaN(feeNum) || feeNum <= 0) {
        throw new Error('Invalid GEN amount');
      }
      const feeWei = BigInt(Math.floor(feeNum * 10 ** 18));

      const result = await analyzeMarket(request, feeWei, address, (p) => {
        setProgress(p);
        const elapsed = 'elapsedSec' in p ? ` (${p.elapsedSec}s)` : '';
        if (p.stage === 'submitted') setTxStatus('Submitted to GenLayer validators' + elapsed);
        else if (p.stage === 'proposing') setTxStatus('Leader validator proposing result' + elapsed);
        else if (p.stage === 'verifying') setTxStatus('Consensus validators verifying' + elapsed);
        else if (p.stage === 'finalizing') setTxStatus('Finalizing on-chain' + elapsed);
        else if (p.stage === 'completed') setTxStatus('Result finalized on-chain' + elapsed);
        else if (p.stage === 'fetching_result') setTxStatus(`Fetching result from contract (attempt ${p.attempt})...`);
      });

      setAnalysis(result);
      setTxStatus('Finalized');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'GenLayer analysis failed';
      setError(message);
      setTxStatus('Failed');
      console.error('GenLayer analysis error:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const reset = useCallback(() => {
    setAnalysis(null);
    setError(null);
    setLoading(false);
    setTxStatus(null);
    setProgress(null);
  }, []);

  return {
    analysis,
    loading,
    error,
    txStatus,
    progress,
    minFee,
    analyze,
    reset,
    fetchMinFee,
  };
}
