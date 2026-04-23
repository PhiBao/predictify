import { useEffect, useState, useCallback } from 'react';
import { useAccount, useWalletClient } from 'wagmi';
import { predictAPI } from '../services/predictAPI';
import { formatEther } from 'ethers';
import { SellModal } from './SellModal';
import { usePredictSDK } from '../hooks/usePredictSDK';
import { useToast } from '../contexts/ToastContext';

interface OutcomeData {
  name?: string;
  status?: string;
  onChainId?: string;
  indexSet?: number;
  id?: string;
}

interface MarketData {
  id?: string | number;
  question?: string;
  status?: string;
  outcomes?: OutcomeData[];
  isYieldBearing?: boolean;
  isNegRisk?: boolean;
  conditionId?: string;
  condition?: { id?: string };
}

interface PositionData {
  id?: string;
  market?: MarketData;
  outcome?: OutcomeData;
  amount?: string;
  valueUsd?: string;
}

type PositionResult = 'win' | 'loss' | 'pending' | 'unknown';

function getHiddenPositionsKey(address: string): string {
  return `predictify:hidden-positions:${address.toLowerCase()}`;
}

function loadHiddenPositions(address: string): string[] {
  try {
    const raw = localStorage.getItem(getHiddenPositionsKey(address));
    if (raw) return JSON.parse(raw) as string[];
  } catch {
    // ignore
  }
  return [];
}

function saveHiddenPositions(address: string, keys: string[]): void {
  try {
    localStorage.setItem(getHiddenPositionsKey(address), JSON.stringify(keys));
  } catch {
    // ignore
  }
}

function getPositionKey(position: PositionData): string {
  const marketId = position.market?.id ?? 'unknown';
  const outcomeId = position.outcome?.onChainId ?? position.outcome?.id ?? 'unknown';
  return position.id || `${marketId}-${outcomeId}`;
}

function determineResult(position: PositionData): {
  result: PositionResult;
  winningOutcome?: OutcomeData;
} {
  const market = position.market;
  const positionOutcome = position.outcome;

  if (!market || !positionOutcome) {
    return { result: 'unknown' };
  }

  const marketStatus = market.status;
  const isResolved =
    marketStatus === 'RESOLVED' ||
    marketStatus === 'CLOSED' ||
    marketStatus === 'SETTLED';

  const outcomes = market.outcomes ?? [];

  // 1. Find the explicit winning outcome from market outcomes
  const winningOutcome = outcomes.find((o) => {
    const s = o.status?.toUpperCase() || '';
    return s === 'WIN' || s === 'WINNER' || s === 'WON';
  });

  if (winningOutcome) {
    const isWinning =
      positionOutcome.onChainId === winningOutcome.onChainId ||
      positionOutcome.indexSet === winningOutcome.indexSet ||
      positionOutcome.id === winningOutcome.id;
    return { result: isWinning ? 'win' : 'loss', winningOutcome };
  }

  // 2. Market is resolved but no explicit winner found
  if (isResolved) {
    const userStatus = (positionOutcome.status || '').toUpperCase();

    if (userStatus === 'WIN' || userStatus === 'WINNER' || userStatus === 'WON') {
      // User's own outcome claims win, but we couldn't verify it against market outcomes.
      // Trust it but flag as pending until market outcomes reflect the result.
      return { result: 'pending' };
    }

    if (userStatus === 'LOSS' || userStatus === 'LOST' || userStatus === 'LOSE' || userStatus === 'LOSER') {
      return { result: 'loss' };
    }

    // If every other outcome has a non-WIN status and user's doesn't, it's likely a loss
    const anyOtherWin = outcomes.some((o) => {
      const s = (o.status || '').toUpperCase();
      return s === 'WIN' || s === 'WINNER' || s === 'WON';
    });

    if (anyOtherWin) {
      // This shouldn't happen because we search for winningOutcome above,
      // but as a safety net: if some other outcome is WIN, user lost.
      return { result: 'loss' };
    }

    // Cannot determine — show as unknown rather than guessing
    return { result: 'unknown' };
  }

  // 3. Market still open
  return { result: 'pending' };
}

