import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAccount } from 'wagmi'
import { getMarketById } from '../services/polymarketAPI'
import { getMarketById as getSupabaseMarket, getResolutionByMarketId } from '../services/supabase'
import { useGenLayer } from '../hooks/useGenLayer'
import { useToast } from '../contexts/ToastContext'
import { useNetworkState } from '../hooks/useNetworkState'
import type { PolymarketMarket } from '../types/market'
import { formatPriceLevel, formatVolume } from '../types/market'
import { ResolutionModal } from './ResolutionModal'
import { DisputeModal } from './DisputeModal'
import { BuyModal } from './BuyModal'
import { SellModal } from './SellModal'
import { PositionsPanel } from './PositionsPanel'

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
  const [showBuyModal, setShowBuyModal] = useState(false)
  const [showSellModal, setShowSellModal] = useState(false)

  const {
    resolution,
    userPositions,
    buyShares: buySharesFn,
    sellShares: sellSharesFn,
    fetchPositions,
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
            fetchPositions(id, address)
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
  }, [id, isConnected, address, fetchPositions])

  const handleBuy = async (outcomeIndex: number, amountGen: number) => {
    if (!market || !isConnected || !address) return
    await buySharesFn(address, market.id, market.question, market.outcomes, market.endDate, outcomeIndex, amountGen)
    fetchPositions(market.id, address)
    showToast('Shares purchased!', 'success')
  }

  const handleSell = async (outcomeIndex: number, sharesAmount: number) => {
    if (!market || !isConnected || !address) return
    await sellSharesFn(address, market.id, outcomeIndex, sharesAmount)
    fetchPositions(market.id, address)
    showToast('Shares sold!', 'success')
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
  const now = Date.now()
  const endDate = market?.endDate ? new Date(market.endDate).getTime() : null
  const closeDate = market?.closeDate ? new Date(market.closeDate).getTime() : null
  const hasPassedDeadline = (endDate && now > endDate) || (closeDate && now > closeDate)

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
                <span>Liquidity: {formatVolume(market.liquidity)}</span>
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

          {isConnected && address && userPositions.length > 0 && (
            <PositionsPanel
              market={market}
              positions={userPositions}
              onSell={() => {
                setShowSellModal(true)
              }}
            />
          )}

          <div className="market-detail-outcomes">
            <h3>Outcomes</h3>
            <div className="outcomes-grid">
              {market.outcomes.map((outcome, index) => {
                const probability = market.probabilities[index] || 0
                const isWinner = currentResolution?.outcomeIndex === index && currentResolution.isFinalized
                return (
                  <div key={outcome} className={`outcome-card ${isWinner ? 'outcome-winner' : ''}`}>
                    <div className="outcome-card-header">
                      <span className="outcome-card-name">{outcome}</span>
                      {isWinner && <span className="outcome-winner-badge">WINNER</span>}
                    </div>
                    <div className="outcome-card-prices">
                      <span className="outcome-price probability">
                        {formatPriceLevel(probability)}
                      </span>
                    </div>
                    <div className="outcome-probability-bar">
                      <div
                        className="outcome-probability-fill"
                        style={{ width: `${probability * 100}%` }}
                      />
                    </div>
                    {!isResolved && isConnected && network.current === 'genlayer' && (
                      <button
                        className="btn-buy-outcome"
                        onClick={() => setShowBuyModal(true)}
                      >
                        Buy
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {!isResolved && isConnected && network.current === 'genlayer' && (
            <div className="market-detail-actions">
              <button className="btn-pill btn-pill-primary" onClick={() => setShowBuyModal(true)}>
                Buy Shares
              </button>
              {userPositions.length > 0 && (
                <button className="btn-pill btn-pill-secondary" onClick={() => setShowSellModal(true)}>
                  Sell Shares
                </button>
              )}
            </div>
          )}

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

      {showBuyModal && market && (
        <BuyModal
          market={market}
          onClose={() => setShowBuyModal(false)}
          onBuy={handleBuy}
        />
      )}

      {showSellModal && market && (
        <SellModal
          market={market}
          positions={userPositions}
          onClose={() => setShowSellModal(false)}
          onSell={handleSell}
        />
      )}
    </div>
  )
}
