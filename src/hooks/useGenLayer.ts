import { useState, useCallback } from 'react'
import {
  buyShares,
  sellShares,
  resolveMarket,
  disputeResolution,
  getUserPositions,
  getMinFees,
} from '../services/genlayer'
import type { GenLayerResolution, Dispute, Position } from '../types/market'

interface UseGenLayerReturn {
  resolution: GenLayerResolution | null
  disputeResult: Dispute | null
  userPositions: Position[]
  loading: boolean
  error: string | null
  txStatus: string | null
  minFees: { resolution: number; dispute: number }
  buyShares: (account: string, marketId: string, question: string, outcomes: string[], endDate: string, outcomeIndex: number, amountGen: number) => Promise<boolean>
  sellShares: (account: string, marketId: string, outcomeIndex: number, sharesAmount: number) => Promise<boolean>
  resolve: (marketId: string, feeGen?: number) => Promise<GenLayerResolution | null>
  submitDispute: (resolutionId: number, marketId: string, evidenceUrl: string, reasoning: string, feeGen?: number) => Promise<Dispute | null>
  fetchPositions: (marketId: string, user: string) => Promise<void>
  reset: () => void
  fetchMinFees: () => Promise<void>
}

export function useGenLayer(): UseGenLayerReturn {
  const [resolution, setResolution] = useState<GenLayerResolution | null>(null)
  const [disputeResult, setDisputeResult] = useState<Dispute | null>(null)
  const [userPositions, setUserPositions] = useState<Position[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [txStatus, setTxStatus] = useState<string | null>(null)
  const [minFees, setMinFees] = useState({ resolution: 2, dispute: 0.5 })

  const fetchMinFees = useCallback(async () => {
    try {
      const fees = await getMinFees()
      setMinFees(fees)
    } catch (err) {
      console.error('Failed to fetch min fees:', err)
    }
  }, [])

  const handleBuyShares = useCallback(
    async (account: string, marketId: string, question: string, outcomes: string[], endDate: string, outcomeIndex: number, amountGen: number) => {
      setLoading(true)
      setError(null)
      setTxStatus('Buying shares...')

      try {
        const result = await buyShares(account, marketId, question, outcomes, endDate, outcomeIndex, amountGen, (stage) => {
          const statusMap: Record<string, string> = {
            submitted: 'Submitted buy order to GenLayer',
            proposing: 'Processing transaction',
            verifying: 'Validating transaction',
            finalizing: 'Finalizing on-chain',
            completed: 'Shares purchased successfully',
          }
          setTxStatus(statusMap[stage] || stage)
        })

        setTxStatus('Shares purchased')
        return result
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Buy shares failed'
        setError(message)
        setTxStatus('Failed')
        throw err
      } finally {
        setLoading(false)
      }
    },
    []
  )

  const handleSellShares = useCallback(
    async (account: string, marketId: string, outcomeIndex: number, sharesAmount: number) => {
      setLoading(true)
      setError(null)
      setTxStatus('Selling shares...')

      try {
        const result = await sellShares(account, marketId, outcomeIndex, sharesAmount, (stage) => {
          const statusMap: Record<string, string> = {
            submitted: 'Submitted sell order to GenLayer',
            proposing: 'Processing transaction',
            verifying: 'Validating transaction',
            finalizing: 'Finalizing on-chain',
            completed: 'Shares sold successfully',
          }
          setTxStatus(statusMap[stage] || stage)
        })

        setTxStatus('Shares sold')
        return result
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Sell shares failed'
        setError(message)
        setTxStatus('Failed')
        throw err
      } finally {
        setLoading(false)
      }
    },
    []
  )

  const handleResolve = useCallback(
    async (marketId: string, feeGen?: number) => {
      setLoading(true)
      setError(null)
      setResolution(null)
      setTxStatus('Submitting resolution...')

      try {
        const fee = feeGen || minFees.resolution
        const result = await resolveMarket(marketId, fee, (stage) => {
          const statusMap: Record<string, string> = {
            submitted: 'Submitted resolution to GenLayer',
            proposing: 'AI evaluating evidence',
            verifying: 'Consensus validators verifying',
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

  const handleSubmitDispute = useCallback(
    async (resolutionId: number, marketId: string, evidenceUrl: string, reasoning: string, feeGen?: number) => {
      setLoading(true)
      setError(null)
      setDisputeResult(null)
      setTxStatus('Submitting dispute...')

      try {
        const fee = feeGen || minFees.dispute
        const result = await disputeResolution(resolutionId, marketId, evidenceUrl, reasoning, fee, (stage) => {
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

  const fetchPositions = useCallback(async (marketId: string, user: string) => {
    try {
      const positions = await getUserPositions(marketId, user)
      setUserPositions(positions)
    } catch (err) {
      console.error('Failed to fetch positions:', err)
    }
  }, [])

  const reset = useCallback(() => {
    setResolution(null)
    setDisputeResult(null)
    setUserPositions([])
    setError(null)
    setLoading(false)
    setTxStatus(null)
  }, [])

  return {
    resolution,
    disputeResult,
    userPositions,
    loading,
    error,
    txStatus,
    minFees,
    buyShares: handleBuyShares,
    sellShares: handleSellShares,
    resolve: handleResolve,
    submitDispute: handleSubmitDispute,
    fetchPositions,
    reset,
    fetchMinFees,
  }
}
