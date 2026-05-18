import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAccount } from 'wagmi'
import { getMarketsByGroupSlug } from '../services/polymarketAPI'
import { getMarketsByGroupSlug as getSupabaseGroupMarkets } from '../services/supabase'
import { useGenLayer } from '../hooks/useGenLayer'
import { useToast } from '../contexts/ToastContext'
import { useNetworkState } from '../hooks/useNetworkState'
import type { PolymarketMarket } from '../types/market'
import { formatPriceLevel, formatVolume } from '../types/market'

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

export function MarketGroupDetail() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const { address, isConnected } = useAccount()
  const network = useNetworkState()
  const { showToast } = useToast()

  const [groupMarkets, setGroupMarkets] = useState<PolymarketMarket[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const {
    analysis,
    loading: genLayerLoading,
    error: genLayerError,
    txStatus,
    minFees,
    analyze,
    reset: resetGenLayer,
    fetchMinFees,
  } = useGenLayer()

  const [genAmount, setGenAmount] = useState('1.0')
  const [analysisStep, setAnalysisStep] = useState<'input' | 'processing' | 'result'>('input')

  useEffect(() => {
    fetchMinFees()
  }, [fetchMinFees])

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
              category: row.category,
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
        }

        if (cancelled) return

        if (marketsData.length === 0) {
          setError('No markets found for this group.')
        } else {
          setGroupMarkets(marketsData)
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

  const handleAnalyze = async () => {
    if (!isConnected || !address || !firstMarket) {
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

    const allOutcomeNames = Array.from(
      new Set(groupMarkets.flatMap((m) => m.outcomes))
    )

    try {
      await analyze(displayTitle, firstMarket.description, allOutcomeNames, genAmountNum)
      setAnalysisStep('result')
      showToast('GenLayer analysis complete!', 'success')
    } catch {
      setAnalysisStep('input')
      showToast('Analysis failed. Check error details.', 'error')
    }
  }

  const handleResetAnalysis = () => {
    resetGenLayer()
    setAnalysisStep('input')
  }

  const sentiment = analysis ? SENTIMENT_CONFIG[analysis.sentiment] : null
  const risk = analysis ? RISK_CONFIG[analysis.riskLevel || 'medium'] : null

  const descriptionHtml = useMemo(() => {
    if (!firstMarket?.description) return ''
    return renderMarkdown(firstMarket.description)
  }, [firstMarket?.description])

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

          {firstMarket.description && (
            <div className="market-detail-description">
              <h3>About this market</h3>
              <div
                className="markdown-content"
                dangerouslySetInnerHTML={{ __html: descriptionHtml }}
              />
            </div>
          )}

          <div className="market-detail-outcomes">
            <h3>Markets</h3>
            <div className="market-group-rows">
              {groupMarkets.map((market) => (
                <div key={market.id} className="market-group-row">
                  <div className="market-group-row-title">{market.question}</div>
                  <div className="outcomes-grid">
                    {market.outcomes.map((outcome, idx) => {
                      const probability = market.probabilities[idx] || 0
                      return (
                        <div key={outcome} className="outcome-card">
                          <div className="outcome-card-header">
                            <span className="outcome-card-name">{outcome}</span>
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
              ))}
            </div>
          </div>

          <div className="market-detail-analysis">
            <h3>GenLayer AI Analysis</h3>

            {analysisStep === 'input' && !analysis && (
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
                      Get an AI-powered analysis of this market group from GenLayer validators.
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

            {analysisStep === 'result' && analysis && sentiment && risk && (
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
                    <span>{analysis.confidence}%</span>
                  </div>
                  <div className="confidence-track">
                    <div
                      className="confidence-fill"
                      style={{
                        width: `${analysis.confidence}%`,
                        backgroundColor: sentiment.color,
                      }}
                    />
                  </div>
                </div>

                <div className="result-section">
                  <h4>Summary</h4>
                  <p>{analysis.summary}</p>
                </div>

                <div className="result-section">
                  <h4>Key Factors</h4>
                  <ul className="factor-list">
                    {analysis.keyFactors.map((factor, idx) => (
                      <li key={idx}>
                        <span className="factor-bullet" style={{ color: sentiment.color }}>●</span>
                        {factor}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="result-section recommendation">
                  <h4>Recommendation</h4>
                  <p className="recommendation-text">{analysis.recommendedAction}</p>
                </div>

                <div className="result-meta">
                  <span className="genlayer-badge">⚡ Powered by GenLayer AI</span>
                  <span className="timestamp">
                    {analysis.timestamp ? new Date(analysis.timestamp).toLocaleString() : 'Just now'}
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
        </div>
      </div>
    </div>
  )
}
