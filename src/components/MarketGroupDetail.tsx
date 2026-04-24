import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAccount } from 'wagmi';
import { predictAPI } from '../services/predictAPI';
import { useGenLayerAnalysis } from '../hooks/useGenLayer';
import { useToast } from '../contexts/ToastContext';
import { usePredictSDK } from '../hooks/usePredictSDK';
import { useNetworkState } from '../hooks/useNetworkState';
import { TradeModal } from './TradeModal';
import type { Market, Outcome } from '../types/predict';
import { formatPriceLevel } from '../types/predict';

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

function renderMarkdown(text: string): string {
  let html = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\n/g, '<br>');
  return html;
}

/** Convert a slug like "number-of-cz-tweets" to "Number Of Cz Tweets" */
function unsanitizeSlug(slug: string): string {
  return slug
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function MarketGroupDetail() {
  const { categorySlug } = useParams<{ categorySlug: string }>();
  const navigate = useNavigate();
  const { address, isConnected } = useAccount();
  const network = useNetworkState();
  const { isReady } = usePredictSDK();
  const { showToast } = useToast();

  const [groupMarkets, setGroupMarkets] = useState<Market[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [tradeMarket, setTradeMarket] = useState<Market | null>(null);
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
  const [analysisStep, setAnalysisStep] = useState<'input' | 'processing' | 'result'>('input');

  useEffect(() => {
    fetchMinFee();
  }, [fetchMinFee]);

  useEffect(() => {
    let cancelled = false;

    async function fetchGroup() {
      if (!categorySlug) return;
      try {
        setLoading(true);
        setError(null);

        const decodedSlug = decodeURIComponent(categorySlug).trim();

        // Try API category filter first, then fall back to full list
        let marketsData: Market[] = [];
        try {
          const filteredData = await predictAPI.getMarkets({ category: decodedSlug, limit: 200 });
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const raw = filteredData as any;
          marketsData = Array.isArray(raw.data) ? raw.data : [];
        } catch {
          // API category filter may not be supported; fall through
        }

        // If API filter returned nothing, fetch all and filter client-side
        if (marketsData.length === 0) {
          const allData = await predictAPI.getMarkets({ limit: 500 });
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const raw = allData as any;
          const allMarkets: Market[] = Array.isArray(raw.data) ? raw.data : [];
          const slugLower = decodedSlug.toLowerCase();
          marketsData = allMarkets.filter((m) =>
            m.categorySlug?.trim().toLowerCase() === slugLower
          );
        }

        if (cancelled) return;

        if (marketsData.length === 0) {
          setError('No markets found for this group.');
        } else {
          setGroupMarkets(marketsData);
        }
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load markets');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchGroup();
    return () => { cancelled = true; };
  }, [categorySlug]);

  const firstMarket = groupMarkets[0];

  const displayTitle = useMemo(() => {
    if (!firstMarket) return '';
    const allSameQuestion = groupMarkets.every((m) => m.question === firstMarket.question);
    if (allSameQuestion && firstMarket.question && firstMarket.question !== firstMarket.categorySlug) {
      return firstMarket.question;
    }
    return unsanitizeSlug(firstMarket.categorySlug);
  }, [firstMarket, groupMarkets]);

  const handleTrade = async (market: Market, outcome: Outcome) => {
    if (!isConnected) {
      showToast('Connect your wallet to trade', 'warning');
      return;
    }

    // Auto-switch to BNB Chain if currently on GenLayer
    if (network.current === 'genlayer') {
      showToast('Switching to BNB Chain...', 'info');
      try {
        await network.switchToBSC();
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Network switch failed', 'error');
        return;
      }
    }

    if (!isReady) {
      showToast('SDK initializing. Please wait a moment.', 'warning');
      return;
    }

    setTradeMarket(market);
    setTradeOutcome(outcome);
    setShowTradeModal(true);
  };

  const handleAnalyze = async () => {
    if (!isConnected || !address || !firstMarket) {
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

    if (network.current !== 'genlayer') {
      showToast('Please switch to GenLayer network first', 'warning');
      return;
    }

    setAnalysisStep('processing');

    const allOutcomeNames = Array.from(
      new Set(groupMarkets.flatMap((m) => m.outcomes.map((o) => o.name)))
    );

    try {
      await analyze({
        marketQuestion: displayTitle,
        marketDescription: firstMarket.description,
        category: firstMarket.categorySlug,
        outcomeNames: allOutcomeNames,
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
    if (!firstMarket?.description) return '';
    return renderMarkdown(firstMarket.description);
  }, [firstMarket?.description]);

  if (loading) {
    return (
      <div className="market-detail-loading">
        <div className="loading-spinner"></div>
        <p>Loading market group...</p>
      </div>
    );
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
    );
  }

  const statusClass = firstMarket.status?.toLowerCase() || 'open';

  return (
    <div className="market-detail">
      <div className="market-detail-hero">
        <div className="market-detail-content">
          <button className="back-link" onClick={() => navigate(-1)}>
            ← Back
          </button>

          <div className="market-detail-header">
            {firstMarket.imageUrl && (
              <div className="market-detail-image">
                <img src={firstMarket.imageUrl} alt={displayTitle} />
              </div>
            )}
            <div className="market-detail-info">
              <div className="market-detail-badges">
                <span className={`market-status-badge ${statusClass}`}>
                  {firstMarket.status || 'OPEN'}
                </span>
                <span className="market-detail-category">{firstMarket.categorySlug}</span>
              </div>
              <h1 className="market-detail-title">{displayTitle}</h1>
              <div className="market-detail-meta">
                <span>Fee: {(firstMarket.feeRateBps / 100).toFixed(2)}%</span>
                {firstMarket.isYieldBearing && <span className="meta-tag">Yield Bearing</span>}
                {firstMarket.isNegRisk && <span className="meta-tag">Neg Risk</span>}
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

          {/* Grouped Markets */}
          <div className="market-detail-outcomes">
            <h3>Markets</h3>
            <div className="market-group-rows">
              {groupMarkets.map((market) => (
                <div key={market.id} className="market-group-row">
                  <div className="market-group-row-title">{market.title}</div>
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
                            <span className="outcome-price bid">Bid: {formatPriceLevel(outcome.bestBid)}</span>
                          )}
                          {outcome.bestAsk && (
                            <span className="outcome-price ask">Ask: {formatPriceLevel(outcome.bestAsk)}</span>
                          )}
                        </div>
                        <button
                          className={`outcome-trade-btn ${network.current === 'genlayer' ? 'needs-switch' : ''}`}
                          onClick={() => handleTrade(market, outcome)}
                          disabled={!isConnected || network.isSwitching}
                          title={
                            !isConnected
                              ? 'Connect your wallet to trade'
                              : network.isSwitching
                                ? 'Switching networks...'
                                : network.current === 'genlayer'
                                  ? 'Click to switch to BNB Chain and trade'
                                  : !isReady
                                    ? 'SDK initializing...'
                                    : 'Trade this outcome'
                          }
                        >
                          {!isConnected
                            ? 'Connect Wallet to Trade'
                            : network.isSwitching
                              ? 'Switching...'
                              : network.current === 'genlayer'
                                ? 'Switch to BNB Chain'
                                : 'Trade'}
                        </button>
                      </div>
                    ))}
                  </div>
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
                  <div className={`step ${progress && (progress.stage === 'verifying' || progress.stage === 'finalizing' || progress.stage === 'completed') ? 'active' : ''}`}>
                    <span className="step-dot"></span>
                    <span>Leader validator proposes result</span>
                  </div>
                  <div className={`step ${progress && (progress.stage === 'finalizing' || progress.stage === 'completed') ? 'active' : ''}`}>
                    <span className="step-dot"></span>
                    <span>Consensus validators verify</span>
                  </div>
                  <div className={`step ${progress && progress.stage === 'completed' ? 'active' : ''}`}>
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

            {analysisStep === 'result' && !analysis && (
              <div className="analysis-input">
                <div className="error-message">
                  {analysisError || 'Analysis completed but no data was returned. The contract may need to be redeployed.'}
                </div>
                <button className="btn btn-secondary" onClick={handleResetAnalysis}>
                  Try Again
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {showTradeModal && tradeMarket && tradeOutcome && (
        <TradeModal
          market={tradeMarket}
          outcome={tradeOutcome}
          onClose={() => {
            setShowTradeModal(false);
            setTradeOutcome(null);
            setTradeMarket(null);
          }}
        />
      )}
    </div>
  );
}
