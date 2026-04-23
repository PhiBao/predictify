import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAccount } from 'wagmi';
import { predictAPI } from '../services/predictAPI';
import { useGenLayerAnalysis } from '../hooks/useGenLayer';
import { useToast } from '../contexts/ToastContext';
import { usePredictSDK } from '../hooks/usePredictSDK';
import { switchToGenLayerNetwork, isOnGenLayerNetwork } from '../lib/genlayer/client';
import { TradeModal } from './TradeModal';
import type { Market, Outcome } from '../types/predict';

const SENTIMENT_CONFIG = {
  bullish: { label: 'Bullish', color: '#34c759', icon: '▲' },
  bearish: { label: 'Bearish', color: '#ff3b30', icon: '▼' },
  neutral: { label: 'Neutral', color: '#ff9500', icon: '◆' },
};

const RISK_CONFIG = {
  low: { label: 'Low Risk', color: '#34c759' },
  medium: { label: 'Medium Risk', color: '#ff9500' },
  high: { label: 'High Risk', color: '#ff3b30' },
};

/** Convert simple markdown links to HTML */
function renderMarkdown(text: string): string {
  // Convert [text](url) to <a href="url">text</a>
  let html = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  // Convert **text** to <strong>text</strong>
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  // Convert newlines to <br>
  html = html.replace(/\n/g, '<br>');
  return html;
}

