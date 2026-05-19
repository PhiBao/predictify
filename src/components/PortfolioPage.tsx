import { useState, useEffect, useCallback } from 'react'
import { useAccount } from 'wagmi'
import { useNavigate } from 'react-router-dom'
import { getAllUserStakes } from '../services/supabase'
import { getPools } from '../services/genlayer'
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
  groupSlug?: string
  isWinner: boolean
  canClaim: boolean
}

export function PortfolioPage() {
  const { address, isConnected } = useAccount()
  const navigate = useNavigate()
  const { showToast } = useToast()
  const { claimWinnings, loading } = useGenLayer()

  const [stakes, setStakes] = useState<PortfolioMarket[]>([])
  const [loadingData, setLoadingData] = useState(true)
  const [totalStaked, setTotalStaked] = useState(0)

  const fetchPortfolio = useCallback(async () => {
    if (!address) return
    setLoadingData(true)
    try {
      const supabaseStakes = await getAllUserStakes(address)
      const marketIds = [...new Set(supabaseStakes.map((s) => s.market_id))]

      const marketsMap: Record<string, SupabaseMarketRow> = {}
      for (const marketId of marketIds) {
        const { data, error } = await (await import('../services/supabase')).supabase
          .from('markets')
          .select('*')
          .eq('id', marketId)
          .single()
        if (data && !error) {
          marketsMap[marketId] = data
        }
      }

      const portfolioItems: PortfolioMarket[] = []
      let total = 0

      for (const stake of supabaseStakes) {
        const market = marketsMap[stake.market_id]
        if (!market) continue

        const outcomes = market.outcomes
        const outcomeName = outcomes[stake.outcome_index] || `Outcome ${stake.outcome_index + 1}`

        const isResolved = market.status === 'resolved' || market.status === 'closed'
        const isExpired = market.end_date ? new Date() > new Date(market.end_date) : false

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

  const handleClaim = useCallback(async (marketId: string, outcomeIndex: number) => {
    if (!address) return
    try {
      await claimWinnings(address, marketId, outcomeIndex)
      showToast('Winnings claimed!', 'success')
      fetchPortfolio()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Claim failed', 'error')
    }
  }, [address, claimWinnings, showToast, fetchPortfolio])

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
              const daysLeft = deadline ? Math.max(0, Math.ceil((deadline.getTime() - Date.now()) / (1000 * 60 * 60 * 24))) : null
              const isExpired = deadline ? Date.now() > deadline.getTime() : false

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
                        {!stake.isWinner && isExpired && <span className="status-badge expired">Expired</span>}
                        {!isExpired && <span className="status-badge active">{daysLeft}d left</span>}
                      </div>

                      {stake.canClaim && (
                        <button
                          className="btn-claim-portfolio"
                          onClick={() => handleClaim(stake.id, stake.outcomeIndex)}
                          disabled={loading}
                        >
                          {loading ? 'Claiming...' : 'Claim Winnings'}
                        </button>
                      )}
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
