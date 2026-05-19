import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAccount } from 'wagmi'
import { getMarketById } from '../services/polymarketAPI'
import { getMarketById as getSupabaseMarket, getResolutionByMarketId } from '../services/supabase'
import { useGenLayer } from '../hooks/useGenLayer'
import { useToast } from '../contexts/ToastContext'
import { useNetworkState } from '../hooks/useNetworkState'
import type { PolymarketMarket } from '../types/market'
import { formatVolume, formatGen } from '../types/market'
import { ResolutionModal } from './ResolutionModal'
import { DisputeModal } from './DisputeModal'
import { StakeModal } from './StakeModal'

function renderMarkdown(text: string): string {
  let html = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/\n/g, '<br>')
  return html
}

function parseCategory(raw: string): string {
  if (!raw) return 'Other'
  try {
    const parsed = JSON.parse(raw)
    return parsed.label || parsed.name || raw
  } catch {
    return raw
  }
}

export function MarketDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { address, isConnected } = useAccount()
  const { showToast } = useToast()
  const network = useNetworkState()

  const [market, setMarket] = useState<PolymarketMarket | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [showResolutionModal, setShowResolutionModal] = useState(false)
  const [showDisputeModal, setShowDisputeModal] = useState(false)
  const [showStakeModal, setShowStakeModal] = useState(false)
  const [stakeOutcomeIndex, setStakeOutcomeIndex] = useState(0)

  const {
    resolution,
    userStakes,
    pools,
    stakeOnOutcome,
    claimWinnings,
    fetchStakesAndPools,
    fetchMinFees,
  } = useGenLayer()

  const [existingResolution, setExistingResolution] = useState<ReturnType<typeof useGenLayer>['resolution'] | null>(null)

  useEffect(() => {
    fetchMinFees()
  }, [fetchMinFees])

  useEffect(() => {
    let cancelled = false

    async function fetchMarket() {
      if (!id) return
      try {
        setLoading(true)
        setError(null)

        let marketData: PolymarketMarket | null = null

        try {
          const cached = await getSupabaseMarket(id)
          if (cached) {
            marketData = {
              id: cached.id,
              conditionId: cached.condition_id,
              question: cached.question,
              description: cached.description,
              slug: cached.slug,
              category: parseCategory(cached.category),
              tags: cached.tags,
              outcomes: cached.outcomes,
              outcomePrices: cached.outcome_prices,
              probabilities: cached.probabilities,
              volume: cached.volume,
              volume24h: cached.volume_24h,
              liquidity: cached.liquidity,
              status: cached.status,
              closeDate: cached.close_date,
              endDate: cached.end_date,
              image: cached.image,
              icon: cached.icon,
              resolutionSource: cached.resolution_source,
              groupSlug: cached.group_slug || undefined,
              groupName: cached.group_name || undefined,
            }
          }
        } catch {
          // fall through to live fetch
        }

        if (!marketData) {
          marketData = await getMarketById(id)
          if (marketData) {
            marketData.category = parseCategory(marketData.category)
          }
        }

        if (cancelled) return
        if (marketData) {
          setMarket(marketData)

          try {
            const cachedResolution = await getResolutionByMarketId(id)
            if (cachedResolution) {
              setExistingResolution({
                id: cachedResolution.id,
                marketId: cachedResolution.market_id,
                resolvedOutcome: cachedResolution.resolved_outcome,
                outcomeIndex: cachedResolution.outcome_index,
                confidence: cachedResolution.confidence,
                reasoning: cachedResolution.reasoning,
                timestamp: cachedResolution.timestamp,
                txHash: cachedResolution.tx_hash,
                status: cachedResolution.status,
                isFinalized: cachedResolution.is_finalized,
              })
            }
          } catch {
            // no cached resolution
          }

          if (isConnected && address) {
            fetchStakesAndPools(id, address)
          }
        } else {
          setError('Market not found')
        }
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Failed to load market')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchMarket()
    return () => { cancelled = true }
  }, [id, isConnected, address, fetchStakesAndPools])

  const handleStake = async (_marketId: string, _question: string, _outcomes: string[], _endDate: string, outcomeIndex: number, amountGen: number) => {
    if (!market || !isConnected || !address) return false
    try {
      await stakeOnOutcome(address, market.id, market.question, market.outcomes, market.endDate, outcomeIndex, amountGen)
      fetchStakesAndPools(market.id, address)
      showToast('Stake placed!', 'success')
      setShowStakeModal(false)
      return true
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Stake failed', 'error')
      return false
    }
  }

  const handleClaim = async (outcomeIndex: number) => {
    if (!market || !isConnected || !address) return
    await claimWinnings(address, market.id, outcomeIndex)
    showToast('Winnings claimed!', 'success')
  }

  const openStakeModal = (outcomeIndex: number) => {
    setStakeOutcomeIndex(outcomeIndex)
    setShowStakeModal(true)
  }

  const handleResolve = async () => {
    if (!market) return
    setShowResolutionModal(true)
  }

  const handleDispute = async () => {
    if (!market) return
    setShowDisputeModal(true)
  }

  const currentResolution = existingResolution || resolution

  const descriptionHtml = useMemo(() => {
    if (!market?.description) return ''
    return renderMarkdown(market.description)
  }, [market?.description])

  const isResolved = market?.status === 'resolved' || market?.status === 'closed'

  const totalPool = pools.reduce((sum, p) => sum + p.amount, 0)

  const deadline = market?.endDate || market?.closeDate
  const deadlineDate = deadline ? new Date(deadline) : null
  const now = new Date()
  const isExpired = deadlineDate ? now > deadlineDate : false
  const daysLeft = deadlineDate ? Math.max(0, Math.ceil((deadlineDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))) : null
  const deadlineText = deadlineDate
    ? isExpired
      ? 'Market has ended'
      : daysLeft === 0
        ? 'Ends today'
        : daysLeft === 1
          ? 'Ends tomorrow'
          : `${daysLeft} days left`
    : 'No deadline set'

  const hasPassedDeadline = isExpired

  const getPoolPercentage = (outcomeIndex: number) => {
    const pool = pools.find((p) => p.outcomeIndex === outcomeIndex)
    const poolAmount = pool?.amount ?? 0
    if (totalPool === 0 || !market) return 100 / (market?.outcomes.length || 2)
    return (poolAmount / totalPool) * 100
  }

  const userTotalStake = userStakes.reduce((sum, s) => sum + s.amount, 0)
  const userWinningStake = userStakes.find((s) => currentResolution && s.outcomeIndex === currentResolution.outcomeIndex)

  if (loading) {
    return (
      <div className="market-detail-loading">
        <div className="loading-spinner"></div>
        <p>Loading market...</p>
      </div>
    )
  }

  if (error || !market) {
    return (
      <div className="market-detail-error">
        <h2>Market not found</h2>
        <p>{error || 'This market does not exist or has been removed.'}</p>
        <button className="btn-pill btn-pill-primary" onClick={() => navigate('/')}>
          Back to Markets
        </button>
      </div>
    )
  }

  return (
    <div className="market-detail">
      <div className="market-detail-hero">
        <div className="market-detail-content">
          <button className="back-link" onClick={() => navigate(-1)}>
            ← Back
          </button>

          <div className="market-detail-header">
            {market.image && (
              <div className="market-detail-image">
                <img src={market.image} alt={market.question} />
              </div>
            )}
            <div className="market-detail-info">
              <div className="market-detail-badges">
                <span className={`market-status-badge ${market.status}`}>
                  {market.status.toUpperCase()}
                </span>
                <span className="market-detail-category">{market.category}</span>
              </div>
              <h1 className="market-detail-title">{market.question}</h1>
              <div className="market-detail-meta">
                <span>Volume: {formatVolume(market.volume)}</span>
                <span>Pool: {formatGen(totalPool)}</span>
                <span className={`market-detail-deadline ${isExpired ? 'expired' : ''}`}>
                  {deadlineText}
                </span>
              </div>
            </div>
          </div>

          {market.description && (
            <div className="market-detail-description">
              <h3>About this market</h3>
              <div
                className="markdown-content"
                dangerouslySetInnerHTML={{ __html: descriptionHtml }}
              />
            </div>
          )}

          {isConnected && address && userTotalStake > 0 && (
            <div className="stake-user-summary">
              <h3>Your Stakes</h3>
              <div className="stake-summary-row">
                <span>Total staked</span>
                <span>{formatGen(userTotalStake)}</span>
              </div>
              {currentResolution && userWinningStake && (
                <button className="btn-claim" onClick={() => handleClaim(userWinningStake.outcomeIndex)}>
                  Claim Winnings
                </button>
              )}
            </div>
          )}

          <div className="market-detail-outcomes">
            <h3>Outcomes</h3>
            <div className="market-unified-bar-detail">
              {market.outcomes.map((outcome, index) => {
                const percentage = getPoolPercentage(index)
                return (
                  <div
                    key={outcome}
                    className="market-unified-segment-detail"
                    style={{ width: `${percentage}%` }}
                  >
                    <span className="market-unified-label-detail">{outcome}</span>
                    <span className="market-unified-percent-detail">{percentage.toFixed(1)}%</span>
                  </div>
                )
              })}
            </div>

            <div className="outcomes-grid">
              {market.outcomes.map((outcome, index) => {
                const percentage = getPoolPercentage(index)
                const isWinner = currentResolution?.outcomeIndex === index && currentResolution.isFinalized
                const userStakeOnOutcome = userStakes.find((s) => s.outcomeIndex === index)
                return (
                  <div
                    key={outcome}
                    className={`outcome-card ${isWinner ? 'outcome-winner' : ''} ${!isResolved && isConnected && network.current === 'genlayer' ? 'outcome-card-clickable' : ''}`}
                    onClick={() => !isResolved && isConnected && network.current === 'genlayer' && openStakeModal(index)}
                  >
                    <div className="outcome-card-header">
                      <span className="outcome-card-name">{outcome}</span>
                      {isWinner && <span className="outcome-winner-badge">WINNER</span>}
                    </div>
                    <div className="outcome-pool-bar">
                      <div
                        className="outcome-pool-fill"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                    <div className="outcome-pool-stats">
                      <span>{percentage.toFixed(1)}%</span>
                      <span>{formatGen(pools.find((p) => p.outcomeIndex === index)?.amount ?? 0)}</span>
                    </div>
                    {userStakeOnOutcome && (
                      <div className="outcome-user-stake">
                        Your stake: {formatGen(userStakeOnOutcome.amount)}
                      </div>
                    )}
                    {!isResolved && isConnected && network.current === 'genlayer' && (
                      <span className="outcome-stake-hint">Click to stake →</span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {currentResolution && (
            <div className="market-detail-resolution">
              <h3>GenLayer Resolution</h3>
              <div className="resolution-result">
                <div className="resolution-header">
                  <div className="resolution-outcome">
                    <span className="resolution-label">Resolved Outcome</span>
                    <span className="resolution-value">{currentResolution.resolvedOutcome}</span>
                  </div>
                  <div
                    className="resolution-status-badge"
                    style={{
                      backgroundColor: currentResolution.isFinalized ? '#34c75915' : '#ff950015',
                      color: currentResolution.isFinalized ? '#34c759' : '#ff9500',
                    }}
                  >
                    {currentResolution.isFinalized ? 'FINALIZED' : 'RESOLVED'}
                  </div>
                </div>

                <div className="confidence-bar">
                  <div className="confidence-label">
                    <span>Confidence</span>
                    <span>{currentResolution.confidence}%</span>
                  </div>
                  <div className="confidence-track">
                    <div
                      className="confidence-fill"
                      style={{ width: `${currentResolution.confidence}%`, backgroundColor: '#2997ff' }}
                    />
                  </div>
                </div>

                <div className="result-section">
                  <h4>Reasoning</h4>
                  <p>{currentResolution.reasoning}</p>
                </div>

                <div className="result-meta">
                  <span className="genlayer-badge">⚡ Resolved by GenLayer AI</span>
                  <span className="timestamp">
                    {currentResolution.timestamp ? new Date(currentResolution.timestamp).toLocaleString() : 'Just now'}
                  </span>
                </div>

                {!isResolved && !currentResolution.isFinalized && isConnected && (
                  <div className="resolution-actions">
                    <button className="btn btn-secondary" onClick={handleDispute}>
                      Dispute Resolution
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {!isResolved && hasPassedDeadline && isConnected && network.current === 'genlayer' && !currentResolution && (
            <div className="market-detail-actions">
              <button className="btn-pill btn-pill-primary" onClick={handleResolve}>
                Request Resolution
              </button>
            </div>
          )}
        </div>
      </div>

      {showResolutionModal && market && (
        <ResolutionModal
          market={market}
          onClose={() => setShowResolutionModal(false)}
          onResolved={(res) => {
            setExistingResolution(res)
            setShowResolutionModal(false)
            showToast('Market resolved!', 'success')
          }}
        />
      )}

      {showDisputeModal && market && currentResolution && (
        <DisputeModal
          market={market}
          resolution={currentResolution}
          onClose={() => setShowDisputeModal(false)}
          onDisputed={() => {
            setShowDisputeModal(false)
            showToast('Dispute submitted!', 'success')
          }}
        />
      )}

      {showStakeModal && market && (
        <StakeModal
          isOpen={showStakeModal}
          onClose={() => setShowStakeModal(false)}
          marketId={market.id}
          question={market.question}
          outcomes={market.outcomes}
          endDate={market.endDate || ''}
          defaultOutcomeIndex={stakeOutcomeIndex}
          onStake={handleStake}
          loading={loading}
        />
      )}
    </div>
  )
}
