import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { Market, Outcome } from '../types/predict';
import { TradeModal } from './TradeModal';

interface MarketCardProps {
  market: Market;
}

export function MarketCard({ market }: MarketCardProps) {
  const [selectedOutcome, setSelectedOutcome] = useState<Outcome | null>(null);
  const [showTradeModal, setShowTradeModal] = useState(false);

  const statusClass = market.status?.toLowerCase() || 'open';

  const handleOutcomeClick = (outcome: Outcome, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedOutcome(outcome);
    setShowTradeModal(true);
  };

  const handleCloseTrade = () => {
    setShowTradeModal(false);
    setSelectedOutcome(null);
  };

  return (
    <>
      <Link to={`/market/${market.id}`} className="market-card-link">
        <div className="market-card">
          <div className="market-image-wrapper">
            {market.imageUrl ? (
              <img
                src={market.imageUrl}
                alt={market.title}
                className="market-image"
                loading="lazy"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            ) : null}
            <span className={`market-status-badge ${statusClass}`}>
              {market.status || 'OPEN'}
            </span>
          </div>

          <div className="market-body">
            <h3 className="market-question">{market.question}</h3>

            <div className="market-meta">
              <span className="market-meta-item">
                Category:<span>{market.categorySlug}</span>
              </span>
              <span className="market-meta-item">
                Fee:<span>{(market.feeRateBps / 100).toFixed(2)}%</span>
              </span>
            </div>

            <div className="outcomes">
              {market.outcomes.slice(0, 3).map((outcome) => (
                <button
                  key={outcome.onChainId}
                  className="outcome-btn"
                  onClick={(e) => handleOutcomeClick(outcome, e)}
                  aria-label={`Trade ${outcome.name}`}
                >
                  <span>{outcome.name}</span>
                  {outcome.bestAsk && (
                    <span className="outcome-price">{outcome.bestAsk}</span>
                  )}
                </button>
              ))}
              {market.outcomes.length > 3 && (
                <span className="outcome-more">+{market.outcomes.length - 3} more</span>
              )}
            </div>

            <div className="market-actions">
              <span className="market-view-link">
                View Market →
              </span>
            </div>
          </div>
        </div>
      </Link>

      {showTradeModal && selectedOutcome && (
        <TradeModal
          market={market}
          outcome={selectedOutcome}
          onClose={handleCloseTrade}
        />
      )}
    </>
  );
}
