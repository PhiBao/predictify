import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAccount } from 'wagmi';
import type { Market, Outcome } from '../types/predict';
import { formatPriceLevel } from '../types/predict';
import { usePredictSDK } from '../hooks/usePredictSDK';
import { useToast } from '../contexts/ToastContext';
import { useNetworkState } from '../hooks/useNetworkState';
import { TradeModal } from './TradeModal';

interface MarketCardProps {
  market: Market;
}

export function MarketCard({ market }: MarketCardProps) {
  const { isConnected } = useAccount();
  const { isReady } = usePredictSDK();
  const { showToast } = useToast();
  const network = useNetworkState();

  const [selectedOutcome, setSelectedOutcome] = useState<Outcome | null>(null);
  const [showTradeModal, setShowTradeModal] = useState(false);

  const statusClass = market.status?.toLowerCase() || 'open';

  const handleOutcomeClick = async (outcome: Outcome, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!isConnected) {
      showToast('Connect your wallet to trade', 'warning');
      return;
    }

    if (network.current === 'genlayer') {
      showToast('Switching to BNB Chain...', 'info');
      try {
        await network.switchToBSC();
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Network switch failed', 'error');
        return;
      }
    }

    if (!isReady) {
      showToast('SDK initializing. Please wait a moment.', 'warning');
      return;
    }

    setSelectedOutcome(outcome);
    setShowTradeModal(true);
  };

  const handleCloseTrade = () => {
    setShowTradeModal(false);
    setSelectedOutcome(null);
  };

  const getButtonLabel = (outcome: Outcome): string => {
    if (!isConnected) return outcome.name;
    if (network.current === 'genlayer') return `${outcome.name} — Switch to BNB`;
    if (!isReady) return `${outcome.name} — Initializing...`;
    return outcome.name;
  };

  const isButtonDisabled = (): boolean => {
    if (!isConnected) return false; // still clickable to show toast
    if (network.isSwitching) return true;
    return false; // allow click to trigger switch or trade
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

            <div className={`outcomes ${market.outcomes.length === 2 ? 'outcomes-binary' : ''}`}>
              {market.outcomes.slice(0, 3).map((outcome) => (
                <button
                  key={outcome.onChainId}
                  className={`outcome-btn ${network.current === 'genlayer' ? 'needs-switch' : ''}`}
                  onClick={(e) => handleOutcomeClick(outcome, e)}
                  disabled={isButtonDisabled()}
                  aria-label={`Trade ${outcome.name}`}
                  title={
                    !isConnected
                      ? 'Connect your wallet to trade'
                      : network.current === 'genlayer'
                        ? 'Click to switch to BNB Chain and trade'
                        : !isReady
                          ? 'SDK initializing...'
                          : 'Click to trade'
                  }
                >
                  <span>{getButtonLabel(outcome)}</span>
                  {outcome.bestAsk && network.current !== 'genlayer' && (
                    <span className="outcome-price">{formatPriceLevel(outcome.bestAsk)}</span>
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
