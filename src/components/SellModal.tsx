import { useState } from 'react';
import { useAccount, useWalletClient } from 'wagmi';
import { usePredictSDK } from '../hooks/usePredictSDK';
import { useToast } from '../contexts/ToastContext';
import { Side } from '@predictdotfun/sdk';
import { parseEther, formatEther } from 'ethers';
import { predictAPI } from '../services/predictAPI';

interface SellModalProps {
  position: any;
  onClose: () => void;
  onSuccess: () => void;
}

export function SellModal({ position, onClose, onSuccess }: SellModalProps) {
  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();
  const { orderBuilder, isReady } = usePredictSDK();
  const { showToast } = useToast();
  
  const totalShares = parseFloat(formatEther(position.amount));
  const [percentage, setPercentage] = useState(100);
  const [price, setPrice] = useState('0.5');
  const [loading, setLoading] = useState(false);

  const sharesToSell = (totalShares * percentage) / 100;
  const totalReceive = sharesToSell * parseFloat(price);

  const handleSell = async () => {
    if (!address || !walletClient || !isReady || !orderBuilder) {
      showToast('Wallet not connected or SDK not ready', 'error');
      return;
    }

    if (sharesToSell === 0) {
      showToast('No shares to sell', 'error');
      return;
    }

    const priceNum = parseFloat(price);
    if (priceNum <= 0 || priceNum >= 1) {
      showToast('Price must be between 0 and 1', 'error');
      return;
    }

    setLoading(true);

    try {
      // Get JWT token for authentication
      try {
        const authMessageResponse = await predictAPI.getAuthMessage(address);
        const message = authMessageResponse.data?.message || authMessageResponse.message;
        const signature = await walletClient.signMessage({
          account: address,
          message: message,
        });
        const jwtResponse = await predictAPI.getJWT(address, signature, message);
        const jwtToken = jwtResponse?.data?.token;
        
        if (jwtToken) {
          predictAPI.setJWT(jwtToken);
        }
      } catch (authErr) {
        console.log('Authentication warning:', authErr);
        // Continue anyway - some endpoints might work without JWT
      }

      const market = position.market;
      const positionOutcome = position.outcome;

      // Find outcome
      const outcome = market.outcomes.find((o: any) => 
        o.onChainId === positionOutcome.onChainId || o.indexSet === positionOutcome.indexSet
      );

      if (!outcome) {
        throw new Error('Outcome not found');
      }

      // Calculate amounts in Wei
      const sharesInWei = parseEther(sharesToSell.toFixed(6));
      const usdtInWei = parseEther(totalReceive.toFixed(6));

      console.log('Sell order amounts:', {
        sharesToSell,
        price: priceNum,
        totalReceive,
        sharesInWei: sharesInWei.toString(),
        usdtInWei: usdtInWei.toString(),
      });

      // Build SELL order
      const order = orderBuilder.buildOrder('LIMIT', {
        maker: address,
        signer: address,
        side: Side.SELL,
        tokenId: outcome.onChainId,
        makerAmount: sharesInWei.toString(), // shares to sell
        takerAmount: usdtInWei.toString(), // USDT to receive
        nonce: 0n,
        feeRateBps: String(market.feeRateBps || 0),
      });

      // Build typed data and sign
      const typedData = orderBuilder.buildTypedData(order, {
        isNegRisk: market.isNegRisk,
        isYieldBearing: market.isYieldBearing,
      });

      console.log('Typed data for sell:', typedData);

      const signedOrder = await orderBuilder.signTypedDataOrder(typedData);
      const hash = orderBuilder.buildTypedDataHash(typedData);

      // Calculate pricePerShare properly (USDT per share, in Wei terms)
      // This should be: takerAmount / makerAmount (but we need to preserve precision)
      // For SELL: price per share = USDT received / shares sold
      const pricePerShareInWei = parseEther(priceNum.toFixed(6));

      const orderPayload = {
        data: {
          order: { ...signedOrder, hash },
          pricePerShare: pricePerShareInWei.toString(),
          strategy: 'LIMIT',
        },
      };

      console.log('Submitting sell order:', orderPayload);

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
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Sell Position</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          <div className="sell-info">
            <div className="info-row">
              <span>Market:</span>
              <span className="info-value">{position.market?.question}</span>
            </div>
            <div className="info-row">
              <span>Outcome:</span>
              <span className="info-value outcome-badge">{position.outcome?.name}</span>
            </div>
            <div className="info-row">
              <span>Total Shares:</span>
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
              <span>You're selling:</span>
              <span className="summary-value">{sharesToSell.toFixed(2)} shares</span>
            </div>
            <div className="summary-row">
              <span>Price per share:</span>
              <span className="summary-value">${parseFloat(price).toFixed(2)}</span>
            </div>
            <div className="summary-row total">
              <span>You'll receive:</span>
              <span className="summary-value">${totalReceive.toFixed(2)}</span>
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
            {loading ? 'Creating Order...' : 'Create Sell Order'}
          </button>
        </div>
      </div>
    </div>
  );
}
