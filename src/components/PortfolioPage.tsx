import { useState, useEffect, useCallback } from 'react'
import { useAccount } from 'wagmi'
import { useNavigate } from 'react-router-dom'
import { getAllUserStakes, upsertStake } from '../services/supabase'
import { getUserStakes as getContractUserStakes, getPools } from '../services/genlayer'
import { formatGen } from '../types/market'
import type { SupabaseMarketRow } from '../types/market'
import { useGenLayer } from '../hooks/useGenLayer'
import { useToast } from '../contexts/ToastContext'

interface PortfolioMarket {
  id: string
  question: string
  outcome: string
  outcomeIndex: number
  amount: number
  status: string
  endDate: string
  volume: number
  outcomes: string[]
  groupSlug?: string
  isWinner: boolean
  canClaim: boolean
}

export function PortfolioPage() {
  const { address, isConnected } = useAccount()
  const navigate = useNavigate()
  const { showToast } = useToast()
  const { claimWinnings, resolve: handleResolve, loading } = useGenLayer()

  const [stakes, setStakes] = useState<PortfolioMarket[]>([])
  const [loadingData, setLoadingData] = useState(true)
  const [totalStaked, setTotalStaked] = useState(0)
  const [resolvingId, setResolvingId] = useState<string | null>(null)

  const fetchPortfolio = useCallback(async () => {
    if (!address) return
    setLoadingData(true)
    try {
      // Fetch user stakes from Supabase first
      let userStakes = await getAllUserStakes(address)

      // Fallback: if Supabase has no stakes, check contract for markets with pool data
      if (userStakes.length === 0) {
        const { supabase } = await import('../services/supabase')
        const { data: poolData } = await supabase
          .from('market_pools')
          .select('market_id')
          .gt('total_staked', 0)
          .limit(50)

        const marketIds = poolData?.map((p) => p.market_id) || []

        for (const marketId of marketIds) {
          try {
            const contractStakes = await getContractUserStakes(marketId, address)
            for (const stake of contractStakes) {
              if (stake.amount > 0) {
                await upsertStake({
                  market_id: stake.marketId,
                  user: address,
                  outcome_index: stake.outcomeIndex,
                  amount: stake.amount,
                })
              }
            }
          } catch {
            // skip
          }
        }

        userStakes = await getAllUserStakes(address)
      }

      if (userStakes.length === 0) {
        setStakes([])
        setTotalStaked(0)
        setLoadingData(false)
        return
      }

      // Fetch market details only for markets where user has stakes
      const marketIds = [...new Set(userStakes.map((s) => s.market_id))]
      const marketsMap: Record<string, SupabaseMarketRow> = {}

      // Single query to fetch all markets at once
      const { supabase } = await import('../services/supabase')
      const { data } = await supabase
        .from('markets')
        .select('*')
        .in('id', marketIds)

      if (data) {
        for (const m of data) {
          marketsMap[m.id] = m
        }
      }

      const portfolioItems: PortfolioMarket[] = []
      let total = 0

      for (const stake of userStakes) {
        if (stake.amount <= 0) continue

        const market = marketsMap[stake.market_id]
        if (!market) {
          portfolioItems.push({
            id: stake.market_id,
            question: `Market ${stake.market_id.slice(0, 8)}...`,
            outcome: `Outcome ${stake.outcome_index + 1}`,
            outcomeIndex: stake.outcome_index,
            amount: stake.amount,
            status: 'unknown',
            endDate: '',
            volume: 0,
            outcomes: ['Yes', 'No'],
            isWinner: false,
            canClaim: false,
          })
          total += stake.amount
          continue
        }

        const outcomes = market.outcomes
        const outcomeName = outcomes[stake.outcome_index] || `Outcome ${stake.outcome_index + 1}`

        const isExpired = market.end_date ? new Date() > new Date(market.end_date) : false
        const isResolved = market.status === 'resolved' || market.status === 'closed'

        let isWinner = false
        let canClaim = false

        if (isResolved || isExpired) {
          const pools = await getPools(stake.market_id)
          const totalPool = pools.reduce((sum, p) => sum + p.amount, 0)
          const winningPool = pools.reduce((max, p) => (p.amount > max.amount ? p : max), { amount: 0, outcomeIndex: 0 })
          if (totalPool > 0) {
            isWinner = stake.outcome_index === winningPool.outcomeIndex
            canClaim = isWinner && stake.amount > 0
          }
        }

        total += stake.amount

        portfolioItems.push({
          id: stake.market_id,
          question: market.question,
          outcome: outcomeName,
          outcomeIndex: stake.outcome_index,
          amount: stake.amount,
          status: market.status,
          endDate: market.end_date,
          volume: market.volume,
          outcomes: market.outcomes,
          groupSlug: market.group_slug || undefined,
          isWinner,
          canClaim,
        })
      }

      portfolioItems.sort((a, b) => {
        if (a.canClaim && !b.canClaim) return -1
        if (!a.canClaim && b.canClaim) return 1
        return b.amount - a.amount
      })

      setStakes(portfolioItems)
      setTotalStaked(total)
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to load portfolio', 'error')
    } finally {
      setLoadingData(false)
    }
  }, [address, showToast])

  useEffect(() => {
    if (isConnected && address) {
      fetchPortfolio()
    }
  }, [isConnected, address, fetchPortfolio])

  const handleClaim = useCallback(async (marketId: string) => {
    if (!address) return
    try {
      await claimWinnings(address, marketId)
      showToast('Winnings claimed!', 'success')
      fetchPortfolio()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Claim failed', 'error')
    }
  }, [address, claimWinnings, showToast, fetchPortfolio])

  const handleResolveStake = useCallback(async (stake: PortfolioMarket) => {
    if (!address) return
    setResolvingId(stake.id)
    try {
      await handleResolve(address, stake.id, stake.question, stake.outcomes, stake.endDate)
      showToast('Resolution requested!', 'success')
      fetchPortfolio()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Resolution failed', 'error')
    } finally {
      setResolvingId(null)
    }
  }, [address, handleResolve, showToast, fetchPortfolio])

  if (!isConnected) {
    return (
      <div className="portfolio-page">
        <div className="portfolio-content">
          <button className="back-link" onClick={() => navigate('/')}>← Back</button>
          <div className="portfolio-empty">
            <h2>Portfolio</h2>
            <p>Connect your wallet to view your stakes.</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="portfolio-page">
      <div className="portfolio-content">
        <button className="back-link" onClick={() => navigate('/')}>← Back</button>

        <div className="portfolio-header">
          <h1>Portfolio</h1>
          <p className="portfolio-address">{address?.slice(0, 6)}...{address?.slice(-4)}</p>
        </div>

        <div className="portfolio-stats">
          <div className="portfolio-stat-card">
            <span className="portfolio-stat-value">{formatGen(totalStaked)}</span>
            <span className="portfolio-stat-label">Total Staked</span>
          </div>
          <div className="portfolio-stat-card">
            <span className="portfolio-stat-value">{stakes.length}</span>
            <span className="portfolio-stat-label">Active Stakes</span>
          </div>
          <div className="portfolio-stat-card">
            <span className="portfolio-stat-value">{stakes.filter((s) => s.canClaim).length}</span>
            <span className="portfolio-stat-label">Claimable</span>
          </div>
        </div>

        {loadingData ? (
          <div className="portfolio-loading">
            <div className="loading-spinner" />
            <p>Loading portfolio...</p>
          </div>
        ) : stakes.length === 0 ? (
          <div className="portfolio-empty-state">
            <p>No stakes yet. Explore markets and place your first stake!</p>
          </div>
        ) : (
          <div className="portfolio-list">
            {stakes.map((stake) => {
              const deadline = stake.endDate ? new Date(stake.endDate) : null
              const now = new Date()
              const isExpired = deadline ? now > deadline : false
              const msLeft = deadline ? Math.max(0, deadline.getTime() - now.getTime()) : 0

              function formatDeadline(): string {
                if (!deadline) return ''
                if (isExpired) return 'Ended'
                if (msLeft < 60 * 1000) return `${Math.floor(msLeft / 1000)}s left`
                if (msLeft < 60 * 60 * 1000) return `${Math.floor(msLeft / (60 * 1000))}m left`
                if (msLeft < 24 * 60 * 60 * 1000) return `${Math.floor(msLeft / (60 * 60 * 1000))}h left`
                const days = Math.ceil(msLeft / (24 * 60 * 60 * 1000))
                return days === 1 ? '1 day left' : `${days}d left`
              }

              return (
                <div key={stake.id} className={`portfolio-card ${stake.isWinner ? 'portfolio-winner' : ''}`}>
                  <div className="portfolio-card-body">
                    <a
                      href={stake.groupSlug ? `/market/group/${stake.groupSlug}` : `/market/${stake.id}`}
                      className="portfolio-card-link"
                    >
                      <h3 className="portfolio-card-question">{stake.question}</h3>
                    </a>

                    <div className="portfolio-card-meta">
                      <span className="portfolio-outcome-badge">{stake.outcome}</span>
                      <span className="portfolio-stake-amount">{formatGen(stake.amount)}</span>
                    </div>

                    <div className="portfolio-card-footer">
                      <div className="portfolio-card-status">
                        {stake.canClaim && <span className="status-badge claimable">Claimable</span>}
                        {stake.isWinner && !stake.canClaim && <span className="status-badge winner">Winner</span>}
                        {!stake.isWinner && isExpired && !stake.canClaim && <span className="status-badge expired">Awaiting Resolution</span>}
                        {!isExpired && <span className="status-badge active">{formatDeadline()}</span>}
                      </div>

                      <div className="portfolio-card-actions">
                        {stake.canClaim && (
                          <button
                            className="btn-claim-portfolio"
                            onClick={() => handleClaim(stake.id)}
                            disabled={loading}
                          >
                            {loading ? 'Claiming...' : 'Claim Winnings'}
                          </button>
                        )}
                        {isExpired && !stake.canClaim && stake.status !== 'resolved' && (
                          <button
                            className="btn-resolve-portfolio"
                            onClick={() => handleResolveStake(stake)}
                            disabled={loading || resolvingId === stake.id}
                          >
                            {resolvingId === stake.id ? 'Resolving...' : 'Request Resolution'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
