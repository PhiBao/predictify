import { useState } from 'react';
import { useAccount, useWalletClient } from 'wagmi';
import { usePredictSDK } from '../hooks/usePredictSDK';
import { useToast } from '../contexts/ToastContext';
import type { Market, Outcome } from '../types/predict';
import { formatPriceLevel } from '../types/predict';
import { parseEther, formatEther } from 'ethers';
import { PredictAPI } from '../services/predictAPI';
import { Side } from '@predictdotfun/sdk';

interface TradeModalProps {
  market: Market;
  outcome: Outcome;
  onClose: () => void;
}

type OrderType = 'market' | 'limit';

export function TradeModal({ market, outcome, onClose }: TradeModalProps) {
  const { address, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();
  const { orderBuilder, isReady } = usePredictSDK();
  const { showToast } = useToast();
  const [side, setSide] = useState<Side>(Side.BUY);
  const [orderType, setOrderType] = useState<OrderType>('limit');
  const [price, setPrice] = useState('0.5');
  const [quantity, setQuantity] = useState('10');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [approvalStep, setApprovalStep] = useState('');

  // Compute market price from orderbook if available
  const marketPrice = side === Side.BUY
    ? (outcome.bestAsk ? parseFloat(formatPriceLevel(outcome.bestAsk)) || 0.5 : 0.5)
    : (outcome.bestBid ? parseFloat(formatPriceLevel(outcome.bestBid)) || 0.5 : 0.5);

  const effectivePrice = orderType === 'market' ? marketPrice : (parseFloat(price) || 0);
  const quantityNum = parseFloat(quantity) || 0;
  const totalCost = (effectivePrice * quantityNum).toFixed(2);

  const handleTrade = async () => {
    if (!address || !isConnected || !orderBuilder) {
      setError('Please connect your wallet first');
      return;
    }

    if (market.status && market.status !== 'REGISTERED') {
      setError(`Cannot trade on this market. Status: ${market.status}. Only REGISTERED markets accept orders.`);
      return;
    }

    if (orderType === 'limit' && (effectivePrice <= 0.01 || effectivePrice >= 0.99)) {
      setError('Limit price must be between 0.01 and 0.99 USDT');
      return;
    }

    if (quantityNum < 1) {
      setError('Quantity must be at least 1 share');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const pricePerShareWei = parseEther(effectivePrice.toFixed(6));
      const quantityWei = parseEther(quantityNum.toFixed(6));

      const amounts = orderBuilder.getLimitOrderAmounts({
        side,
        pricePerShareWei,
        quantityWei,
      });

      // Use SDK helper to set all required approvals
      setApprovalStep('Checking approvals...');
      const approvalResult = await orderBuilder.setApprovals();
      if (!approvalResult.success) {
        throw new Error('Failed to set token approvals');
      }

      // For BUY orders, also approve exact USDT amount if needed
      if (side === Side.BUY && orderBuilder.contracts) {
        const exchangeKey = market.isNegRisk
          ? (market.isYieldBearing ? 'YIELD_BEARING_NEG_RISK_CTF_EXCHANGE' : 'NEG_RISK_CTF_EXCHANGE')
          : (market.isYieldBearing ? 'YIELD_BEARING_CTF_EXCHANGE' : 'CTF_EXCHANGE');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const exchangeAddress = (orderBuilder.contracts as any)[exchangeKey]?.contract?.target;
        const usdtContract = orderBuilder.contracts['USDT']?.contract;

        if (exchangeAddress && usdtContract) {
          const currentAllowance = await usdtContract.allowance(address, exchangeAddress);
          if (currentAllowance < amounts.makerAmount) {
            setApprovalStep(`Approving ${parseFloat(formatEther(amounts.makerAmount)).toFixed(2)} USDT...`);
            const approveTx = await usdtContract.approve(exchangeAddress, amounts.makerAmount);
            await approveTx.wait();
          }
        }
      }

      // Authentication
      setApprovalStep('Authenticating...');
      const api = new PredictAPI();

      const authMessageResponse = await api.getAuthMessage(address);
      const message = authMessageResponse.data?.message ?? authMessageResponse.message;

      if (!walletClient) {
        throw new Error('Wallet client not available');
      }

      const signature = await walletClient.signMessage({
        account: address,
        message,
      });

      setApprovalStep('Getting authorization...');
      const jwtResponse = await api.getJWT(address, signature, message);
      const jwtToken = jwtResponse?.data?.token;

      if (!jwtToken) {
        throw new Error('Failed to extract JWT token from response');
      }

      api.setJWT(jwtToken);

      // Build and sign order
      setApprovalStep('Building order...');
      const order = orderBuilder.buildOrder('LIMIT', {
        maker: address,
        signer: address,
        side,
        tokenId: outcome.onChainId,
        makerAmount: amounts.makerAmount,
        takerAmount: amounts.takerAmount,
        nonce: 0n,
        feeRateBps: market.feeRateBps,
      });

      const typedData = orderBuilder.buildTypedData(order, {
        isNegRisk: market.isNegRisk,
        isYieldBearing: market.isYieldBearing,
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

      setApprovalStep('Submitting order...');
      const result = await api.createOrder(orderPayload);

      if (result.success) {
        showToast('Order created successfully!', 'success');
        onClose();
      } else {
        throw new Error('Order creation failed');
      }
    } catch (err) {
      console.error('Trade error:', err);
      const errorMsg = err instanceof Error ? err.message : 'Failed to create order';

      if (errorMsg.includes('Invalid data')) {
        setError('Order failed. You may need to approve tokens first. Check console for details.');
        showToast(
          'Order creation failed!\n\nThis could be due to:\n' +
          '• Missing token approvals (USDT & Conditional Tokens)\n' +
          '• Insufficient balance\n' +
          '• Invalid order parameters',
          'error'
        );
      } else {
        setError(errorMsg);
        showToast(errorMsg, 'error');
      }
    } finally {
      setLoading(false);
      setApprovalStep('');
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Trade: {outcome.name}</h2>
          <button className="close-btn" onClick={onClose} aria-label="Close modal">×</button>
        </div>

        <div className="modal-body">
          {!isConnected && (
            <div className="warning-message">
              Please connect your wallet to trade.
            </div>
          )}

          {isConnected && !isReady && (
            <div className="warning-message">
              Initializing SDK... Please wait.
            </div>
          )}

          {error && <div className="error-message">{error}</div>}

          {approvalStep && (
            <div className="info-message">
              {approvalStep}
            </div>
          )}

          <div className="trade-type">
            <button
              className={`type-btn ${side === Side.BUY ? 'active' : ''}`}
              onClick={() => setSide(Side.BUY)}
            >
              Buy
            </button>
            <button
              className={`type-btn ${side === Side.SELL ? 'active' : ''}`}
              onClick={() => setSide(Side.SELL)}
            >
              Sell
            </button>
          </div>

          <div className="order-type-toggle">
            <button
              className={`type-btn ${orderType === 'market' ? 'active' : ''}`}
              onClick={() => setOrderType('market')}
            >
              Market
            </button>
            <button
              className={`type-btn ${orderType === 'limit' ? 'active' : ''}`}
              onClick={() => setOrderType('limit')}
            >
              Limit
            </button>
          </div>

          {orderType === 'market' && (
            <div className="market-price-display">
              <label>Market Price</label>
              <div className="market-price-value">
                ${marketPrice.toFixed(2)} USDT
                <small>{side === Side.BUY ? 'Best Ask' : 'Best Bid'}</small>
              </div>
            </div>
          )}

          {orderType === 'limit' && (
            <div className="form-group">
              <label>Price per share (USDT)</label>
              <input
                type="number"
                min="0.01"
                max="0.99"
                step="0.01"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
              <small>Between 0.01 and 0.99 USDT</small>
            </div>
          )}

          <div className="form-group">
            <label>Quantity (shares)</label>
            <input
              type="number"
              min="1"
              step="1"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </div>

          <div className="total">
            <span>{side === Side.BUY ? 'Total Cost:' : 'You Receive:'}</span>
            <span className="total-amount">{totalCost} USDT</span>
          </div>

          <button
            className="submit-btn"
            onClick={handleTrade}
            disabled={loading || !isConnected || !isReady}
          >
            {loading ? (approvalStep || 'Processing...') :
              `${orderType === 'market' ? 'Market' : 'Limit'} ${side === Side.BUY ? 'Buy' : 'Sell'} ${quantityNum} shares`}
          </button>

          <div className="trade-info">
            <small>
              Market Fee: {(market.feeRateBps / 100).toFixed(2)}%
              {' · '}
              {market.isYieldBearing && 'Yield Bearing'}
              {' · '}
              {market.isNegRisk && 'Neg Risk'}
            </small>
          </div>
        </div>
      </div>
    </div>
  );
}
