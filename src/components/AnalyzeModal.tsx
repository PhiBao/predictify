import type { PolymarketMarket } from '../types/market'

interface AnalyzeModalProps {
  market: PolymarketMarket
  onClose: () => void
}

export function AnalyzeModal({ market, onClose }: AnalyzeModalProps) {
  void market

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content analyze-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>GenLayer Analysis</h2>
          <button className="close-btn" onClick={onClose} aria-label="Close modal">×</button>
        </div>

        <div className="modal-body">
          <div className="analyze-market-info">
            <span className="analyze-label">Market</span>
            <p className="analyze-question">{market.question}</p>
          </div>

          <div className="analyze-notice">
            <p>AI analysis is currently disabled. Focus on trading and resolution features.</p>
          </div>

          <div className="modal-footer analyze-footer">
            <button className="btn btn-primary" onClick={onClose}>Close</button>
          </div>
        </div>
      </div>
    </div>
  )
}
