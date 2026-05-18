import { useState } from 'react'
import { useAccount } from 'wagmi'
import { useGenLayer } from '../hooks/useGenLayer'
import { useNetworkState } from '../hooks/useNetworkState'
import { useToast } from '../contexts/ToastContext'
import type { PolymarketMarket } from '../types/market'

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

interface AnalyzeModalProps {
  market: PolymarketMarket
  onClose: () => void
}

export function AnalyzeModal({ market, onClose }: AnalyzeModalProps) {
  const { address, isConnected } = useAccount()
  const network = useNetworkState()
  const { showToast } = useToast()
  const { analyze, loading, error, txStatus, minFees, reset } = useGenLayer()

  const [genAmount, setGenAmount] = useState(minFees.analysis.toString())
  const [step, setStep] = useState<'input' | 'processing' | 'result'>('input')

  const handleAnalyze = async () => {
    if (!isConnected || !address) {
      showToast('Please connect your wallet first', 'warning')
      return
    }

    const genAmountNum = parseFloat(genAmount) || 0
    if (genAmountNum < minFees.analysis) {
      showToast(`Minimum fee is ${minFees.analysis} GEN`, 'warning')
      return
    }

    if (network.current !== 'genlayer') {
      showToast('Please switch to GenLayer network first', 'warning')
      return
    }

    setStep('processing')

    try {
      await analyze(market.question, market.description, market.outcomes, genAmountNum)
      setStep('result')
      showToast('GenLayer analysis complete!', 'success')
    } catch {
      setStep('input')
      showToast('Analysis failed. Check error details.', 'error')
    }
  }

  const handleReset = () => {
    reset()
    setStep('input')
  }

  const result = useGenLayer().analysis
  const sentiment = result ? SENTIMENT_CONFIG[result.sentiment] : null
  const risk = result ? RISK_CONFIG[result.riskLevel || 'medium'] : null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content analyze-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>GenLayer Analysis</h2>
          <button className="close-btn" onClick={onClose} aria-label="Close modal">×</button>
        </div>

        <div className="modal-body">
          {!isConnected && (
            <div className="analyze-connect">
              <div className="connect-icon">🧠</div>
              <h3>Connect Your Wallet</h3>
              <p>Connect your wallet to use GenLayer AI market analysis.</p>
            </div>
          )}

          {isConnected && network.current !== 'genlayer' && (
            <div className="analyze-connect">
              <div className="connect-icon">🔄</div>
              <h3>Switch to GenLayer Studio</h3>
              <button
                className="submit-btn analyze-btn"
                onClick={network.switchToGenLayer}
                disabled={network.isSwitching}
              >
                {network.isSwitching ? 'Switching...' : 'Switch to GenLayer Studio'}
              </button>
            </div>
          )}

          {isConnected && network.current === 'genlayer' && step === 'input' && (
            <>
              <div className="analyze-market-info">
                <span className="analyze-label">Market</span>
                <p className="analyze-question">{market.question}</p>
              </div>

              <div className="analyze-outcomes">
                <span className="analyze-label">Outcomes</span>
                <div className="outcome-tags">
                  {market.outcomes.map((outcome) => (
                    <span key={outcome} className="outcome-tag">{outcome}</span>
                  ))}
                </div>
              </div>

              <div className="analyze-payment">
                <span className="analyze-label">Analysis Fee</span>
                <div className="payment-input-group">
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
                <span className="balance-hint">Minimum fee: {minFees.analysis} GEN</span>
              </div>

              {error && <div className="error-message">{error}</div>}

              <button
                className="submit-btn analyze-btn"
                onClick={handleAnalyze}
                disabled={loading}
              >
                {loading ? 'Processing...' : `Analyze for ${parseFloat(genAmount) || 0} GEN`}
              </button>
            </>
          )}

          {step === 'processing' && (
            <div className="analyze-loading">
              <div className="genlayer-spinner">
                <div className="spinner-ring"></div>
                <div className="spinner-ring"></div>
                <div className="spinner-ring"></div>
              </div>
              <h3>GenLayer AI Consensus in Progress</h3>
              <p>{txStatus || 'Submitting transaction...'}</p>
            </div>
          )}

          {step === 'result' && result && sentiment && risk && (
            <div className="analyze-result">
              <div className="result-header">
                <div className="sentiment-badge" style={{ backgroundColor: `${sentiment.color}15`, color: sentiment.color, border: `1px solid ${sentiment.color}40` }}>
                  <span className="sentiment-icon">{sentiment.icon}</span>
                  <span>{sentiment.label}</span>
                </div>
                <div className="risk-badge" style={{ backgroundColor: `${risk.color}15`, color: risk.color, border: `1px solid ${risk.color}40` }}>
                  {risk.label}
                </div>
              </div>

              <div className="confidence-bar">
                <div className="confidence-label">
                  <span>Confidence</span>
                  <span>{result.confidence}%</span>
                </div>
                <div className="confidence-track">
                  <div className="confidence-fill" style={{ width: `${result.confidence}%`, backgroundColor: sentiment.color }} />
                </div>
              </div>

              <div className="result-section">
                <h4>Summary</h4>
                <p>{result.summary}</p>
              </div>

              <div className="result-section">
                <h4>Key Factors</h4>
                <ul className="factor-list">
                  {result.keyFactors.map((factor, idx) => (
                    <li key={idx}>
                      <span className="factor-bullet" style={{ color: sentiment.color }}>●</span>
                      {factor}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="result-section recommendation">
                <h4>Recommendation</h4>
                <p className="recommendation-text">{result.recommendedAction}</p>
              </div>

              <div className="modal-footer analyze-footer">
                <button className="btn btn-secondary" onClick={handleReset}>New Analysis</button>
                <button className="btn btn-primary" onClick={onClose}>Done</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
