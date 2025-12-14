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
  const [approvalStep, setApprovalStep] = useState<string>('');

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
    setApprovalStep('');

    try {
      const market = position.market;

      // Step 1: Handle approvals for selling shares
      if (orderBuilder.contracts) {
        // Determine the correct exchange based on market type
        const exchangeKey = market.isNegRisk
          ? (market.isYieldBearing ? 'YIELD_BEARING_NEG_RISK_CTF_EXCHANGE' : 'NEG_RISK_CTF_EXCHANGE')
          : (market.isYieldBearing ? 'YIELD_BEARING_CTF_EXCHANGE' : 'CTF_EXCHANGE');

        const conditionalTokensKey = market.isYieldBearing ? 'YIELD_BEARING_CONDITIONAL_TOKENS' : 'CONDITIONAL_TOKENS';

        console.log('🔧 Using exchange:', exchangeKey, 'conditionalTokens:', conditionalTokensKey);

        const exchangeAddress = (orderBuilder.contracts as any)[exchangeKey].contract.target;
        const conditionalTokensContract = (orderBuilder.contracts as any)[conditionalTokensKey].contract;

        // Check if Conditional Tokens are approved for the exchange
        const isApprovedERC1155 = await conditionalTokensContract.isApprovedForAll(address, exchangeAddress);
        if (!isApprovedERC1155) {
          setApprovalStep('Approving your shares for trading...');
          console.log('Approving ConditionalTokens for', exchangeKey);
          showToast('Please approve your shares for trading', 'info');
          const approveTx = await conditionalTokensContract.setApprovalForAll(exchangeAddress, true);
          console.log('ConditionalTokens approval tx:', approveTx.hash);
          setApprovalStep('Confirming approval...');
          await approveTx.wait();
          console.log('✅ ConditionalTokens approved');
          showToast('Shares approved successfully!', 'success');
        } else {
          console.log('✅ ConditionalTokens already approved');
        }
      }

      // Step 2: Get JWT token for authentication
      setApprovalStep('Authenticating...');
      // Step 2: Get JWT token for authentication
      setApprovalStep('Authenticating...');
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

      // Step 3: Build and submit sell order
      setApprovalStep('Creating sell order...');
      const positionOutcome = position.outcome;

      // Find outcome
      const outcome = market.outcomes.find((o: any) => 
        o.onChainId === positionOutcome.onChainId || o.indexSet === positionOutcome.indexSet
      );

      if (!outcome) {
        throw new Error('Outcome not found');
      }

      // Use SDK's getLimitOrderAmounts for correct calculation
      const pricePerShareWei = parseEther(priceNum.toFixed(6));
      const quantityWei = parseEther(sharesToSell.toFixed(6));

      const amounts = orderBuilder.getLimitOrderAmounts({
        side: Side.SELL,
        pricePerShareWei,
        quantityWei,
      });

      console.log('Sell order amounts:', {
        sharesToSell,
        price: priceNum,
        totalReceive,
        side: 'SELL',
        pricePerShare: amounts.pricePerShare.toString(),
        makerAmount: amounts.makerAmount.toString(),
        takerAmount: amounts.takerAmount.toString(),
        makerAmountFormatted: formatEther(amounts.makerAmount),
        takerAmountFormatted: formatEther(amounts.takerAmount),
      });

      // Build SELL order
      const order = orderBuilder.buildOrder('LIMIT', {
        maker: address,
        signer: address,
        side: Side.SELL,
        tokenId: outcome.onChainId,
        makerAmount: amounts.makerAmount,
        takerAmount: amounts.takerAmount,
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

      const orderPayload = {
        data: {
          order: { ...signedOrder, hash },
          pricePerShare: amounts.pricePerShare.toString(),
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
          <h2>Sell {position.outcome?.name} Shares</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          <div className="sell-info">
            <div className="info-row">
              <span>Market:</span>
              <span className="info-value">{position.market?.question}</span>
            </div>
            <div className="info-row">
              <span>Your Position:</span>
              <span className="info-value outcome-badge">{position.outcome?.name}</span>
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
              <span className="summary-value">${parseFloat(price).toFixed(2)} per share</span>
            </div>
            <div className="summary-row">
              <span>Market Fee:</span>
              <span className="summary-value">{((position.market?.feeRateBps || 0) / 100).toFixed(2)}%</span>
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
