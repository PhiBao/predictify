import { useState, useCallback } from 'react'
import {
  analyzeMarket,
  resolveMarket,
  disputeResolution,
  getMinFees,
} from '../services/genlayer'
import type { GenLayerAnalysis, GenLayerResolution, Dispute } from '../types/market'

interface UseGenLayerReturn {
  analysis: GenLayerAnalysis | null
  resolution: GenLayerResolution | null
  disputeResult: Dispute | null
  loading: boolean
  error: string | null
  txStatus: string | null
  minFees: { analysis: number; resolution: number; dispute: number }
  analyze: (question: string, description: string, outcomes: string[], feeGen?: number) => Promise<GenLayerAnalysis | null>
  resolve: (marketId: string, question: string, description: string, outcomes: string[], feeGen?: number) => Promise<GenLayerResolution | null>
  submitDispute: (resolutionId: number, marketId: string, outcomes: string[], feeGen?: number) => Promise<Dispute | null>
  reset: () => void
  fetchMinFees: () => Promise<void>
}

export function useGenLayer(): UseGenLayerReturn {
  const [analysis, setAnalysis] = useState<GenLayerAnalysis | null>(null)
  const [resolution, setResolution] = useState<GenLayerResolution | null>(null)
  const [disputeResult, setDisputeResult] = useState<Dispute | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [txStatus, setTxStatus] = useState<string | null>(null)
  const [minFees, setMinFees] = useState({ analysis: 1, resolution: 2, dispute: 0.5 })

  const fetchMinFees = useCallback(async () => {
    try {
      const fees = await getMinFees()
      setMinFees(fees)
    } catch (err) {
      console.error('Failed to fetch min fees:', err)
    }
  }, [])

  const analyze = useCallback(
    async (question: string, description: string, outcomes: string[], feeGen?: number) => {
      setLoading(true)
      setError(null)
      setAnalysis(null)
      setTxStatus('Submitting analysis...')

      try {
        const fee = feeGen || minFees.analysis
        const result = await analyzeMarket(question, description, outcomes, fee, (stage) => {
          const statusMap: Record<string, string> = {
            submitted: 'Submitted to GenLayer validators',
            proposing: 'Leader validator proposing result',
            verifying: 'Consensus validators verifying',
            finalizing: 'Finalizing on-chain',
            completed: 'Result finalized on-chain',
            fetching_result: 'Fetching result from contract...',
          }
          setTxStatus(statusMap[stage] || stage)
        })

        setAnalysis(result)
        setTxStatus('Analysis finalized')
        return result
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Analysis failed'
        setError(message)
        setTxStatus('Failed')
        throw err
      } finally {
        setLoading(false)
      }
    },
    [minFees.analysis]
  )

  const resolve = useCallback(
    async (marketId: string, question: string, description: string, outcomes: string[], feeGen?: number) => {
      setLoading(true)
      setError(null)
      setResolution(null)
      setTxStatus('Submitting resolution...')

      try {
        const fee = feeGen || minFees.resolution
        const result = await resolveMarket(marketId, question, description, outcomes, fee, (stage) => {
          const statusMap: Record<string, string> = {
            submitted: 'Submitted resolution to GenLayer',
            proposing: 'Leader resolver evaluating evidence',
            verifying: 'Consensus validators verifying resolution',
            finalizing: 'Finalizing resolution on-chain',
            completed: 'Resolution finalized on-chain',
            fetching_result: 'Fetching resolution from contract...',
          }
          setTxStatus(statusMap[stage] || stage)
        })

        setResolution(result)
        setTxStatus('Resolution finalized')
        return result
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Resolution failed'
        setError(message)
        setTxStatus('Failed')
        throw err
      } finally {
        setLoading(false)
      }
    },
    [minFees.resolution]
  )

  const submitDispute = useCallback(
    async (resolutionId: number, marketId: string, outcomes: string[], feeGen?: number) => {
      setLoading(true)
      setError(null)
      setDisputeResult(null)
      setTxStatus('Submitting dispute...')

      try {
        const fee = feeGen || minFees.dispute
        const result = await disputeResolution(resolutionId, marketId, outcomes, fee, (stage) => {
          const statusMap: Record<string, string> = {
            submitted: 'Submitted dispute to GenLayer',
            proposing: 'AI reviewing dispute evidence',
            verifying: 'Consensus validators verifying judgment',
            finalizing: 'Finalizing dispute outcome on-chain',
            completed: 'Dispute resolved on-chain',
            fetching_result: 'Fetching dispute result from contract...',
          }
          setTxStatus(statusMap[stage] || stage)
        })

        setDisputeResult(result)
        setTxStatus('Dispute resolved')
        return result
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Dispute failed'
        setError(message)
        setTxStatus('Failed')
        throw err
      } finally {
        setLoading(false)
      }
    },
    [minFees.dispute]
  )

  const reset = useCallback(() => {
    setAnalysis(null)
    setResolution(null)
    setDisputeResult(null)
    setError(null)
    setLoading(false)
    setTxStatus(null)
  }, [])

  return {
    analysis,
    resolution,
    disputeResult,
    loading,
    error,
    txStatus,
    minFees,
    analyze,
    resolve,
    submitDispute,
    reset,
    fetchMinFees,
  }
}
