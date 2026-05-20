import { useState, useCallback } from 'react'
import {
  stake,
  claim,
  resolveMarket,
  disputeResolution,
  getUserStakes,
  getPools,
  getPoolsWithRetry,
  getMinFees,
} from '../services/genlayer'
import { upsertMarketPools, getMarketPools } from '../services/supabase'
import type { GenLayerResolution, Dispute, Stake, PoolEntry } from '../types/market'

interface UseGenLayerReturn {
  resolution: GenLayerResolution | null
  disputeResult: Dispute | null
  userStakes: Stake[]
  pools: PoolEntry[]
  loading: boolean
  error: string | null
  txStatus: string | null
  minFees: { stake: number; dispute: number }
  stakeOnOutcome: (account: string, marketId: string, question: string, outcomes: string[], endDate: string, outcomeIndex: number, amountGen: number) => Promise<boolean>
  claimWinnings: (account: string, marketId: string) => Promise<boolean>
  resolve: (account: string, marketId: string, question: string, outcomes: string[], endDate: string) => Promise<GenLayerResolution | null>
  submitDispute: (account: string, marketId: string, evidenceUrl: string, reasoning: string, feeGen?: number) => Promise<Dispute | null>
  fetchStakesAndPools: (marketId: string, user: string) => Promise<void>
  reset: () => void
  fetchMinFees: () => Promise<void>
}

export function useGenLayer(): UseGenLayerReturn {
  const [resolution, setResolution] = useState<GenLayerResolution | null>(null)
  const [disputeResult, setDisputeResult] = useState<Dispute | null>(null)
  const [userStakes, setUserStakes] = useState<Stake[]>([])
  const [pools, setPools] = useState<PoolEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [txStatus, setTxStatus] = useState<string | null>(null)
  const [minFees, setMinFees] = useState({ stake: 0.001, dispute: 0.5 })

  const fetchMinFees = useCallback(async () => {
    try {
      const fees = await getMinFees()
      setMinFees(fees)
    } catch (err) {
      console.error('Failed to fetch min fees:', err)
    }
  }, [])

  const handleStake = useCallback(
    async (account: string, marketId: string, question: string, outcomes: string[], endDate: string, outcomeIndex: number, amountGen: number) => {
      setLoading(true)
      setError(null)
      setTxStatus('Staking on outcome...')

      try {
        const result = await stake(account, marketId, question, outcomes, endDate, outcomeIndex, amountGen, (stage) => {
          const statusMap: Record<string, string> = {
            submitted: 'Submitted stake to GenLayer',
            proposing: 'Processing transaction',
            verifying: 'Validating transaction',
            finalizing: 'Finalizing on-chain',
            completed: 'Stake placed successfully',
          }
          setTxStatus(statusMap[stage] || stage)
        })

        setTxStatus('Updating portfolio...')
        const { upsertStake } = await import('../services/supabase')
        await upsertStake({
          market_id: marketId,
          user: account,
          outcome_index: outcomeIndex,
          amount: amountGen,
        })

        setTxStatus('Updating pool data...')
        const pools = await getPoolsWithRetry(marketId)
        if (pools.length > 0 && pools.some((p) => p.amount > 0)) {
          await upsertMarketPools(marketId, pools)
        }

        setTxStatus('Stake placed')
        return result
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Stake failed'
        setError(message)
        setTxStatus('Failed')
        throw err
      } finally {
        setLoading(false)
      }
    },
    []
  )

  const handleClaim = useCallback(
    async (account: string, marketId: string) => {
      setLoading(true)
      setError(null)
      setTxStatus('Claiming winnings...')

      try {
        const result = await claim(account, marketId, (stage) => {
          const statusMap: Record<string, string> = {
            submitted: 'Submitted claim to GenLayer',
            proposing: 'Processing transaction',
            verifying: 'Validating transaction',
            finalizing: 'Finalizing on-chain',
            completed: 'Winnings claimed successfully',
          }
          setTxStatus(statusMap[stage] || stage)
        })

        setTxStatus('Winnings claimed')
        return result
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Claim failed'
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
    async (account: string, marketId: string, question: string, outcomes: string[], endDate: string) => {
      setLoading(true)
      setError(null)
      setResolution(null)
      setTxStatus('Submitting resolution...')

      try {
        const result = await resolveMarket(account, marketId, question, outcomes, endDate, (stage) => {
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
    []
  )

  const handleSubmitDispute = useCallback(
    async (account: string, marketId: string, evidenceUrl: string, reasoning: string, feeGen?: number) => {
      console.log('[useGenLayer] handleSubmitDispute called', { account, marketId, evidenceUrl: evidenceUrl.slice(0, 50), reasoning: reasoning.slice(0, 50), feeGen })
      setLoading(true)
      setError(null)
      setDisputeResult(null)
      setTxStatus('Submitting dispute...')

      try {
        const fee = feeGen || minFees.dispute
        console.log('[useGenLayer] Calling disputeResolution with fee:', fee)
        const result = await disputeResolution(account, marketId, evidenceUrl, reasoning, fee, (stage) => {
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

  const fetchStakesAndPools = useCallback(async (marketId: string, user: string) => {
    try {
      const stakesResult = await getUserStakes(marketId, user)
      setUserStakes(stakesResult)

      const poolsResult = await getMarketPools(marketId)
      if (poolsResult.length > 0) {
        setPools(poolsResult)
      } else {
        const contractPools = await getPools(marketId)
        if (contractPools.length > 0) {
          await upsertMarketPools(marketId, contractPools)
          setPools(contractPools)
        } else {
          setPools([])
        }
      }
    } catch (err) {
      console.error('Failed to fetch stakes and pools:', err)
    }
  }, [])

  const reset = useCallback(() => {
    setResolution(null)
    setDisputeResult(null)
    setUserStakes([])
    setPools([])
    setError(null)
    setLoading(false)
    setTxStatus(null)
  }, [])

  return {
    resolution,
    disputeResult,
    userStakes,
    pools,
    loading,
    error,
    txStatus,
    minFees,
    stakeOnOutcome: handleStake,
    claimWinnings: handleClaim,
    resolve: handleResolve,
    submitDispute: handleSubmitDispute,
    fetchStakesAndPools,
    reset,
    fetchMinFees,
  }
}
