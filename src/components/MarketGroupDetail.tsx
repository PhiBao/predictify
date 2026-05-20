import { useState, useEffect, useMemo, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAccount } from 'wagmi'
import { getMarketsByGroupSlug } from '../services/polymarketAPI'
import { getMarketsByGroupSlug as getSupabaseGroupMarkets, getAllMarketPools, upsertMarketPools } from '../services/supabase'
import { getPoolsWithRetry, getUserStakes as getContractUserStakes } from '../services/genlayer'
import type { PolymarketMarket, PoolEntry, GenLayerResolution } from '../types/market'
import { formatVolume, formatGen } from '../types/market'
import { useToast } from '../contexts/ToastContext'
import { useGenLayer } from '../hooks/useGenLayer'
import { useNetworkState } from '../hooks/useNetworkState'
import { StakeModal } from './StakeModal'
import { DisputeModal } from './DisputeModal'

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
  const { stakeOnOutcome, resolve: handleResolve, loading: stakeLoading } = useGenLayer()

  const [groupMarkets, setGroupMarkets] = useState<PolymarketMarket[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [poolsByMarketId, setPoolsByMarketId] = useState<Record<string, PoolEntry[]>>({})
  const [stakeModalOpen, setStakeModalOpen] = useState(false)
  const [stakeModalMarket, setStakeModalMarket] = useState<PolymarketMarket | null>(null)
  const [stakeModalOutcomeIndex, setStakeModalOutcomeIndex] = useState(0)
  const [resolvingId, setResolvingId] = useState<string | null>(null)
  const [disputeModalMarket, setDisputeModalMarket] = useState<PolymarketMarket | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [resolvedMarketsData, setResolvedMarketsData] = useState<Record<string, {
    outcomeIndex: number
    reasoning: string
    disputeDeadline: string
  }>>({})
  const [userStakesByMarket, setUserStakesByMarket] = useState<Record<string, any[]>>({})

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

  useEffect(() => {
    if (groupMarkets.length === 0) return
    let cancelled = false

    async function checkContractStates() {
      try {
        const CONTRACT_ADDRESS = import.meta.env.VITE_GENLAYER_CONTRACT || ''
        console.log('[MarketGroupDetail] Checking contract states, address:', CONTRACT_ADDRESS)
        if (!CONTRACT_ADDRESS) return

        const { createGenLayerClient } = await import('../lib/genlayer/client')
        const client = createGenLayerClient()

        const resolvedIds = new Set<string>()
        const resolutionDataMap: Record<string, { outcomeIndex: number; reasoning: string; disputeDeadline: string }> = {}

        for (const market of groupMarkets) {
          try {
            console.log('[MarketGroupDetail] Checking market:', market.id)
            const raw = await client.readContract({
              address: CONTRACT_ADDRESS,
              functionName: 'get_market',
              args: [market.id],
            })

            const jsonStr = typeof raw === 'string' ? raw : String(raw ?? 'null')
            console.log('[MarketGroupDetail] Market', market.id, 'raw:', jsonStr.slice(0, 200))
            if (jsonStr === 'null' || !jsonStr) continue

            const parsed = JSON.parse(jsonStr) as Record<string, unknown>
            console.log('[MarketGroupDetail] Market', market.id, 'is_resolved:', parsed.is_resolved)
            if (parsed.is_resolved === true) {
              resolvedIds.add(market.id)
              resolutionDataMap[market.id] = {
                outcomeIndex: Number(parsed.resolved_outcome_index ?? 0),
                reasoning: String(parsed.resolution_reasoning || ''),
                disputeDeadline: String(parsed.dispute_deadline || ''),
              }
              console.log('[MarketGroupDetail] Market', market.id, 'IS resolved')
            }
          } catch (err) {
            console.log('[MarketGroupDetail] Market check failed:', market.id, err)
          }
        }

        console.log('[MarketGroupDetail] Resolved IDs:', resolvedIds)
        if (!cancelled && resolvedIds.size > 0) {
          setResolvedMarketsData(resolutionDataMap)
          // Update market statuses
          setGroupMarkets((prev) =>
            prev.map((m) =>
              resolvedIds.has(m.id) ? { ...m, status: 'resolved' as const } : m
            )
          )
        }
      } catch (err) {
        console.error('[MarketGroupDetail] Contract state check failed:', err)
      }
    }

    checkContractStates()
    return () => { cancelled = true }
  }, [groupMarkets, isConnected, address, refreshKey])

  // Separate effect to fetch stakes from contract for resolved markets
  useEffect(() => {
    const marketIds = Object.keys(resolvedMarketsData)
    if (!isConnected || !address || marketIds.length === 0) return
    const userAddr = address
    let cancelled = false

    async function fetchStakes() {
      const stakesMap: Record<string, any[]> = {}
      for (const marketId of marketIds) {
        try {
          console.log('[MarketGroupDetail] Fetching contract stakes for', marketId, 'user:', userAddr)
          const stakes = await getContractUserStakes(marketId, userAddr)
          console.log('[MarketGroupDetail] Contract stakes for', marketId, ':', stakes)
          stakesMap[marketId] = stakes.map((s) => ({
            outcomeIndex: s.outcomeIndex,
            amount: s.amount,
          }))
        } catch (err) {
          console.log('[MarketGroupDetail] Failed to fetch contract stakes for', marketId, err)
          stakesMap[marketId] = []
        }
      }
      if (!cancelled) {
        console.log('[MarketGroupDetail] Setting stakesMap:', stakesMap)
        setUserStakesByMarket(stakesMap)
      }
    }
    fetchStakes()
    return () => { cancelled = true }
  }, [resolvedMarketsData, isConnected, address])

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

  const handleResolveMarket = useCallback(async (market: PolymarketMarket) => {
    if (!address) return
    setResolvingId(market.id)
    try {
      await handleResolve(address, market.id, market.question, market.outcomes, market.endDate || '')
      setGroupMarkets((prev) =>
        prev.map((m) => (m.id === market.id ? { ...m, status: 'resolved' as const } : m))
      )
      showToast('Resolution requested!', 'success')
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Resolution failed', 'error')
    } finally {
      setResolvingId(null)
    }
  }, [address, handleResolve, showToast])

  const handleDisputeMarket = useCallback((market: PolymarketMarket) => {
    setDisputeModalMarket(market)
  }, [])

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
                const marketResolved = market.status === 'resolved' || market.status === 'closed'
                const canStake = isConnected && network.current === 'genlayer' && !marketResolved && !isExpired
                const msLeft = deadlineDate ? Math.max(0, deadlineDate.getTime() - now.getTime()) : 0

                function formatDeadline(): string {
                  if (!deadlineDate) return ''
                  if (isExpired) return 'Ended'
                  if (msLeft < 60 * 1000) return `${Math.floor(msLeft / 1000)}s left`
                  if (msLeft < 60 * 60 * 1000) return `${Math.floor(msLeft / (60 * 1000))}m left`
                  if (msLeft < 24 * 60 * 60 * 1000) return `${Math.floor(msLeft / (60 * 60 * 1000))}h left`
                  const days = Math.ceil(msLeft / (24 * 60 * 60 * 1000))
                  return days === 1 ? '1 day left' : `${days}d left`
                }

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
                            {formatDeadline()}
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
                        const resolvedData = resolvedMarketsData[market.id]
                        const isWinner = marketResolved && resolvedData && resolvedData.outcomeIndex === idx
                        return (
                          <div
                            key={outcome}
                            className={`outcome-card ${isWinner ? 'outcome-winner' : ''} ${marketResolved ? 'outcome-card-resolved' : ''} ${canStake ? 'outcome-card-clickable' : ''}`}
                            onClick={() => canStake && openStakeModal(market, idx)}
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
                              <span>{formatGen(pool?.amount ?? 0)}</span>
                            </div>
                            {canStake && (
                              <span className="outcome-stake-hint">Click to stake →</span>
                            )}
                          </div>
                        )
                      })}
                    </div>

                    {marketResolved && resolvedMarketsData[market.id] && (
                      <div className="market-group-resolution-full">
                        <div className="resolution-outcome-header">
                          <span className="resolution-label">Resolved:</span>
                          <span className="resolution-outcome-name">
                            {market.outcomes[resolvedMarketsData[market.id].outcomeIndex]}
                          </span>
                          <span className="resolution-badge">FINALIZED</span>
                        </div>
                        <div className="resolution-reasoning">
                          <h4>AI Resolution Reasoning</h4>
                          <p>{resolvedMarketsData[market.id].reasoning}</p>
                        </div>

                        {isConnected && address && (() => {
                          const resData = resolvedMarketsData[market.id]
                          const disputeDeadline = resData.disputeDeadline ? new Date(resData.disputeDeadline) : null
                          const disputeWindowOpen = disputeDeadline ? new Date() < disputeDeadline : false
                          const userStakes = userStakesByMarket[market.id] || []
                          const stakedOnWinner = userStakes.some((s: any) => s.outcomeIndex === resData.outcomeIndex)
                          const hasAnyStake = userStakes.length > 0

                          console.log('[MarketGroupDetail] UI render:', {
                            marketId: market.id,
                            disputeWindowOpen,
                            hasAnyStake,
                            userStakes,
                            stakedOnWinner,
                            winnerIndex: resData.outcomeIndex,
                          })

                          if (disputeWindowOpen) {
                            if (hasAnyStake) {
                              if (stakedOnWinner) {
                                return (
                                  <div className="dispute-waiting-banner">
                                    <span className="waiting-icon">⏳</span>
                                    <div className="waiting-text">
                                      <strong>Waiting for dispute period to end</strong>
                                      <span>{disputeDeadline?.toLocaleString() ?? '1 day'}</span>
                                    </div>
                                  </div>
                                )
                              } else {
                                return (
                                  <button
                                    className="btn-dispute-group"
                                    onClick={() => handleDisputeMarket(market)}
                                  >
                                    Dispute This Resolution
                                  </button>
                                )
                              }
                            } else {
                              return (
                                <div className="dispute-waiting-banner">
                                  <span className="waiting-icon">⏳</span>
                                  <div className="waiting-text">
                                    <strong>Dispute window open for losing stakers</strong>
                                    <span>{disputeDeadline?.toLocaleString() ?? '1 day'}</span>
                                  </div>
                                </div>
                              )
                            }
                          } else {
                            if (hasAnyStake) {
                              if (stakedOnWinner) {
                                return (
                                  <div className="user-result-badge win">
                                    <span className="result-icon">✓</span>
                                    <span>You Won!</span>
                                  </div>
                                )
                              } else {
                                return (
                                  <div className="user-result-badge lose">
                                    <span className="result-icon">✗</span>
                                    <span>You Lost. Winner: {market.outcomes[resData.outcomeIndex]}</span>
                                  </div>
                                )
                              }
                            }
                            return (
                              <div className="dispute-period-ended">
                                <span>Dispute period ended</span>
                              </div>
                            )
                          }
                        })()}
                      </div>
                    )}

                    {isExpired && !marketResolved && (
                      <div className="market-group-resolve-row">
                        <button
                          className="btn-resolve-group"
                          onClick={() => handleResolveMarket(market)}
                          disabled={resolvingId === market.id}
                        >
                          {resolvingId === market.id ? 'Resolving...' : 'Request Resolution'}
                        </button>
                      </div>
                    )}
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

      {disputeModalMarket && resolvedMarketsData[disputeModalMarket.id] && (() => {
        const resData = resolvedMarketsData[disputeModalMarket.id]
        const resolutionForModal: GenLayerResolution = {
          id: 0,
          marketId: disputeModalMarket.id,
          resolvedOutcome: disputeModalMarket.outcomes[resData.outcomeIndex] || `Outcome ${resData.outcomeIndex + 1}`,
          outcomeIndex: resData.outcomeIndex,
          confidence: 100,
          reasoning: resData.reasoning,
          timestamp: new Date().toISOString(),
          txHash: '',
          status: 'finalized',
          isFinalized: true,
        }
        return (
          <DisputeModal
            market={disputeModalMarket}
            resolution={resolutionForModal}
            onClose={() => setDisputeModalMarket(null)}
            onDisputed={() => {
              setDisputeModalMarket(null)
              setRefreshKey((k) => k + 1)
              showToast('Dispute submitted!', 'success')
            }}
          />
        )
      })()}
    </div>
  )
}
