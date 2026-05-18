import { useState } from 'react'
import type { PolymarketMarket } from '../types/market'
import { formatPriceLevel } from '../types/market'

interface BuyModalProps {
  market: PolymarketMarket
  onClose: () => void
  onBuy: (outcomeIndex: number, amountGen: number) => Promise<void>
}

export function BuyModal({ market, onClose, onBuy }: BuyModalProps) {
  const [selectedOutcome, setSelectedOutcome] = useState(0)
  const [amount, setAmount] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleBuy = async () => {
    const amountNum = parseFloat(amount)
    if (isNaN(amountNum) || amountNum <= 0) return

    setSubmitting(true)
    try {
      await onBuy(selectedOutcome, amountNum)
      onClose()
    } catch {
      setSubmitting(false)
    }
  }

  const estimatedShares = amount ? parseFloat(amount) / (market.probabilities[selectedOutcome] || 0.5) : 0

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Buy Shares</h2>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>

        <div className="modal-body">
          <p className="modal-market-question">{market.question}</p>

          <div className="trade-outcome-selector">
            <label>Select Outcome</label>
            <div className="trade-outcomes">
              {market.outcomes.map((outcome, index) => {
                const probability = market.probabilities[index] || 0
                const isSelected = selectedOutcome === index
                return (
                  <button
                    key={outcome}
                    className={`trade-outcome-btn ${isSelected ? 'selected' : ''}`}
                    onClick={() => setSelectedOutcome(index)}
                  >
                    <span className="trade-outcome-name">{outcome}</span>
                    <span className="trade-outcome-price">{formatPriceLevel(probability)}</span>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="trade-input-group">
            <label>Amount (GEN)</label>
            <input
              type="number"
              className="trade-input"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              min="0"
              step="0.01"
            />
          </div>

          {amount && parseFloat(amount) > 0 && (
            <div className="trade-summary">
              <div className="trade-summary-row">
                <span>Outcome</span>
                <span>{market.outcomes[selectedOutcome]}</span>
              </div>
              <div className="trade-summary-row">
                <span>Price per share</span>
                <span>{formatPriceLevel(market.probabilities[selectedOutcome] || 0)}</span>
              </div>
              <div className="trade-summary-row">
                <span>Estimated shares</span>
                <span>~{estimatedShares.toFixed(0)}</span>
              </div>
              <div className="trade-summary-row trade-summary-total">
                <span>Total cost</span>
                <span>{amount} GEN</span>
              </div>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button
            className="btn-primary"
            onClick={handleBuy}
            disabled={submitting || !amount || parseFloat(amount) <= 0}
          >
            {submitting ? 'Processing...' : `Buy ${market.outcomes[selectedOutcome]}`}
          </button>
        </div>
      </div>
    </div>
  )
}
