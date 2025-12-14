import { useState } from 'react';
import { createPortal } from 'react-dom';
import type { Market, Outcome } from '../types/predict';
import { TradeModal } from './TradeModal';

interface MarketCardProps {
  market: Market;
}

export function MarketCard({ market }: MarketCardProps) {
  const [selectedOutcome, setSelectedOutcome] = useState<Outcome | null>(null);
  const [showModal, setShowModal] = useState(false);

  const handleOutcomeClick = (outcome: Outcome) => {
    setSelectedOutcome(outcome);
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setSelectedOutcome(null);
  };

  return (
    <div className="market-card">
      <div className="market-header">
        {market.imageUrl && <img src={market.imageUrl} alt={market.title} className="market-image" />}
        <h3>{market.question}</h3>
        <span className={`market-status ${market.status?.toLowerCase() || 'open'}`}>
          {market.status || 'OPEN'}
        </span>
      </div>
      
      <p className="market-description">{market.description}</p>
      
      <div className="market-stats">
        <div className="stat">
          <span className="label">Category:</span>
          <span className="value">{market.categorySlug}</span>
        </div>
        <div className="stat">
          <span className="label">Fee:</span>
          <span className="value">{(market.feeRateBps / 100).toFixed(2)}%</span>
        </div>
        <div className="stat">
          <span className="label">Created:</span>
          <span className="value">{new Date(market.createdAt).toLocaleDateString()}</span>
        </div>
      </div>

      <div className="outcomes">
        {market.outcomes.map((outcome) => (
          <button
            key={outcome.onChainId}
            className={`outcome-btn ${selectedOutcome?.onChainId === outcome.onChainId ? 'selected' : ''}`}
            onClick={() => handleOutcomeClick(outcome)}
          >
            {outcome.name}
            {outcome.status && <span className="outcome-status"> ({outcome.status})</span>}
          </button>
        ))}
      </div>

      {showModal && selectedOutcome && createPortal(
        <TradeModal
          market={market}
          outcome={selectedOutcome}
          onClose={handleCloseModal}
        />,
        document.body
      )}
    </div>
  );
}