export function MarketDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { address, isConnected } = useAccount();
  const { isReady } = usePredictSDK();
  const { showToast } = useToast();

  const [market, setMarket] = useState<Market | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [tradeOutcome, setTradeOutcome] = useState<Outcome | null>(null);
  const [showTradeModal, setShowTradeModal] = useState(false);

  const {
    analysis,
    loading: analyzing,
    error: analysisError,
    txStatus,
    progress,
    minFee,
    analyze,
    reset: resetAnalysis,
    fetchMinFee,
  } = useGenLayerAnalysis();

  const [genAmount, setGenAmount] = useState('1.0');
  const [onGenLayer, setOnGenLayer] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [analysisStep, setAnalysisStep] = useState<'input' | 'processing' | 'result'>('input');

  useEffect(() => {
    fetchMinFee();
  }, [fetchMinFee]);

  useEffect(() => {
    let cancelled = false;

    async function fetchMarket() {
      if (!id) return;
      try {
        setLoading(true);
        setError(null);
        const data = await predictAPI.getMarket(id);
        if (cancelled) return;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const raw = data as any;
        const marketData = raw.data ?? raw;
        setMarket(marketData as Market);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load market');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchMarket();
    return () => { cancelled = true; };
  }, [id]);

  useEffect(() => {
    if (isConnected) {
      isOnGenLayerNetwork().then(setOnGenLayer);
    } else {
      setOnGenLayer(false);
    }
  }, [isConnected]);

  const statusClass = market?.status?.toLowerCase() || 'open';

  const handleTrade = (outcome: Outcome) => {
    setTradeOutcome(outcome);
    setShowTradeModal(true);
  };

  const handleSwitchNetwork = async () => {
    setSwitching(true);
    try {
      await switchToGenLayerNetwork();
      setOnGenLayer(true);
      showToast('Switched to GenLayer Studio', 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Network switch failed';
      showToast(msg, 'error');
    } finally {
      setSwitching(false);
    }
  };

  const handleAnalyze = async () => {
    if (!isConnected || !address || !market) {
      showToast('Please connect your wallet first', 'warning');
      return;
    }

    const genAmountNum = parseFloat(genAmount) || 0;
    if (genAmountNum <= 0) {
      showToast('Please enter a valid GEN amount', 'warning');
      return;
    }

    const minFeeGen = Number(minFee) / 10 ** 18;
    if (genAmountNum < minFeeGen) {
      showToast(`Minimum fee is ${minFeeGen} GEN`, 'warning');
      return;
    }

    const currentlyOnGL = await isOnGenLayerNetwork();
    if (!currentlyOnGL) {
      showToast('Please switch to GenLayer network first', 'warning');
      return;
    }

    setAnalysisStep('processing');

    try {
      await analyze({
        marketQuestion: market.question,
        marketDescription: market.description,
        category: market.categorySlug,
        outcomeNames: market.outcomes.map(o => o.name),
      }, genAmount, address);

      setAnalysisStep('result');
      showToast('GenLayer analysis complete!', 'success');
    } catch {
      setAnalysisStep('input');
      showToast('Analysis failed. Check error details.', 'error');
    }
  };

  const handleResetAnalysis = () => {
    resetAnalysis();
    setAnalysisStep('input');
  };

  const sentiment = analysis ? SENTIMENT_CONFIG[analysis.sentiment] : null;
  const risk = analysis ? RISK_CONFIG[analysis.riskLevel] : null;
  const minFeeGen = Number(minFee) / 10 ** 18;

  const descriptionHtml = useMemo(() => {
    if (!market?.description) return '';
    return renderMarkdown(market.description);
  }, [market?.description]);

  if (loading) {
    return (
      <div className="market-detail-loading">
        <div className="loading-spinner"></div>
        <p>Loading market...</p>
      </div>
    );
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
    );
  }

  return (
    <div className="market-detail">
      {/* Header */}
      <div className="market-detail-hero">
        <div className="market-detail-content">
          <button className="back-link" onClick={() => navigate(-1)}>
            ← Back
          </button>

          <div className="market-detail-header">
            {market.imageUrl && (
              <div className="market-detail-image">
                <img src={market.imageUrl} alt={market.question} />
              </div>
            )}
            <div className="market-detail-info">
              <div className="market-detail-badges">
                <span className={`market-status-badge ${statusClass}`}>
                  {market.status || 'OPEN'}
                </span>
                <span className="market-detail-category">{market.categorySlug}</span>
              </div>
              <h1 className="market-detail-title">{market.question}</h1>
              <div className="market-detail-meta">
                <span>Fee: {(market.feeRateBps / 100).toFixed(2)}%</span>
                {market.isYieldBearing && <span className="meta-tag">Yield Bearing</span>}
                {market.isNegRisk && <span className="meta-tag">Neg Risk</span>}
              </div>
            </div>
          </div>

          {/* Description */}
          {market.description && (
            <div className="market-detail-description">
              <h3>About this market</h3>
              <div
                className="markdown-content"
                dangerouslySetInnerHTML={{ __html: descriptionHtml }}
              />
            </div>
          )}

          {/* Outcomes */}
          <div className="market-detail-outcomes">
            <h3>Outcomes</h3>
            <div className="outcomes-grid">
              {market.outcomes.map((outcome) => (
                <div key={outcome.onChainId} className="outcome-card">
                  <div className="outcome-card-header">
                    <span className="outcome-card-name">{outcome.name}</span>
                    {outcome.status && (
                      <span className="outcome-card-status">{outcome.status}</span>
                    )}
                  </div>
                  <div className="outcome-card-prices">
                    {outcome.bestBid && (
                      <span className="outcome-price bid">Bid: {outcome.bestBid}</span>
                    )}
                    {outcome.bestAsk && (
                      <span className="outcome-price ask">Ask: {outcome.bestAsk}</span>
                    )}
                  </div>
                  <button
                    className="outcome-trade-btn"
                    onClick={() => handleTrade(outcome)}
                    disabled={!isConnected || !isReady}
                  >
                    {isConnected ? 'Trade' : 'Connect Wallet to Trade'}
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* GenLayer Analysis */}
          <div className="market-detail-analysis">
            <h3>GenLayer AI Analysis</h3>

            {analysisStep === 'input' && (
              <div className="analysis-input">
                {!isConnected && (
                  <div className="analysis-connect-prompt">
                    <p>Connect your wallet to request an AI-powered market analysis from GenLayer validators.</p>
                  </div>
                )}

                {isConnected && !onGenLayer && (
                  <div className="analysis-connect-prompt">
                    <p>Switch to the GenLayer Studio network to submit AI analysis requests.</p>
                    <button
                      className="btn-pill btn-pill-primary"
                      onClick={handleSwitchNetwork}
                      disabled={switching}
                    >
                      {switching ? 'Switching...' : 'Switch to GenLayer Studio'}
                    </button>
                  </div>
                )}

                {isConnected && onGenLayer && (
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
                          min={minFeeGen.toString()}
                          step="0.1"
                          value={genAmount}
                          onChange={(e) => setGenAmount(e.target.value)}
                          className="gen-input"
                        />
                        <span className="gen-label">GEN</span>
                      </div>
                      <span className="fee-hint">Minimum: {minFeeGen} GEN</span>
                    </div>

                    {analysisError && <div className="error-message">{analysisError}</div>}

                    <button
                      className="btn-analyze-submit"
                      onClick={handleAnalyze}
                      disabled={analyzing}
                    >
                      <span className="gen-icon">⚡</span>
                      {analyzing ? 'Processing...' : `Analyze for ${parseFloat(genAmount) || 0} GEN`}
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
                {progress && 'txHash' in progress && (
                  <p className="tx-hash">
                    Tx: {progress.txHash.slice(0, 10)}...{progress.txHash.slice(-8)}
                  </p>
                )}
                <div className="analyze-steps">
                  <div className={`step ${progress && progress.stage !== 'submitted' ? 'active' : ''}`}>
                    <span className="step-dot"></span>
                    <span>Transaction submitted</span>
                  </div>
                  <div className={`step ${progress && (progress.stage === 'verifying' || progress.stage === 'finalizing') ? 'active' : ''}`}>
                    <span className="step-dot"></span>
                    <span>Leader validator proposes result</span>
                  </div>
                  <div className={`step ${progress && progress.stage === 'finalizing' ? 'active' : ''}`}>
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
                        <span className="factor-bullet" style={{ color: sentiment.color }}>
                          ●
                        </span>
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

      {showTradeModal && tradeOutcome && (
        <TradeModal
          market={market}
          outcome={tradeOutcome}
          onClose={() => {
            setShowTradeModal(false);
            setTradeOutcome(null);
          }}
        />
      )}
    </div>
  );
}
