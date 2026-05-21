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
  const [contractResolved, setContractResolved] = useState(false)
  const [contractResolutionData, setContractResolutionData] = useState<{
    outcomeIndex: number
    reasoning: string
    resolvedAt: string
    disputeDeadline: string
  } | null>(null)
  const [contractUserStakes, setContractUserStakes] = useState<any[]>([])
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    fetchMinFees()
  }, [fetchMinFees])

  useEffect(() => {
    if (!id) return
    const marketId = id
    let cancelled = false

    async function checkContractState() {
      try {
        const CONTRACT_ADDRESS = import.meta.env.VITE_GENLAYER_CONTRACT || ''
        if (!CONTRACT_ADDRESS) return

        const { createGenLayerClient } = await import('../lib/genlayer/client')
        const client = createGenLayerClient()

        const raw = await client.readContract({
          address: CONTRACT_ADDRESS,
          functionName: 'get_market',
          args: [marketId],
        })

        if (cancelled) return

        const jsonStr = typeof raw === 'string' ? raw : String(raw ?? 'null')

        if (jsonStr === 'null' || !jsonStr || jsonStr.length < 10) {
          return
        }

        const parsed = JSON.parse(jsonStr) as Record<string, unknown>

        if (parsed.is_resolved === true) {
          setContractResolved(true)
          const resolutionData = {
            outcomeIndex: Number(parsed.resolved_outcome_index ?? 0),
            reasoning: String(parsed.resolution_reasoning || ''),
            resolvedAt: String(parsed.resolved_at || ''),
            disputeDeadline: String(parsed.dispute_deadline || ''),
          }
          setContractResolutionData(resolutionData)

          // Fetch user stakes from contract using get_stake
          if (isConnected && address) {
            const outcomeCount = Number(parsed.outcome_count ?? 2)
            const userStakes: any[] = []
            for (let i = 0; i < outcomeCount; i++) {
              try {
                const stakeRaw = await client.readContract({
                  address: CONTRACT_ADDRESS,
                  functionName: 'get_stake',
                  args: [marketId, address, BigInt(i)],
                })
                const stakeJson = typeof stakeRaw === 'string' ? stakeRaw : String(stakeRaw ?? 'null')
                if (stakeJson !== 'null' && stakeJson) {
                  const stakeParsed = JSON.parse(stakeJson) as Record<string, unknown>
                  if (stakeParsed.exists === true) {
                    userStakes.push({
                      outcomeIndex: i,
                      amount: Number(stakeParsed.amount ?? 0),
                      claimed: Boolean(stakeParsed.claimed),
                    })
                  }
                }
              } catch {
              }
            }
            if (!cancelled) {
              setContractUserStakes(userStakes)
            }
          }
        }
      } catch {
      }
    }

    checkContractState()
    return () => { cancelled = true }
  }, [id, isConnected, address, refreshKey])

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

  const openStakeModal = (outcomeIndex: number) => {
    setStakeOutcomeIndex(outcomeIndex)
    setShowStakeModal(true)
  }

  const handleResolve = async () => {
    if (!market || !address) return
    setShowResolutionModal(true)
  }

  const handleDispute = async () => {
    if (!market) return
    setShowDisputeModal(true)
  }

  const currentResolution = existingResolution || resolution || (contractResolutionData && market ? {
    id: 0,
    marketId: market.id,
    resolvedOutcome: market.outcomes[contractResolutionData.outcomeIndex] || `Outcome ${contractResolutionData.outcomeIndex + 1}`,
    outcomeIndex: contractResolutionData.outcomeIndex,
    confidence: 100,
    reasoning: contractResolutionData.reasoning,
    timestamp: contractResolutionData.resolvedAt || new Date().toISOString(),
    txHash: '',
    status: 'finalized',
    isFinalized: true,
  } : null)

  const descriptionHtml = useMemo(() => {
    if (!market?.description) return ''
    return renderMarkdown(market.description)
  }, [market?.description])

  const isResolved = market?.status === 'resolved' || market?.status === 'closed' || contractResolved

  const totalPool = pools.reduce((sum, p) => sum + p.amount, 0)

  const deadline = market?.endDate || market?.closeDate
  const deadlineDate = deadline ? new Date(deadline) : null
  const now = new Date()
  const isExpired = deadlineDate ? now > deadlineDate : false
  const msLeft = deadlineDate ? Math.max(0, deadlineDate.getTime() - now.getTime()) : 0

  function formatDeadline(): string {
    if (!deadlineDate) return 'No deadline set'
    if (isExpired) return 'Ended'
    if (msLeft < 60 * 1000) return `${Math.floor(msLeft / 1000)}s left`
    if (msLeft < 60 * 60 * 1000) return `${Math.floor(msLeft / (60 * 1000))}m left`
    if (msLeft < 24 * 60 * 60 * 1000) return `${Math.floor(msLeft / (60 * 60 * 1000))}h left`
    const days = Math.ceil(msLeft / (24 * 60 * 60 * 1000))
    return days === 1 ? '1 day left' : `${days} days left`
  }

  const hasPassedDeadline = isExpired

  const disputeWindowOpen = useMemo(() => {
    if (!isResolved || !contractResolutionData) return false
    const deadline = contractResolutionData.disputeDeadline
    if (!deadline) return false
    return new Date() < new Date(deadline)
  }, [isResolved, contractResolutionData])

  const getPoolPercentage = (outcomeIndex: number) => {
    const pool = pools.find((p) => p.outcomeIndex === outcomeIndex)
    const poolAmount = pool?.amount ?? 0
    if (totalPool === 0 || !market) return 100 / (market?.outcomes.length || 2)
    return (poolAmount / totalPool) * 100
  }

  const userTotalStake = userStakes.reduce((sum, s) => sum + s.amount, 0)
  const contractStakeTotal = contractUserStakes.reduce((sum, s) => sum + s.amount, 0)
  const effectiveStakes = contractUserStakes.length > 0 ? contractUserStakes : userStakes
  const effectiveTotalStake = contractStakeTotal > 0 ? contractStakeTotal : userTotalStake

  const userHasWinningStake = currentResolution
    ? effectiveStakes.some((s) => s.outcomeIndex === currentResolution.outcomeIndex)
    : false
  const userHasLosingStake = currentResolution
    ? effectiveStakes.some((s) => s.outcomeIndex !== currentResolution.outcomeIndex)
    : false

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
                  {formatDeadline()}
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

          {isConnected && address && effectiveTotalStake > 0 && (
            <div className="stake-user-summary">
              <h3>Your Stakes</h3>
              <div className="stake-summary-row">
                <span>Total staked</span>
                <span>{formatGen(effectiveTotalStake)}</span>
              </div>
              {isResolved && currentResolution && (
                <div className={`stake-result-badge ${userHasWinningStake ? 'win' : 'lose'}`}>
                  {disputeWindowOpen ? (
                    userHasWinningStake ? (
                      <>⏳ Waiting for dispute period to end</>
                    ) : (
                      <>
                        ✗ You Lost. Winner: {market.outcomes[currentResolution.outcomeIndex]}
                        {userHasLosingStake && (
                          <button className="btn-dispute-inline" onClick={handleDispute}>Dispute</button>
                        )}
                      </>
                    )
                  ) : (
                    userHasWinningStake ? (
                      <>✓ You Won! Claim your winnings below</>
                    ) : (
                      <>✗ You Lost. Winner: {market.outcomes[currentResolution.outcomeIndex]}</>
                    )
                  )}
                </div>
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
                const userStakeOnOutcome = effectiveStakes.find((s) => s.outcomeIndex === index)
                return (
                  <div
                    key={outcome}
                    className={`outcome-card ${isWinner ? 'outcome-winner' : ''} ${isResolved ? 'outcome-card-resolved' : ''} ${!isResolved && !isExpired && isConnected && network.current === 'genlayer' ? 'outcome-card-clickable' : ''}`}
                    onClick={() => !isResolved && !isExpired && isConnected && network.current === 'genlayer' && openStakeModal(index)}
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
                      <div className={`outcome-user-stake ${isResolved ? (isWinner ? 'stake-won' : 'stake-lost') : ''}`}>
                        Your stake: {formatGen(userStakeOnOutcome.amount)}
                        {isResolved && (
                          <span className="stake-result-tag">
                            {isWinner ? '✓ Won' : '✗ Lost'}
                          </span>
                        )}
                      </div>
                    )}
                    {!isResolved && !isExpired && isConnected && network.current === 'genlayer' && (
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

                {isResolved && disputeWindowOpen && isConnected && (
                  <div className="resolution-actions">
                    {userHasWinningStake ? (
                      <div className="dispute-waiting-banner">
                        <span className="waiting-icon">⏳</span>
                        <div className="waiting-text">
                          <strong>Waiting for dispute period to end</strong>
                          <span>
                            {contractResolutionData?.disputeDeadline
                              ? `Dispute window closes ${new Date(contractResolutionData.disputeDeadline).toLocaleString()}`
                              : '1 day dispute window in progress'}
                          </span>
                        </div>
                      </div>
                    ) : userHasLosingStake ? (
                      <button className="btn btn-secondary" onClick={handleDispute}>
                        Dispute This Resolution
                      </button>
                    ) : (
                      <div className="dispute-waiting-banner">
                        <span className="waiting-icon">⏳</span>
                        <div className="waiting-text">
                          <strong>Dispute window open for losing stakers</strong>
                          <span>
                            {contractResolutionData?.disputeDeadline
                              ? `Closes ${new Date(contractResolutionData.disputeDeadline).toLocaleString()}`
                              : '1 day window'}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {isResolved && !disputeWindowOpen && effectiveStakes.length > 0 && (
                  <div className="user-result-summary">
                    {userHasWinningStake ? (
                      <div className="user-result-badge win">
                        <span className="result-icon">✓</span>
                        <span>You Won! Claim your winnings below</span>
                      </div>
                    ) : (
                      <div className="user-result-badge lose">
                        <span className="result-icon">✗</span>
                        <span>You Lost. Winner: {market.outcomes[currentResolution.outcomeIndex]}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {!isResolved && hasPassedDeadline && isConnected && !currentResolution && (
            <div className="market-detail-actions">
              <button className="btn-pill btn-pill-primary" onClick={handleResolve}>
                Request Resolution
              </button>
            </div>
          )}

          {isResolved && !disputeWindowOpen && isConnected && userHasWinningStake && (
            <div className="market-detail-actions">
              <button
                className="btn-pill btn-pill-primary"
                onClick={async () => {
                  if (!market || !address || !currentResolution) return
                  try {
                    await claimWinnings(address, market.id)
                    showToast('Winnings claimed!', 'success')
                  } catch (err) {
                    showToast(err instanceof Error ? err.message : 'Claim failed', 'error')
                  }
                }}
              >
                Claim Winnings
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
            setMarket((prev) => prev ? { ...prev, status: 'resolved' } : prev)
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
            setRefreshKey((k) => k + 1)
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
