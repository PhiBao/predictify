import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAccount } from 'wagmi';
import type { Market, Outcome } from '../types/predict';
import { formatPriceLevel } from '../types/predict';
import { usePredictSDK } from '../hooks/usePredictSDK';
import { useToast } from '../contexts/ToastContext';
import { useNetworkState } from '../hooks/useNetworkState';
import { TradeModal } from './TradeModal';

export interface MarketGroup {
  question: string;
  imageUrl: string;
  description: string;
  categorySlug: string;
  status: string | null;
  feeRateBps: number;
  isNegRisk: boolean;
  isYieldBearing: boolean;
  markets: Market[];
}

interface GroupedMarketCardProps {
  group: MarketGroup;
}

export function GroupedMarketCard({ group }: GroupedMarketCardProps) {
  const { isConnected } = useAccount();
  const { isReady } = usePredictSDK();
  const { showToast } = useToast();
  const network = useNetworkState();

  const [tradeMarket, setTradeMarket] = useState<Market | null>(null);
  const [tradeOutcome, setTradeOutcome] = useState<Outcome | null>(null);
  const [showTradeModal, setShowTradeModal] = useState(false);

  const statusClass = group.status?.toLowerCase() || 'open';

  const handleTrade = async (market: Market, outcome: Outcome, e: React.MouseEvent) => {
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

    setTradeMarket(market);
    setTradeOutcome(outcome);
    setShowTradeModal(true);
  };

  const handleCloseTrade = () => {
    setShowTradeModal(false);
    setTradeOutcome(null);
    setTradeMarket(null);
  };

  return (
    <>
      <Link
        to={`/market/group/${encodeURIComponent(group.categorySlug)}`}
        className="market-card-link"
      >
        <div className="market-card grouped-market-card">
        <div className="market-image-wrapper">
          {group.imageUrl ? (
            <img
              src={group.imageUrl}
              alt={group.question}
              className="market-image"
              loading="lazy"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          ) : null}
          <span className={`market-status-badge ${statusClass}`}>
            {group.status || 'OPEN'}
          </span>
        </div>

        <div className="market-body">
          <h3 className="market-question">{group.question}</h3>

          {group.description && (
            <p className="market-description">{group.description.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')}</p>
          )}

          <div className="market-meta">
            <span className="market-meta-item">
              Category:<span>{group.categorySlug}</span>
            </span>
            <span className="market-meta-item">
              Fee:<span>{(group.feeRateBps / 100).toFixed(2)}%</span>
            </span>
            {group.markets.length > 1 && (
              <span className="market-meta-item">
                Ranges:<span>{group.markets.length}</span>
              </span>
            )}
          </div>

          <div className="grouped-outcomes">
            {group.markets.map((market) => (
              <div key={market.id} className="grouped-market-row">
                <div className="grouped-market-row-header">
                  <span className="grouped-market-title">{market.title}</span>
                  {market.outcomes[0]?.bestAsk && (
                    <span className="grouped-market-probability">
                      {formatPriceLevel(market.outcomes[0].bestAsk)}
                    </span>
                  )}
                </div>
                <div className="grouped-market-outcomes">
                  {market.outcomes.map((outcome) => (
                    <button
                      key={outcome.onChainId}
                      className={`grouped-outcome-btn ${network.current === 'genlayer' ? 'needs-switch' : ''}`}
                      onClick={(e) => handleTrade(market, outcome, e)}
                      disabled={network.isSwitching}
                      aria-label={`Trade ${outcome.name} on ${market.title}`}
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
                      {!isConnected
                        ? outcome.name
                        : network.current === 'genlayer'
                          ? `${outcome.name} — Switch to BNB`
                          : !isReady
                            ? `${outcome.name} — Initializing...`
                            : outcome.name}
                    </button>
                  ))}
                </div>

              </div>
            ))}
          </div>
        </div>
        </div>
      </Link>

      {showTradeModal && tradeMarket && tradeOutcome && (
        <TradeModal
          market={tradeMarket}
          outcome={tradeOutcome}
          onClose={handleCloseTrade}
        />
      )}
    </>
  );
}
