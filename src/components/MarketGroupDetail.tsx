import { useState, useEffect, useMemo, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAccount } from 'wagmi'
import { getMarketsByGroupSlug } from '../services/polymarketAPI'
import { getMarketsByGroupSlug as getSupabaseGroupMarkets, getAllMarketPools, upsertMarketPools } from '../services/supabase'
import { getPoolsWithRetry } from '../services/genlayer'
import type { PolymarketMarket, PoolEntry } from '../types/market'
import { formatVolume, formatGen } from '../types/market'
import { useToast } from '../contexts/ToastContext'
import { useGenLayer } from '../hooks/useGenLayer'
import { useNetworkState } from '../hooks/useNetworkState'
import { StakeModal } from './StakeModal'

function parseCategory(raw: string): string {
  if (!raw) return 'Other'
  try {
    const parsed = JSON.parse(raw)
    return parsed.label || parsed.name || raw
  } catch {
    return raw
  }
}

function calculatePercentages(outcomes: string[], pools: PoolEntry[] | undefined): { percentages: number[]; totalStaked: number } {
  if (!pools || pools.length === 0) {
    const equalShare = 100 / outcomes.length
    return { percentages: outcomes.map(() => equalShare), totalStaked: 0 }
  }

  const totalStaked = pools.reduce((sum, p) => sum + p.amount, 0)
  if (totalStaked === 0) {
    const equalShare = 100 / outcomes.length
    return { percentages: outcomes.map(() => equalShare), totalStaked: 0 }
  }

  const percentages = outcomes.map((_, index) => {
    const pool = pools.find((p) => p.outcomeIndex === index)
    return pool ? (pool.amount / totalStaked) * 100 : 0
  })

  return { percentages, totalStaked }
}

