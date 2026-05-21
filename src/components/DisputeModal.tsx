import { useState } from 'react'
import { useAccount } from 'wagmi'
import { useGenLayer } from '../hooks/useGenLayer'
import { useNetworkState } from '../hooks/useNetworkState'
import { useToast } from '../contexts/ToastContext'
import type { PolymarketMarket, GenLayerResolution } from '../types/market'

interface DisputeModalProps {
  market: PolymarketMarket
  resolution: GenLayerResolution
  onClose: () => void
  onDisputed: () => void
}

export function DisputeModal({ market, resolution, onClose, onDisputed }: DisputeModalProps) {
  const { address, isConnected } = useAccount()
  const network = useNetworkState()
  const { showToast } = useToast()
  const { submitDispute, loading, error, txStatus, minFees } = useGenLayer()

  const [selectedOutcome, setSelectedOutcome] = useState('')
  const [evidenceUrl, setEvidenceUrl] = useState('')
  const [reasoning, setReasoning] = useState('')
  const [genAmount, setGenAmount] = useState(minFees.dispute.toString())
  const [step, setStep] = useState<'input' | 'processing' | 'done'>('input')
  const [localError, setLocalError] = useState<string | null>(null)
  const displayError = localError || error

  const handleDispute = async () => {
    setLocalError(null)

    if (!isConnected || !address) {
      setLocalError('Please connect your wallet first')
      return
    }

    if (!selectedOutcome) {
      setLocalError('Please select the correct outcome')
      return
    }

    if (!evidenceUrl.trim()) {
      setLocalError('Please provide an evidence URL')
      return
    }

    if (!reasoning.trim()) {
      setLocalError('Please provide reasoning for your dispute')
      return
    }

    const genAmountNum = parseFloat(genAmount) || 0
    if (genAmountNum < minFees.dispute) {
      setLocalError(`Minimum fee is ${minFees.dispute} GEN`)
      return
    }

    if (network.current !== 'genlayer') {
      setLocalError('Please switch to GenLayer network first')
      return
    }

    setStep('processing')

    try {
      const result = await submitDispute(address, market.id, evidenceUrl, reasoning, genAmountNum)
      if (result) {
        onDisputed()
        setStep('done')
        showToast('Dispute submitted to GenLayer!', 'success')
      } else {
        showToast('Dispute transaction sent but result unclear. Check contract.', 'warning')
        setStep('input')
      }
    } catch (err) {
      setStep('input')
      setLocalError(err instanceof Error ? err.message : 'Dispute failed')
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Dispute Resolution</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          <p className="modal-description">
            Challenge the current resolution by providing evidence and reasoning.
            GenLayer AI will review your dispute and make a final judgment.
          </p>

          <div className="dispute-current-resolution">
            <h4>Current Resolution</h4>
            <div className="dispute-resolution-info">
              <span className="dispute-resolved-outcome">{resolution.resolvedOutcome}</span>
              <span className="dispute-confidence">{resolution.confidence}% confidence</span>
            </div>
          </div>

          {step === 'input' && (
            <>
              <div className="dispute-form">
                <label>Correct Outcome</label>
                <div className="dispute-outcomes">
                  {market.outcomes.map((outcome) => (
                    <button
                      key={outcome}
                      className={`dispute-outcome-btn ${selectedOutcome === outcome ? 'selected' : ''}`}
                      onClick={() => setSelectedOutcome(outcome)}
                      disabled={outcome === resolution.resolvedOutcome}
                    >
                      {outcome}
                      {outcome === resolution.resolvedOutcome && ' (current)'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="dispute-form">
                <label>Evidence URL</label>
                <input
                  type="url"
                  className="dispute-url-input"
                  placeholder="https://example.com/evidence"
                  value={evidenceUrl}
                  onChange={(e) => setEvidenceUrl(e.target.value)}
                />
              </div>

              <div className="dispute-form">
                <label>Reasoning</label>
                <textarea
                  className="dispute-evidence-input"
                  placeholder="Explain why you believe the resolution is incorrect..."
                  value={reasoning}
                  onChange={(e) => setReasoning(e.target.value)}
                  rows={4}
                />
              </div>

              <div className="analysis-fee-row">
                <label>Dispute Fee</label>
                <div className="fee-input-group">
                  <input
                    type="number"
                    min={minFees.dispute.toString()}
                    step="0.1"
                    value={genAmount}
                    onChange={(e) => setGenAmount(e.target.value)}
                    className="gen-input"
                  />
                  <span className="gen-label">GEN</span>
                </div>
                <span className="fee-hint">Minimum: {minFees.dispute} GEN</span>
              </div>

              {network.current !== 'genlayer' && (
                <div className="analysis-connect-prompt">
                  <p>Switch to the GenLayer Studio network to submit disputes.</p>
                  <button
                    className="btn-pill btn-pill-primary"
                    onClick={network.switchToGenLayer}
                    disabled={network.isSwitching}
                  >
                    {network.isSwitching ? 'Switching...' : 'Switch to GenLayer Studio'}
                  </button>
                </div>
              )}

              {displayError && <div className="error-message" style={{ background: '#fff0f0', border: '1px solid #ffb3b3', color: '#d00', padding: '12px', borderRadius: '8px', marginBottom: '12px', fontSize: '14px' }}>{displayError}</div>}

              {network.current === 'genlayer' && (
                <button
                  className="btn-pill btn-pill-primary"
                  onClick={handleDispute}
                  disabled={loading}
                  style={{ width: '100%', marginTop: '16px' }}
                >
                  {loading ? 'Submitting Dispute...' : `Submit Dispute for ${parseFloat(genAmount) || 0} GEN`}
                </button>
              )}
            </>
          )}

          {step === 'processing' && (
            <div className="analysis-loading">
              <div className="genlayer-spinner">
                <div className="spinner-ring"></div>
                <div className="spinner-ring"></div>
                <div className="spinner-ring"></div>
              </div>
              <h4>GenLayer Reviewing Dispute</h4>
              <p className="tx-status">{txStatus}</p>
              <div className="analyze-steps">
                <div className="step active">
                  <span className="step-dot"></span>
                  <span>Dispute submitted</span>
                </div>
                <div className="step">
                  <span className="step-dot"></span>
                  <span>AI reviewing evidence</span>
                </div>
                <div className="step">
                  <span className="step-dot"></span>
                  <span>Consensus judgment</span>
                </div>
                <div className="step">
                  <span className="step-dot"></span>
                  <span>Dispute resolved</span>
                </div>
              </div>
            </div>
          )}

          {step === 'done' && (
            <div className="resolution-complete">
              <div className="success-icon">✓</div>
              <h4>Dispute Reviewed</h4>
              <p>GenLayer AI has reviewed your dispute and made a final judgment.</p>
              <button className="btn-pill btn-pill-primary" onClick={onClose}>
                Close
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