export function UserPositions() {
  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();
  const { orderBuilder, isReady } = usePredictSDK();
  const { showToast } = useToast();
  const [positions, setPositions] = useState<PositionData[]>([]);
  const [loading, setLoading] = useState(false);
  const [claiming, setClaiming] = useState('');
  const [sellModalPosition, setSellModalPosition] = useState<PositionData | null>(null);
  const [hiddenPositions, setHiddenPositions] = useState<string[]>([]);
  const [showHidden, setShowHidden] = useState(false);

  const fetchPositions = useCallback(async () => {
    if (!address || !walletClient) return;

    try {
      setLoading(true);

      // Get JWT token first
      try {
        const authMessageResponse = await predictAPI.getAuthMessage(address);
        const message = authMessageResponse.data?.message ?? authMessageResponse.message;
        const signature = await walletClient.signMessage({
          account: address,
          message,
        });
        const jwtResponse = await predictAPI.getJWT(address, signature, message);
        const jwtToken = jwtResponse?.data?.token;

        if (jwtToken) {
          predictAPI.setJWT(jwtToken);
        }
      } catch (authErr) {
        console.log('Authentication failed, trying without JWT:', authErr);
      }

      const data = await predictAPI.getPositions(address);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rawData = data as any;
      const positionsArray: PositionData[] = rawData.data?.positions ?? rawData.data ?? rawData.positions ?? [];
      setPositions(positionsArray);
    } catch (err) {
      if (err instanceof Error && (err.message.includes('404') || err.message.includes('401'))) {
        console.log('No positions found or authentication required');
        setPositions([]);
      } else {
        console.error('Failed to fetch positions:', err);
      }
    } finally {
      setLoading(false);
    }
  }, [address, walletClient]);

  useEffect(() => {
    fetchPositions();
  }, [fetchPositions]);

  useEffect(() => {
    if (address) {
      setHiddenPositions(loadHiddenPositions(address));
    } else {
      setHiddenPositions([]);
    }
  }, [address]);

  const handleSell = (position: PositionData) => {
    setSellModalPosition(position);
  };

  const handleSellSuccess = () => {
    fetchPositions();
  };

  const handleDismiss = (position: PositionData) => {
    if (!address) return;
    const key = getPositionKey(position);
    const next = [...hiddenPositions, key];
    setHiddenPositions(next);
    saveHiddenPositions(address, next);
  };

  const handleRestore = (position: PositionData) => {
    if (!address) return;
    const key = getPositionKey(position);
    const next = hiddenPositions.filter((k) => k !== key);
    setHiddenPositions(next);
    saveHiddenPositions(address, next);
  };

  const handleClaim = async (position: PositionData) => {
    if (!address || !walletClient || !isReady || !orderBuilder) {
      showToast('Wallet not connected or SDK not ready', 'error');
      return;
    }

    const market = position.market;
    const positionOutcome = position.outcome;

    if (!market || !positionOutcome) {
      showToast('Invalid position data', 'error');
      return;
    }

    const { result } = determineResult(position);

    if (result !== 'win') {
      showToast('This position did not win. No payout available.', 'info');
      return;
    }

    const positionKey = getPositionKey(position);
    setClaiming(positionKey);

    try {
      showToast('Claiming winnings...', 'info');

      const conditionId = market.conditionId || market.condition?.id;
      if (!conditionId) {
        throw new Error('Market condition ID not found. Cannot redeem.');
      }

      const outcomes = market.outcomes ?? [];
      const winningOutcome = outcomes.find((o) => {
        const s = (o.status || '').toUpperCase();
        return s === 'WIN' || s === 'WINNER' || s === 'WON';
      });

      const indexSet = winningOutcome?.indexSet === 2 ? 2 : 1;

      const result = await orderBuilder.redeemPositions({
        conditionId,
        indexSet: indexSet as 1 | 2,
        isNegRisk: Boolean(market.isNegRisk),
        isYieldBearing: Boolean(market.isYieldBearing),
      });

      if (!result.success) {
        const fail = result as { success: false; cause?: Error | string };
        const causeStr = fail.cause instanceof Error ? fail.cause.message : (fail.cause || 'Redemption failed');
        throw new Error(causeStr);
      }

      showToast('Confirming transaction...', 'info');

      const amountInWei = position.amount || '0';
      const sharesNum = parseFloat(formatEther(amountInWei));
      showToast(`Successfully claimed ${sharesNum.toFixed(2)} USDT!`, 'success');

      fetchPositions();
    } catch (err) {
      console.error('Claim failed:', err);
      const errorMsg = err instanceof Error ? err.message : 'Failed to claim winnings';
      showToast(errorMsg, 'error');
    } finally {
      setClaiming('');
    }
  };

  if (!address) {
    return (
      <div className="positions-empty">
        Connect your wallet to view positions
      </div>
    );
  }

  if (loading) {
    return (
      <div className="user-positions">
        <h2 className="section-title light">Your Positions</h2>
        <div className="loading">Loading positions...</div>
      </div>
    );
  }

  const visiblePositions = positions.filter((p) => !hiddenPositions.includes(getPositionKey(p)));
  const dismissedPositions = positions.filter((p) => hiddenPositions.includes(getPositionKey(p)));

  if (positions.length === 0) {
    return (
      <div className="user-positions">
        <h2 className="section-title light">Your Positions</h2>
        <div className="positions-empty">
          No active positions. Start trading to see your positions here!
          <div style={{ fontSize: '0.75rem', marginTop: '0.5rem', color: 'var(--apple-text-tertiary)' }}>
            Connected: {address.slice(0, 6)}...{address.slice(-4)}
          </div>
        </div>
      </div>
    );
  }

  const renderPositionCard = (position: PositionData, isHidden: boolean) => {
    const market = position.market;
    const positionOutcome = position.outcome;

    if (!market || !positionOutcome) return null;

    const marketQuestion = market.question || 'Unknown Market';
    const outcomeName = positionOutcome.name || 'Unknown';

    const amountInWei = position.amount || '0';
    const sharesNum = parseFloat(formatEther(amountInWei));

    const valueUsd = position.valueUsd || '0';
    const valueNum = parseFloat(valueUsd);

    const avgPrice = sharesNum > 0 ? (valueNum / sharesNum) : 0;

    const { result } = determineResult(position);
    const isResolved = result === 'win' || result === 'loss' || result === 'unknown';

    const positionKey = getPositionKey(position);
    const isClaimingThis = claiming === positionKey;

    const badgeClass =
      result === 'win' ? 'winning' :
      result === 'loss' ? 'losing' :
      result === 'unknown' ? 'unknown' : '';

    const badgeLabel =
      result === 'win' ? 'Winner' :
      result === 'loss' ? 'Lost' :
      result === 'unknown' ? 'Result Pending' : '';

    return (
      <div key={positionKey} className={`position-card ${isHidden ? 'dimmed' : ''}`}>
        {isResolved && badgeLabel && (
          <div className={`position-badge ${badgeClass}`}>
            {badgeLabel}
          </div>
        )}
        <div className="position-market" title={marketQuestion}>
          {marketQuestion}
        </div>
        <div className="position-outcome">{outcomeName}</div>
        <div className="position-details">
          <div>
            <div className="position-shares">{sharesNum.toFixed(2)} shares</div>
            {!isResolved && <div className="position-avg-price">Avg: ${avgPrice.toFixed(3)}/share</div>}
            {result === 'win' && (
              <div className="position-payout">Payout: ${sharesNum.toFixed(2)} USDT</div>
            )}
          </div>
          <div className="position-value">
            {!isResolved && `$${valueNum.toFixed(2)}`}
            {result === 'win' && `$${sharesNum.toFixed(2)}`}
            {result === 'loss' && '$0.00'}
            {result === 'unknown' && `$${valueNum.toFixed(2)}`}
          </div>
        </div>

        {!isResolved && !isHidden && (
          <button
            className="btn-sell"
            onClick={() => handleSell(position)}
            disabled={sharesNum === 0}
          >
            Sell Position
          </button>
        )}

        {result === 'win' && !isHidden && (
          <button
            className="btn-claim"
            onClick={() => handleClaim(position)}
            disabled={sharesNum === 0 || isClaimingThis}
          >
            {isClaimingThis ? 'Claiming...' : 'Claim Winnings'}
          </button>
        )}

        {result === 'loss' && !isHidden && (
          <div className="position-actions-row">
            <button className="btn-disabled" disabled>
              No Payout
            </button>
            <button
              className="btn-dismiss"
              onClick={() => handleDismiss(position)}
              title="Hide this position"
            >
              Dismiss
            </button>
          </div>
        )}

        {result === 'unknown' && !isHidden && (
          <div className="position-actions-row">
            <button className="btn-disabled" disabled>
              Pending Result
            </button>
            <button
              className="btn-dismiss"
              onClick={() => handleDismiss(position)}
              title="Hide this position"
            >
              Dismiss
            </button>
          </div>
        )}

        {isHidden && (
          <button
            className="btn-restore"
            onClick={() => handleRestore(position)}
          >
            Restore Position
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="user-positions">
      <h2 className="section-title light">Your Positions</h2>

      <div className="positions-list">
        {visiblePositions.map((p) => renderPositionCard(p, false))}
      </div>

      {dismissedPositions.length > 0 && (
        <div className="positions-hidden-section">
          <button
            className="positions-hidden-toggle"
            onClick={() => setShowHidden((v) => !v)}
          >
            {showHidden
              ? `▲ Hide ${dismissedPositions.length} dismissed position${dismissedPositions.length === 1 ? '' : 's'}`
              : `▼ Show ${dismissedPositions.length} dismissed position${dismissedPositions.length === 1 ? '' : 's'}`}
          </button>
          {showHidden && (
            <div className="positions-list">
              {dismissedPositions.map((p) => renderPositionCard(p, true))}
            </div>
          )}
        </div>
      )}

      {sellModalPosition && (
        <SellModal
          position={sellModalPosition as unknown as Record<string, unknown>}
          onClose={() => setSellModalPosition(null)}
          onSuccess={handleSellSuccess}
        />
      )}
    </div>
  );
}