export function MarketGroupDetail() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const { address, isConnected } = useAccount()
  const { showToast } = useToast()
  const network = useNetworkState()
  const { stakeOnOutcome, loading: stakeLoading } = useGenLayer()

  const [groupMarkets, setGroupMarkets] = useState<PolymarketMarket[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [poolsByMarketId, setPoolsByMarketId] = useState<Record<string, PoolEntry[]>>({})
  const [stakeModalOpen, setStakeModalOpen] = useState(false)
  const [stakeModalMarket, setStakeModalMarket] = useState<PolymarketMarket | null>(null)
  const [stakeModalOutcomeIndex, setStakeModalOutcomeIndex] = useState(0)

  useEffect(() => {
    let cancelled = false

    async function fetchGroup() {
      if (!slug) return
      try {
        setLoading(true)
        setError(null)

        const decodedSlug = decodeURIComponent(slug).trim()
        let marketsData: PolymarketMarket[] = []

        try {
          const cached = await getSupabaseGroupMarkets(decodedSlug)
          if (cached.length > 0) {
            marketsData = cached.map((row) => ({
              id: row.id,
              conditionId: row.condition_id,
              question: row.question,
              description: row.description,
              slug: row.slug,
              category: parseCategory(row.category),
              tags: row.tags,
              outcomes: row.outcomes,
              outcomePrices: row.outcome_prices,
              probabilities: row.probabilities,
              volume: row.volume,
              volume24h: row.volume_24h,
              liquidity: row.liquidity,
              status: row.status,
              closeDate: row.close_date,
              endDate: row.end_date,
              image: row.image,
              icon: row.icon,
              resolutionSource: row.resolution_source,
              groupSlug: row.group_slug || undefined,
              groupName: row.group_name || undefined,
            }))
          }
        } catch {
          // fall through to live fetch
        }

        if (marketsData.length === 0) {
          marketsData = await getMarketsByGroupSlug(decodedSlug)
          marketsData = marketsData.map((m) => ({ ...m, category: parseCategory(m.category) }))
        }

        if (cancelled) return

        if (marketsData.length === 0) {
          setError('No markets found for this group.')
        } else {
          setGroupMarkets(marketsData)

          const marketIds = marketsData.map((m) => m.id)
          const poolsMap = await getAllMarketPools(marketIds)
          if (!cancelled) {
            setPoolsByMarketId(poolsMap)
          }
        }
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Failed to load markets')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchGroup()
    return () => { cancelled = true }
  }, [slug])

  const firstMarket = groupMarkets[0]

  const displayTitle = useMemo(() => {
    if (!firstMarket) return ''
    if (firstMarket.groupName) return firstMarket.groupName
    return firstMarket.question
  }, [firstMarket])

  const openStakeModal = useCallback((market: PolymarketMarket, outcomeIndex: number) => {
    setStakeModalMarket(market)
    setStakeModalOutcomeIndex(outcomeIndex)
    setStakeModalOpen(true)
  }, [])

  const handleStake = useCallback(async (marketId: string, question: string, outcomes: string[], endDate: string, outcomeIndex: number, amountGen: number) => {
    if (!address) return false
    try {
      const success = await stakeOnOutcome(address, marketId, question, outcomes, endDate, outcomeIndex, amountGen)
      if (success) {
        showToast('Stake placed successfully', 'success')
        setStakeModalOpen(false)
        const pools = await getPoolsWithRetry(marketId)
        if (pools.length > 0 && pools.some((p) => p.amount > 0)) {
          await upsertMarketPools(marketId, pools)
          setPoolsByMarketId((prev) => ({ ...prev, [marketId]: pools }))
        }
      }
      return success
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Stake failed', 'error')
      return false
    }
  }, [address, stakeOnOutcome, showToast])

  if (loading) {
    return (
      <div className="market-detail-loading">
        <div className="loading-spinner"></div>
        <p>Loading market group...</p>
      </div>
    )
  }

  if (error || !firstMarket) {
    return (
      <div className="market-detail-error">
        <h2>Market group not found</h2>
        <p>{error || 'This market group does not exist or has been removed.'}</p>
        <button className="btn-pill btn-pill-primary" onClick={() => navigate('/')}>
          Back to Markets
        </button>
      </div>
    )
  }

  const isResolved = firstMarket.status === 'resolved' || firstMarket.status === 'closed'
  const canStake = isConnected && network.current === 'genlayer' && !isResolved

  return (
    <div className="market-detail">
      <div className="market-detail-hero">
        <div className="market-detail-content">
          <button className="back-link" onClick={() => navigate(-1)}>
            ← Back
          </button>

          <div className="market-detail-header">
            {firstMarket.image && (
              <div className="market-detail-image">
                <img src={firstMarket.image} alt={displayTitle} />
              </div>
            )}
            <div className="market-detail-info">
              <div className="market-detail-badges">
                <span className={`market-status-badge ${firstMarket.status}`}>
                  {firstMarket.status.toUpperCase()}
                </span>
                <span className="market-detail-category">{firstMarket.category}</span>
              </div>
              <h1 className="market-detail-title">{displayTitle}</h1>
              <div className="market-detail-meta">
                <span>Volume: {formatVolume(firstMarket.volume)}</span>
                <span className="meta-tag">{groupMarkets.length} Markets</span>
              </div>
            </div>
          </div>

          <div className="market-detail-outcomes">
            <h3>Markets</h3>
            <div className="market-group-rows">
              {groupMarkets.map((market) => {
                const pools = poolsByMarketId[market.id]
                const { percentages, totalStaked } = calculatePercentages(market.outcomes, pools)
                const deadline = market.endDate || market.closeDate
                const deadlineDate = deadline ? new Date(deadline) : null
                const now = new Date()
                const isExpired = deadlineDate ? now > deadlineDate : false
                const daysLeft = deadlineDate ? Math.max(0, Math.ceil((deadlineDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))) : null

                return (
                  <div key={market.id} className="market-group-row">
                    <div className="market-group-row-header">
                      <a href={`/market/${market.id}`} className="market-group-row-link">
                        {market.question}
                      </a>
                      <div className="market-group-row-meta">
                        {totalStaked > 0 && (
                          <span className="market-group-staked">{formatGen(totalStaked)}</span>
                        )}
                        {deadlineDate && (
                          <span className={`market-group-deadline ${isExpired ? 'expired' : ''}`}>
                            {isExpired ? 'Ended' : daysLeft === 0 ? 'Ends today' : daysLeft === 1 ? '1 day left' : `${daysLeft}d left`}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="market-group-unified-bar">
                      {market.outcomes.slice(0, 4).map((outcome, index) => (
                        <div
                          key={outcome}
                          className="market-group-unified-segment"
                          style={{ width: `${percentages[index]}%` }}
                        >
                          <span className="market-group-unified-label">{outcome}</span>
                          <span className="market-group-unified-percent">{percentages[index].toFixed(0)}%</span>
                        </div>
                      ))}
                    </div>

                    <div className="outcomes-grid">
                      {market.outcomes.map((outcome, idx) => {
                        const percentage = percentages[idx]
                        const pool = pools?.find((p) => p.outcomeIndex === idx)
                        return (
                          <div
                            key={outcome}
                            className={`outcome-card ${canStake ? 'outcome-card-clickable' : ''}`}
                            onClick={() => canStake && openStakeModal(market, idx)}
                          >
                            <div className="outcome-card-header">
                              <span className="outcome-card-name">{outcome}</span>
                            </div>
                            <div className="outcome-pool-bar">
                              <div
                                className="outcome-pool-fill"
                                style={{ width: `${percentage}%` }}
                              />
                            </div>
                            <div className="outcome-pool-stats">
                              <span>{percentage.toFixed(1)}%</span>
                              <span>{formatGen(pool?.amount ?? 0)}</span>
                            </div>
                            {canStake && (
                              <span className="outcome-stake-hint">Click to stake →</span>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {stakeModalMarket && (
        <StakeModal
          isOpen={stakeModalOpen}
          onClose={() => setStakeModalOpen(false)}
          marketId={stakeModalMarket.id}
          question={stakeModalMarket.question}
          outcomes={stakeModalMarket.outcomes}
          endDate={stakeModalMarket.endDate || ''}
          defaultOutcomeIndex={stakeModalOutcomeIndex}
          onStake={handleStake}
          loading={stakeLoading}
        />
      )}
    </div>
  )
}
