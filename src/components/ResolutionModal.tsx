import { useState } from 'react'
import { useAccount } from 'wagmi'
import { useGenLayer } from '../hooks/useGenLayer'
import { useNetworkState } from '../hooks/useNetworkState'
import { useToast } from '../contexts/ToastContext'
import type { PolymarketMarket, GenLayerResolution } from '../types/market'

interface ResolutionModalProps {
  market: PolymarketMarket
  onClose: () => void
  onResolved: (resolution: GenLayerResolution) => void
}

export function ResolutionModal({ market, onClose, onResolved }: ResolutionModalProps) {
  const { address, isConnected } = useAccount()
  const network = useNetworkState()
  const { showToast } = useToast()
  const { resolve, loading, error, txStatus } = useGenLayer()

  const [step, setStep] = useState<'input' | 'processing' | 'done'>('input')

  const handleResolve = async () => {
    if (!isConnected || !address) {
      showToast('Please connect your wallet first', 'warning')
      return
    }

    if (network.current !== 'genlayer') {
      showToast('Please switch to GenLayer network first', 'warning')
      return
    }

    setStep('processing')

    try {
      const result = await resolve(address, market.id, market.question, market.outcomes, market.endDate || '')
      if (result) {
        onResolved(result)
        setStep('done')
        showToast('Market resolved by GenLayer!', 'success')
      }
    } catch {
      setStep('input')
      showToast('Resolution failed. Check error details.', 'error')
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Request Market Resolution</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          <p className="modal-description">
            GenLayer AI will evaluate all available evidence and determine the outcome of this market.
            This process uses decentralized consensus to ensure trustless resolution.
          </p>

          <div className="modal-market-preview">
            <h4>{market.question}</h4>
            <div className="modal-outcomes">
              {market.outcomes.map((outcome) => (
                <span key={outcome} className="modal-outcome-tag">{outcome}</span>
              ))}
            </div>
          </div>

          {step === 'input' && (
            <>
              {network.current !== 'genlayer' && (
                <div className="analysis-connect-prompt">
                  <p>Switch to the GenLayer Studio network to submit resolution requests.</p>
                  <button
                    className="btn-pill btn-pill-primary"
                    onClick={network.switchToGenLayer}
                    disabled={network.isSwitching}
                  >
                    {network.isSwitching ? 'Switching...' : 'Switch to GenLayer Studio'}
                  </button>
                </div>
              )}

              {network.current === 'genlayer' && (
                <>
                  {error && <div className="error-message">{error}</div>}

                  <button
                    className="btn-pill btn-pill-primary"
                    onClick={handleResolve}
                    disabled={loading}
                    style={{ width: '100%', marginTop: '16px' }}
                  >
                    {loading ? 'Resolving...' : 'Request Resolution'}
                  </button>
                </>
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
              <h4>GenLayer Resolving Market</h4>
              <p className="tx-status">{txStatus}</p>
              <div className="analyze-steps">
                <div className="step active">
                  <span className="step-dot"></span>
                  <span>Resolution submitted</span>
                </div>
                <div className="step">
                  <span className="step-dot"></span>
                  <span>AI evaluating evidence</span>
                </div>
                <div className="step">
                  <span className="step-dot"></span>
                  <span>Consensus verification</span>
                </div>
                <div className="step">
                  <span className="step-dot"></span>
                  <span>Resolution finalized</span>
                </div>
              </div>
            </div>
          )}

          {step === 'done' && (
            <div className="resolution-complete">
              <div className="success-icon">✓</div>
              <h4>Resolution Submitted</h4>
              <p>The market will be resolved by GenLayer AI consensus.</p>
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
