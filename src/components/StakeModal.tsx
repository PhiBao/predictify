import { useState, useEffect } from 'react'

interface StakeModalProps {
  isOpen: boolean
  onClose: () => void
  marketId: string
  question: string
  outcomes: string[]
  endDate: string
  defaultOutcomeIndex?: number
  onStake: (marketId: string, question: string, outcomes: string[], endDate: string, outcomeIndex: number, amountGen: number) => Promise<boolean>
  loading: boolean
}

export function StakeModal({ isOpen, onClose, marketId, question, outcomes, endDate, defaultOutcomeIndex = 0, onStake, loading }: StakeModalProps) {
  const [selectedOutcome, setSelectedOutcome] = useState(defaultOutcomeIndex)
  const [amount, setAmount] = useState('')

  useEffect(() => {
    setSelectedOutcome(defaultOutcomeIndex)
  }, [defaultOutcomeIndex])

  useEffect(() => {
    if (!isOpen) {
      setAmount('')
      setSelectedOutcome(defaultOutcomeIndex)
    }
  }, [isOpen, defaultOutcomeIndex])

  const handleStake = async () => {
    const amountNum = parseFloat(amount)
    if (isNaN(amountNum) || amountNum <= 0) return

    await onStake(marketId, question, outcomes, endDate, selectedOutcome, amountNum)
  }

  if (!isOpen) return null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Stake on Outcome</h2>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>

        <div className="modal-body">
          <p className="modal-market-question">{question}</p>

          <div className="trade-outcome-selector">
            <label>Select Outcome</label>
            <div className="trade-outcomes">
              {outcomes.map((outcome, index) => {
                const isSelected = selectedOutcome === index
                return (
                  <button
                    key={outcome}
                    className={`trade-outcome-btn ${isSelected ? 'selected' : ''}`}
                    onClick={() => setSelectedOutcome(index)}
                  >
                    <span className="trade-outcome-name">{outcome}</span>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="trade-input-group">
            <label>Stake Amount (GEN)</label>
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
                <span>{outcomes[selectedOutcome]}</span>
              </div>
              <div className="trade-summary-row trade-summary-total">
                <span>Your stake</span>
                <span>{amount} GEN</span>
              </div>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <button
            className="btn-primary"
            onClick={handleStake}
            disabled={loading || !amount || parseFloat(amount) <= 0}
          >
            {loading ? 'Processing...' : `Stake ${amount} GEN on ${outcomes[selectedOutcome]}`}
          </button>
        </div>
      </div>
    </div>
  )
}
