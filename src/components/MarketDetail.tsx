import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAccount } from 'wagmi'
import { getMarketById } from '../services/polymarketAPI'
import { getMarketById as getSupabaseMarket, getAnalysisByMarketId, getResolutionByMarketId } from '../services/supabase'
import { useGenLayer } from '../hooks/useGenLayer'
import { useToast } from '../contexts/ToastContext'
import { useNetworkState } from '../hooks/useNetworkState'
import type { PolymarketMarket } from '../types/market'
import { formatPriceLevel, formatVolume } from '../types/market'
import { ResolutionModal } from './ResolutionModal'
import { DisputeModal } from './DisputeModal'

const SENTIMENT_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  bullish: { label: 'Bullish', color: '#34c759', icon: '▲' },
  bearish: { label: 'Bearish', color: '#ff3b30', icon: '▼' },
  neutral: { label: 'Neutral', color: '#ff9500', icon: '◆' },
}

const RISK_CONFIG: Record<string, { label: string; color: string }> = {
  low: { label: 'Low Risk', color: '#34c759' },
  medium: { label: 'Medium Risk', color: '#ff9500' },
  high: { label: 'High Risk', color: '#ff3b30' },
  extreme: { label: 'Extreme Risk', color: '#ff2d55' },
}

function renderMarkdown(text: string): string {
  let html = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/\n/g, '<br>')
  return html
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

  const {
    analysis,
    resolution,
    loading: genLayerLoading,
    error: genLayerError,
    txStatus,
    minFees,
    analyze,
    resolve: resolveMarketFn,
    reset: resetGenLayer,
    fetchMinFees,
  } = useGenLayer()

  const [genAmount, setGenAmount] = useState('1.0')
  const [analysisStep, setAnalysisStep] = useState<'input' | 'processing' | 'result'>('input')
  const [existingAnalysis, setExistingAnalysis] = useState<ReturnType<typeof useGenLayer>['analysis'] | null>(null)
  const [existingResolution, setExistingResolution] = useState<ReturnType<typeof useGenLayer>['resolution'] | null>(null)

  void resolveMarketFn

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
              category: cached.category,
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
        }

        if (cancelled) return
        if (marketData) {
          setMarket(marketData)

          try {
            const cachedAnalysis = await getAnalysisByMarketId(id)
            if (cachedAnalysis) {
              setExistingAnalysis({
                id: cachedAnalysis.id,
                marketId: cachedAnalysis.market_id,
                sentiment: cachedAnalysis.sentiment,
                confidence: cachedAnalysis.confidence,
                summary: cachedAnalysis.summary,
                keyFactors: cachedAnalysis.key_factors,
                riskLevel: cachedAnalysis.risk_level,
                recommendedAction: cachedAnalysis.recommended_action,
                timestamp: cachedAnalysis.timestamp,
                txHash: cachedAnalysis.tx_hash,
              })
              setAnalysisStep('result')
            }
          } catch {
            // no cached analysis
          }

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
                evidence: cachedResolution.evidence,
                timestamp: cachedResolution.timestamp,
                txHash: cachedResolution.tx_hash,
                status: cachedResolution.status,
              })
            }
          } catch {
            // no cached resolution
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
  }, [id])

  const handleAnalyze = async () => {
    if (!isConnected || !address || !market) {
      showToast('Please connect your wallet first', 'warning')
      return
    }

    const genAmountNum = parseFloat(genAmount) || 0
    if (genAmountNum <= 0) {
      showToast('Please enter a valid GEN amount', 'warning')
      return
    }

    if (genAmountNum < minFees.analysis) {
      showToast(`Minimum fee is ${minFees.analysis} GEN`, 'warning')
      return
    }

    if (network.current !== 'genlayer') {
      showToast('Please switch to GenLayer network first', 'warning')
      return
    }

    setAnalysisStep('processing')

    try {
      const result = await analyze(market.question, market.description, market.outcomes, genAmountNum)
      if (result) {
        setExistingAnalysis(result)
        setAnalysisStep('result')
        showToast('GenLayer analysis complete!', 'success')
      }
    } catch {
      setAnalysisStep('input')
      showToast('Analysis failed. Check error details.', 'error')
    }
  }

  const handleResolve = async () => {
    if (!market) return
    setShowResolutionModal(true)
  }

  const handleDispute = async () => {
    if (!market) return
    setShowDisputeModal(true)
  }

  const handleResetAnalysis = () => {
    resetGenLayer()
    setAnalysisStep('input')
    setExistingAnalysis(null)
  }

  const sentiment = (existingAnalysis || analysis) ? SENTIMENT_CONFIG[(existingAnalysis || analysis)?.sentiment || 'neutral'] : null
  const risk = (existingAnalysis || analysis) ? RISK_CONFIG[(existingAnalysis || analysis)?.riskLevel || 'medium'] : null
  const currentAnalysis = existingAnalysis || analysis
  const currentResolution = existingResolution || resolution

  const descriptionHtml = useMemo(() => {
    if (!market?.description) return ''
    return renderMarkdown(market.description)
  }, [market?.description])

  const isResolved = market?.status === 'resolved' || market?.status === 'closed'

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

          <div className="market-detail-outcomes">
            <h3>Outcomes</h3>
            <div className="outcomes-grid">
              {market.outcomes.map((outcome, index) => {
                const probability = market.probabilities[index] || 0
                const isWinner = currentResolution?.outcomeIndex === index && currentResolution.status === 'finalized'
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
                      backgroundColor: currentResolution.status === 'finalized' ? '#34c75915' : '#ff950015',
                      color: currentResolution.status === 'finalized' ? '#34c759' : '#ff9500',
                    }}
                  >
                    {currentResolution.status.toUpperCase()}
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

                {currentResolution.evidence.length > 0 && (
                  <div className="result-section">
                    <h4>Evidence</h4>
                    <ul className="factor-list">
                      {currentResolution.evidence.map((ev, idx) => (
                        <li key={idx}>
                          <span className="factor-bullet" style={{ color: '#2997ff' }}>●</span>
                          {ev}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="result-meta">
                  <span className="genlayer-badge">⚡ Resolved by GenLayer AI</span>
                  <span className="timestamp">
                    {currentResolution.timestamp ? new Date(currentResolution.timestamp).toLocaleString() : 'Just now'}
                  </span>
                </div>

                {!isResolved && currentResolution.status !== 'finalized' && isConnected && (
                  <div className="resolution-actions">
                    <button className="btn btn-secondary" onClick={handleDispute}>
                      Dispute Resolution
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="market-detail-analysis">
            <h3>GenLayer AI Analysis</h3>

            {analysisStep === 'input' && !currentAnalysis && (
              <div className="analysis-input">
                {!isConnected && (
                  <div className="analysis-connect-prompt">
                    <p>Connect your wallet to request an AI-powered market analysis from GenLayer validators.</p>
                  </div>
                )}

                {isConnected && network.isChecking && (
                  <div className="analysis-connect-prompt">
                    <p>Detecting network...</p>
                  </div>
                )}

                {isConnected && !network.isChecking && network.current !== 'genlayer' && (
                  <div className="analysis-connect-prompt">
                    <p>Switch to the GenLayer Studio network to submit AI analysis requests.</p>
                    <button
                      className="btn-pill btn-pill-primary"
                      onClick={network.switchToGenLayer}
                      disabled={network.isSwitching}
                    >
                      {network.isSwitching ? 'Switching...' : 'Switch to GenLayer Studio'}
                    </button>
                  </div>
                )}

                {isConnected && !network.isChecking && network.current === 'genlayer' && (
                  <>
                    <p className="analysis-intro">
                      Get an AI-powered analysis of this market from GenLayer validators.
                      Pay with GEN tokens to fund the consensus process.
                    </p>

                    <div className="analysis-fee-row">
                      <label>Analysis Fee</label>
                      <div className="fee-input-group">
                        <input
                          type="number"
                          min={minFees.analysis.toString()}
                          step="0.1"
                          value={genAmount}
                          onChange={(e) => setGenAmount(e.target.value)}
                          className="gen-input"
                        />
                        <span className="gen-label">GEN</span>
                      </div>
                      <span className="fee-hint">Minimum: {minFees.analysis} GEN</span>
                    </div>

                    {genLayerError && <div className="error-message">{genLayerError}</div>}

                    <button
                      className="btn-analyze-submit"
                      onClick={handleAnalyze}
                      disabled={genLayerLoading}
                    >
                      <span className="gen-icon">⚡</span>
                      {genLayerLoading ? 'Processing...' : `Analyze for ${parseFloat(genAmount) || 0} GEN`}
                    </button>
                  </>
                )}
              </div>
            )}

            {analysisStep === 'processing' && (
              <div className="analysis-loading">
                <div className="genlayer-spinner">
                  <div className="spinner-ring"></div>
                  <div className="spinner-ring"></div>
                  <div className="spinner-ring"></div>
                </div>
                <h4>GenLayer AI Consensus in Progress</h4>
                <p className="tx-status">{txStatus}</p>
                <div className="analyze-steps">
                  <div className="step active">
                    <span className="step-dot"></span>
                    <span>Transaction submitted</span>
                  </div>
                  <div className="step">
                    <span className="step-dot"></span>
                    <span>Leader validator proposes result</span>
                  </div>
                  <div className="step">
                    <span className="step-dot"></span>
                    <span>Consensus validators verify</span>
                  </div>
                  <div className="step">
                    <span className="step-dot"></span>
                    <span>Result finalized on-chain</span>
                  </div>
                </div>
                <p className="consensus-hint">
                  This typically takes 30–90 seconds. We&apos;ll wait up to 10 minutes.
                </p>
              </div>
            )}

            {(analysisStep === 'result' && currentAnalysis && sentiment && risk) && (
              <div className="analysis-result">
                <div className="result-header">
                  <div
                    className="sentiment-badge"
                    style={{
                      backgroundColor: `${sentiment.color}15`,
                      color: sentiment.color,
                      border: `1px solid ${sentiment.color}40`,
                    }}
                  >
                    <span className="sentiment-icon">{sentiment.icon}</span>
                    <span>{sentiment.label}</span>
                  </div>
                  <div
                    className="risk-badge"
                    style={{
                      backgroundColor: `${risk.color}15`,
                      color: risk.color,
                      border: `1px solid ${risk.color}40`,
                    }}
                  >
                    {risk.label}
                  </div>
                </div>

                <div className="confidence-bar">
                  <div className="confidence-label">
                    <span>Confidence</span>
                    <span>{currentAnalysis.confidence}%</span>
                  </div>
                  <div className="confidence-track">
                    <div
                      className="confidence-fill"
                      style={{
                        width: `${currentAnalysis.confidence}%`,
                        backgroundColor: sentiment.color,
                      }}
                    />
                  </div>
                </div>

                <div className="result-section">
                  <h4>Summary</h4>
                  <p>{currentAnalysis.summary}</p>
                </div>

                <div className="result-section">
                  <h4>Key Factors</h4>
                  <ul className="factor-list">
                    {currentAnalysis.keyFactors.map((factor, idx) => (
                      <li key={idx}>
                        <span className="factor-bullet" style={{ color: sentiment.color }}>●</span>
                        {factor}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="result-section recommendation">
                  <h4>Recommendation</h4>
                  <p className="recommendation-text">{currentAnalysis.recommendedAction}</p>
                </div>

                <div className="result-meta">
                  <span className="genlayer-badge">⚡ Powered by GenLayer AI</span>
                  <span className="timestamp">
                    {currentAnalysis.timestamp ? new Date(currentAnalysis.timestamp).toLocaleString() : 'Just now'}
                  </span>
                </div>

                <div className="analysis-actions">
                  <button className="btn btn-secondary" onClick={handleResetAnalysis}>
                    New Analysis
                  </button>
                </div>
              </div>
            )}
          </div>

          {!isResolved && isConnected && network.current === 'genlayer' && (
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
    </div>
  )
}
