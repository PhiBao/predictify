import { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { switchToGenLayerNetwork, isOnGenLayerNetwork } from '../lib/genlayer/client';
import { useGenLayerAnalysis } from '../hooks/useGenLayer';
import { useToast } from '../contexts/ToastContext';
import type { Market } from '../types/predict';

interface AnalyzeModalProps {
  market: Market;
  onClose: () => void;
}

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

export function AnalyzeModal({ market, onClose }: AnalyzeModalProps) {
  const { address, isConnected } = useAccount();
  const { analysis, loading, error, txStatus, minFee, analyze, reset, fetchMinFee } = useGenLayerAnalysis();
  const { showToast } = useToast();
  const [genAmount, setGenAmount] = useState('1.0');
  const [onGenLayer, setOnGenLayer] = useState(false);
  const [checkingNetwork, setCheckingNetwork] = useState(true);
  const [switching, setSwitching] = useState(false);
  const [step, setStep] = useState<'input' | 'processing' | 'result'>('input');

  useEffect(() => {
    fetchMinFee();
  }, [fetchMinFee]);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      setCheckingNetwork(true);
      const isGL = await isOnGenLayerNetwork();
      if (!cancelled) {
        setOnGenLayer(isGL);
        setCheckingNetwork(false);
      }
    }
    if (isConnected) check();
    else {
      setOnGenLayer(false);
      setCheckingNetwork(false);
    }
    return () => { cancelled = true; };
  }, [isConnected]);

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
    if (!isConnected || !address) {
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

    // Ensure we're on GenLayer before submitting
    const currentlyOnGL = await isOnGenLayerNetwork();
    if (!currentlyOnGL) {
      showToast('Please switch to GenLayer network first', 'warning');
      return;
    }

    setStep('processing');

    try {
      await analyze({
        marketQuestion: market.question,
        marketDescription: market.description,
        category: market.categorySlug,
        outcomeNames: market.outcomes.map(o => o.name),
      }, genAmount, address);

      setStep('result');
      showToast('GenLayer analysis complete!', 'success');
    } catch {
      setStep('input');
      showToast('Analysis failed. Check error details.', 'error');
    }
  };

  const handleReset = () => {
    reset();
    setStep('input');
  };

  const sentiment = analysis ? SENTIMENT_CONFIG[analysis.sentiment] : null;
  const risk = analysis ? RISK_CONFIG[analysis.riskLevel] : null;
  const minFeeGen = Number(minFee) / 10 ** 18;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content analyze-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>GenLayer Analysis</h2>
          <button className="close-btn" onClick={onClose} aria-label="Close modal">×</button>
        </div>

        <div className="modal-body">
          {/* Not connected */}
          {!isConnected && (
            <div className="analyze-connect">
              <div className="connect-icon">🧠</div>
              <h3>Connect Your Wallet</h3>
              <p>
                Connect your wallet to use GenLayer AI market analysis.
                You&apos;ll need GEN tokens on the GenLayer Studio network.
              </p>
              <div className="analyze-info-box">
                <div className="info-icon">⚡</div>
                <div className="info-text">
                  <strong>Same Wallet, Two Networks</strong>
                  <p>
                    Trade on BNB Chain. Analyze on GenLayer Studio.
                    We&apos;ll auto-switch your network when needed.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Connected but not on GenLayer */}
          {isConnected && !onGenLayer && !checkingNetwork && (
            <div className="analyze-connect">
              <div className="connect-icon">🔄</div>
              <h3>Switch to GenLayer Studio</h3>
              <p>
                Your wallet is connected. Now switch to the GenLayer Studio
                network to submit AI analysis requests.
              </p>
              <button
                className="submit-btn analyze-btn"
                onClick={handleSwitchNetwork}
                disabled={switching}
              >
                {switching ? 'Switching...' : 'Switch to GenLayer Studio'}
              </button>
              <div className="analyze-wallet-badge" style={{ marginTop: '12px' }}>
                <span className="wallet-dot" style={{ background: '#ff9500' }} />
                <span className="wallet-address">
                  {address ? `${address.slice(0, 6)}...${address.slice(-4)}` : ''}
                </span>
              </div>
            </div>
          )}

          {/* Connected + on GenLayer + input step */}
          {isConnected && onGenLayer && step === 'input' && (
            <>
              <div className="analyze-wallet-badge">
                <span className="wallet-dot" />
                <span className="wallet-address">
                  {address ? `${address.slice(0, 6)}...${address.slice(-4)}` : ''}
                </span>
                <span style={{ fontSize: '11px', color: 'var(--apple-text-tertiary)', marginLeft: '4px' }}>
                  on GenLayer Studio
                </span>
              </div>

              <div className="analyze-market-info">
                <span className="analyze-label">Market</span>
                <p className="analyze-question">{market.question}</p>
              </div>

              <div className="analyze-outcomes">
                <span className="analyze-label">Outcomes</span>
                <div className="outcome-tags">
                  {market.outcomes.map((outcome) => (
                    <span key={outcome.onChainId} className="outcome-tag">
                      {outcome.name}
                    </span>
                  ))}
                </div>
              </div>

              <div className="analyze-payment">
                <span className="analyze-label">Analysis Fee</span>
                <div className="payment-input-group">
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
                <span className="balance-hint">
                  Minimum fee: {minFeeGen} GEN
                </span>
              </div>

              {error && <div className="error-message">{error}</div>}

              <div className="analyze-info-box">
                <div className="info-icon">🧠</div>
                <div className="info-text">
                  <strong>AI-Powered Analysis</strong>
                  <p>
                    This calls a deployed GenLayer Intelligent Contract that uses
                    native LLM access to evaluate market conditions. Your GEN payment
                    funds the AI validator consensus.
                  </p>
                </div>
              </div>

              <button
                className="submit-btn analyze-btn"
                onClick={handleAnalyze}
                disabled={loading}
              >
                {loading ? 'Processing...' : `Analyze for ${parseFloat(genAmount) || 0} GEN`}
              </button>
            </>
          )}

          {/* Processing step */}
          {step === 'processing' && (
            <div className="analyze-loading">
              <div className="genlayer-spinner">
                <div className="spinner-ring"></div>
                <div className="spinner-ring"></div>
                <div className="spinner-ring"></div>
              </div>
              <h3>GenLayer AI Consensus in Progress</h3>
              <p>
                {txStatus || 'Submitting transaction to GenLayer validators...'}
              </p>
              <div className="analyze-steps">
                <div className={`step ${txStatus && txStatus !== 'Submitting...' ? 'active' : ''}`}>
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
                This typically takes 30–90 seconds depending on network load.
              </p>
            </div>
          )}

          {/* Result step */}
          {step === 'result' && analysis && sentiment && risk && (
            <div className="analyze-result">
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
                <span className="genlayer-badge">
                  ⚡ Powered by GenLayer AI
                </span>
                <span className="timestamp">
                  {analysis.timestamp ? new Date(analysis.timestamp).toLocaleString() : 'Just now'}
                </span>
              </div>

              <div className="modal-footer analyze-footer">
                <button className="btn btn-secondary" onClick={handleReset}>
                  New Analysis
                </button>
                <button className="btn btn-primary" onClick={onClose}>
                  Done
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
