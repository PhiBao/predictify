import { useState } from 'react'
import type { PolymarketMarket, Position } from '../types/market'
import { formatPriceLevel, formatShares } from '../types/market'

interface SellModalProps {
  market: PolymarketMarket
  positions: Position[]
  onClose: () => void
  onSell: (outcomeIndex: number, sharesAmount: number) => Promise<void>
}

export function SellModal({ market, positions, onClose, onSell }: SellModalProps) {
  const [selectedOutcome, setSelectedOutcome] = useState(positions[0]?.outcomeIndex ?? 0)
  const [sharesAmount, setSharesAmount] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const selectedPosition = positions.find((p) => p.outcomeIndex === selectedOutcome)
  const maxShares = selectedPosition?.shares ?? 0
  const pricePerShare = market.probabilities[selectedOutcome] || 0
  const estimatedPayout = sharesAmount ? parseFloat(sharesAmount) * pricePerShare : 0

  const handleSell = async () => {
    const sharesNum = parseFloat(sharesAmount)
    if (isNaN(sharesNum) || sharesNum <= 0 || sharesNum > maxShares) return

    setSubmitting(true)
    try {
      await onSell(selectedOutcome, sharesNum)
      onClose()
    } catch {
      setSubmitting(false)
    }
  }

  const handleMax = () => {
    setSharesAmount(maxShares.toString())
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Sell Shares</h2>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>

        <div className="modal-body">
          <p className="modal-market-question">{market.question}</p>

          {positions.length > 0 ? (
            <>
              <div className="trade-outcome-selector">
                <label>Select Position to Sell</label>
                <div className="trade-outcomes">
                  {positions.map((pos) => {
                    const outcomeName = market.outcomes[pos.outcomeIndex] || `Outcome ${pos.outcomeIndex}`
                    const isSelected = selectedOutcome === pos.outcomeIndex
                    return (
                      <button
                        key={pos.outcomeIndex}
                        className={`trade-outcome-btn ${isSelected ? 'selected' : ''}`}
                        onClick={() => {
                          setSelectedOutcome(pos.outcomeIndex)
                          setSharesAmount('')
                        }}
                      >
                        <span className="trade-outcome-name">{outcomeName}</span>
                        <span className="trade-outcome-shares">{formatShares(pos.shares)} shares</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="trade-input-group">
                <label>Shares to Sell</label>
                <div className="trade-input-with-max">
                  <input
                    type="number"
                    className="trade-input"
                    placeholder="0"
                    value={sharesAmount}
                    onChange={(e) => setSharesAmount(e.target.value)}
                    min="0"
                    max={maxShares}
                    step="1"
                  />
                  <button className="btn-max" onClick={handleMax} type="button">
                    MAX
                  </button>
                </div>
                <span className="trade-input-hint">
                  Available: {formatShares(maxShares)} shares
                </span>
              </div>

              {sharesAmount && parseFloat(sharesAmount) > 0 && (
                <div className="trade-summary">
                  <div className="trade-summary-row">
                    <span>Outcome</span>
                    <span>{market.outcomes[selectedOutcome]}</span>
                  </div>
                  <div className="trade-summary-row">
                    <span>Price per share</span>
                    <span>{formatPriceLevel(pricePerShare)}</span>
                  </div>
                  <div className="trade-summary-row">
                    <span>Shares to sell</span>
                    <span>{formatShares(parseFloat(sharesAmount))}</span>
                  </div>
                  <div className="trade-summary-row trade-summary-total">
                    <span>Estimated payout</span>
                    <span>~{estimatedPayout.toFixed(4)} GEN</span>
                  </div>
                </div>
              )}
            </>
          ) : (
            <p className="no-positions">You don't have any shares to sell for this market.</p>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button
            className="btn-primary"
            onClick={handleSell}
            disabled={submitting || !sharesAmount || parseFloat(sharesAmount) <= 0 || parseFloat(sharesAmount) > maxShares}
          >
            {submitting ? 'Processing...' : 'Sell Shares'}
          </button>
        </div>
      </div>
    </div>
  )
}
