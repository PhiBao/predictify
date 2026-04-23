import { useState } from 'react';
import { useAccount, useWalletClient } from 'wagmi';
import { usePredictSDK } from '../hooks/usePredictSDK';
import { useToast } from '../contexts/ToastContext';
import { Side } from '@predictdotfun/sdk';
import { parseEther, formatEther } from 'ethers';
import { predictAPI } from '../services/predictAPI';

interface SellModalProps {
  position: Record<string, unknown>;
  onClose: () => void;
  onSuccess: () => void;
}

export function SellModal({ position, onClose, onSuccess }: SellModalProps) {
  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();
  const { orderBuilder, isReady } = usePredictSDK();
  const { showToast } = useToast();

  const amountRaw = typeof position.amount === 'string' ? position.amount : '0';
  const totalShares = parseFloat(formatEther(amountRaw));

  const [percentage, setPercentage] = useState(100);
  const [price, setPrice] = useState('0.5');
  const [loading, setLoading] = useState(false);
  const [approvalStep, setApprovalStep] = useState('');

  const sharesToSell = (totalShares * percentage) / 100;
  const priceNum = parseFloat(price) || 0;
  const totalReceive = sharesToSell * priceNum;

  const market = position.market as Record<string, unknown> | undefined;
  const positionOutcome = position.outcome as Record<string, unknown> | undefined;

  const handleSell = async () => {
    if (!address || !walletClient || !isReady || !orderBuilder) {
      showToast('Wallet not connected or SDK not ready', 'error');
      return;
    }

    if (sharesToSell === 0) {
      showToast('No shares to sell', 'error');
      return;
    }

    if (priceNum <= 0.01 || priceNum >= 0.99) {
      showToast('Price must be between 0.01 and 0.99', 'error');
      return;
    }

    setLoading(true);
    setApprovalStep('');

    try {
      if (!market) {
        throw new Error('Market data not available');
      }

      // Use SDK helper for approvals
      setApprovalStep('Checking approvals...');
      const approvalResult = await orderBuilder.setApprovals();
      if (!approvalResult.success) {
        throw new Error('Failed to set token approvals');
      }

      // Get JWT token for authentication
      setApprovalStep('Authenticating...');
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
        console.log('Authentication warning:', authErr);
      }

      // Build and submit sell order
      setApprovalStep('Creating sell order...');
      const outcomes = market.outcomes as Array<Record<string, unknown>> | undefined;
      const outcomeOnChainId = positionOutcome?.onChainId as string | undefined;
      const outcomeIndexSet = positionOutcome?.indexSet as number | undefined;

      const outcome = outcomes?.find((o: Record<string, unknown>) =>
        o.onChainId === outcomeOnChainId || o.indexSet === outcomeIndexSet
      );

      if (!outcome) {
        throw new Error('Outcome not found');
      }

      const pricePerShareWei = parseEther(priceNum.toFixed(6));
      const quantityWei = parseEther(sharesToSell.toFixed(6));

      const amounts = orderBuilder.getLimitOrderAmounts({
        side: Side.SELL,
        pricePerShareWei,
        quantityWei,
      });

      const order = orderBuilder.buildOrder('LIMIT', {
        maker: address,
        signer: address,
        side: Side.SELL,
        tokenId: outcome.onChainId as string,
        makerAmount: amounts.makerAmount,
        takerAmount: amounts.takerAmount,
        nonce: 0n,
        feeRateBps: String((market.feeRateBps as number) || 0),
      });

      const typedData = orderBuilder.buildTypedData(order, {
        isNegRisk: Boolean(market.isNegRisk),
        isYieldBearing: Boolean(market.isYieldBearing),
      });

      const signedOrder = await orderBuilder.signTypedDataOrder(typedData);
      const hash = orderBuilder.buildTypedDataHash(typedData);

      const orderPayload = {
        data: {
          order: { ...signedOrder, hash },
          pricePerShare: amounts.pricePerShare.toString(),
          strategy: 'LIMIT',
        },
      };

      const result = await predictAPI.createOrder(orderPayload);

      if (result.success) {
        showToast(`Sell order created! ${sharesToSell.toFixed(2)} shares at $${priceNum}`, 'success');
        onSuccess();
        onClose();
      } else {
        throw new Error('Failed to create sell order');
      }
    } catch (err) {
      console.error('Sell failed:', err);
      const errorMsg = err instanceof Error ? err.message : 'Failed to sell position';
      showToast(errorMsg, 'error');
    } finally {
      setLoading(false);
      setApprovalStep('');
    }
  };

  const marketQuestion = (market?.question as string) || 'Unknown Market';
  const outcomeName = (positionOutcome?.name as string) || 'Unknown';
  const feeRateBps = (market?.feeRateBps as number) || 0;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Sell {outcomeName} Shares</h2>
          <button className="close-btn" onClick={onClose} aria-label="Close modal">×</button>
        </div>

        <div className="modal-body">
          <div className="sell-info">
            <div className="info-row">
              <span>Market:</span>
              <span className="info-value">{marketQuestion}</span>
            </div>
            <div className="info-row">
              <span>Your Position:</span>
              <span className="info-value outcome-badge">{outcomeName}</span>
            </div>
            <div className="info-row">
              <span>Available Shares:</span>
              <span className="info-value">{totalShares.toFixed(2)}</span>
            </div>
          </div>

          <div className="form-group">
            <label>Amount to Sell</label>
            <div className="percentage-buttons">
              {[25, 50, 75, 100].map((pct) => (
                <button
                  key={pct}
                  className={`pct-btn ${percentage === pct ? 'active' : ''}`}
                  onClick={() => setPercentage(pct)}
                >
                  {pct}%
                </button>
              ))}
            </div>
            <div className="shares-display">
              {sharesToSell.toFixed(2)} shares ({percentage}%)
            </div>
          </div>

          <div className="form-group">
            <label>Price per Share ($)</label>
            <input
              type="number"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              min="0.01"
              max="0.99"
              step="0.01"
              className="price-input"
            />
            <div className="price-hint">Price must be between $0.01 and $0.99</div>
          </div>

          <div className="order-summary">
            <div className="summary-row">
              <span>Selling:</span>
              <span className="summary-value">{sharesToSell.toFixed(2)} shares</span>
            </div>
            <div className="summary-row">
              <span>At price:</span>
              <span className="summary-value">${priceNum.toFixed(2)} per share</span>
            </div>
            <div className="summary-row">
              <span>Market Fee:</span>
              <span className="summary-value">{(feeRateBps / 100).toFixed(2)}%</span>
            </div>
            <div className="summary-row total">
              <span>Total Cost:</span>
              <span className="summary-value">${totalReceive.toFixed(2)} USDT</span>
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <button
            className="btn btn-sell"
            onClick={handleSell}
            disabled={loading || sharesToSell === 0}
          >
            {loading ? (approvalStep || 'Creating Order...') : `Sell ${sharesToSell.toFixed(0)} shares`}
          </button>
        </div>
      </div>
    </div>
  );
}
