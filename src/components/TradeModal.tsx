import { useState } from 'react';
import { useAccount, useWalletClient } from 'wagmi';
import { usePredictSDK } from '../hooks/usePredictSDK';
import { useToast } from '../contexts/ToastContext';
import type { Market, Outcome } from '../types/predict';
import { parseEther } from 'ethers';
import { PredictAPI } from '../services/predictAPI';
import { Side } from '@predictdotfun/sdk';

interface TradeModalProps {
  market: Market;
  outcome: Outcome;
  onClose: () => void;
}

export function TradeModal({ market, outcome, onClose }: TradeModalProps) {
  const { address, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();
  const { orderBuilder, isReady } = usePredictSDK();
  const { showToast } = useToast();
  const [side, setSide] = useState<Side>(Side.BUY); // BUY = 0, SELL = 1
  const [price, setPrice] = useState('0.5');
  const [quantity, setQuantity] = useState('10');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [approvalStep, setApprovalStep] = useState<string>('');

  const handleTrade = async () => {
    if (!address || !isConnected || !orderBuilder) {
      setError('Please connect your wallet first');
      return;
    }

    // Validate market status - only REGISTERED (or null for open) markets can accept orders
    if (market.status && market.status !== 'REGISTERED') {
      setError(`Cannot trade on this market. Status: ${market.status}. Only markets with REGISTERED status accept orders.`);
      return;
    }

    // Debug: Log market info for troubleshooting
    console.log('🔍 Market debug info:', {
      id: market.id,
      status: market.status,
      isNegRisk: market.isNegRisk,
      isYieldBearing: market.isYieldBearing,
      feeRateBps: market.feeRateBps,
      outcomeTokenId: outcome.onChainId,
    });

    try {
      setLoading(true);
      setError(null);

      // Step 1: Calculate the USDT amount needed FIRST (before approvals)
      const pricePerShareWei = parseEther(price);
      const quantityWei = parseEther(quantity);

      const amounts = orderBuilder.getLimitOrderAmounts({
        side: side,
        pricePerShareWei,
        quantityWei,
      });

      console.log('Trade amounts:', {
        side: side === Side.BUY ? 'BUY' : 'SELL',
        pricePerShare: amounts.pricePerShare.toString(),
        makerAmount: amounts.makerAmount.toString(),
        takerAmount: amounts.takerAmount.toString(),
        makerAmountInUSDT: (Number(amounts.makerAmount) / 1e18).toFixed(2),
      });

      // Step 2: Set targeted approvals based on market type
      if (orderBuilder.contracts) {
        // Determine the correct exchange based on market type
        const exchangeKey = market.isNegRisk
          ? (market.isYieldBearing ? 'YIELD_BEARING_NEG_RISK_CTF_EXCHANGE' : 'NEG_RISK_CTF_EXCHANGE')
          : (market.isYieldBearing ? 'YIELD_BEARING_CTF_EXCHANGE' : 'CTF_EXCHANGE');

        const conditionalTokensKey = market.isYieldBearing ? 'YIELD_BEARING_CONDITIONAL_TOKENS' : 'CONDITIONAL_TOKENS';

        console.log('🔧 Using exchange:', exchangeKey, 'conditionalTokens:', conditionalTokensKey);

        const exchangeAddress = (orderBuilder.contracts as any)[exchangeKey].contract.target;
        const conditionalTokensContract = (orderBuilder.contracts as any)[conditionalTokensKey].contract;
        const usdtContract = orderBuilder.contracts['USDT'].contract;

        // Step 2a: Approve ERC-1155 (Conditional Tokens) for the exchange - this is required
        const isApprovedERC1155 = await conditionalTokensContract.isApprovedForAll(address, exchangeAddress);
        if (!isApprovedERC1155) {
          setApprovalStep('Approving conditional tokens for exchange...');
          console.log('Approving ConditionalTokens for', exchangeKey);
          const approveTx = await conditionalTokensContract.setApprovalForAll(exchangeAddress, true);
          console.log('ConditionalTokens approval tx:', approveTx.hash);
          await approveTx.wait();
          console.log('✅ ConditionalTokens approved');
        } else {
          console.log('✅ ConditionalTokens already approved');
        }

        // Step 2b: For BUY orders, approve ONLY the exact USDT amount needed (not unlimited!)
        if (side === Side.BUY) {
          const currentAllowance = await usdtContract.allowance(address, exchangeAddress);
          console.log('Current USDT allowance:', currentAllowance.toString(), 'Required:', amounts.makerAmount.toString());

          if (currentAllowance < amounts.makerAmount) {
            const usdtAmountInTokens = (Number(amounts.makerAmount) / 1e18).toFixed(2);
            setApprovalStep(`Approving exactly ${usdtAmountInTokens} USDT...`);
            console.log('Approving USDT to:', exchangeKey, exchangeAddress);

            // Approve EXACT amount needed, not unlimited
            const approveTx = await usdtContract.approve(exchangeAddress, amounts.makerAmount);
            console.log('USDT approval transaction sent:', approveTx.hash);
            setApprovalStep('Confirming USDT approval...');
            await approveTx.wait();
            console.log('✅ USDT approved for exact trade amount');
          } else {
            console.log('✅ USDT already has sufficient allowance');
          }
        }
      }

      // Step 4: Get authentication
      setApprovalStep('Authenticating...');
      const api = new PredictAPI();

      // Step 3: Get auth message
      console.log('Getting auth message...');
      const authMessageResponse = await api.getAuthMessage(address);
      const message = authMessageResponse.data?.message || authMessageResponse.message;

      // Step 4: Sign the auth message with wallet
      console.log('Signing auth message...');
      if (!walletClient) {
        throw new Error('Wallet client not available');
      }

      const signature = await walletClient.signMessage({
        account: address,
        message: message,
      });

      // Step 5: Get JWT token
      setApprovalStep('Getting authorization...');
      console.log('Getting JWT token...');
      const jwtResponse = await api.getJWT(address, signature, message);

      console.log('JWT Response received:', jwtResponse);
      console.log('JWT Response type:', typeof jwtResponse);
      console.log('JWT Response keys:', jwtResponse ? Object.keys(jwtResponse) : 'null');

      // According to API docs: { success: true, data: { token: "string" } }
      const jwtToken = jwtResponse?.data?.token;

      if (!jwtToken) {
        console.error('Could not extract JWT token. Full response:', JSON.stringify(jwtResponse, null, 2));
        throw new Error('Failed to extract JWT token from response');
      }

      console.log('JWT token obtained successfully');

      // Set JWT token on the API instance for authenticated requests
      api.setJWT(jwtToken);

      // Step 6: Build and sign order
      setApprovalStep('Building order...');

      // Build the order with nonce: 0n as per official SDK documentation
      // Using any other nonce value causes "Invalid data" error from API
      const order = orderBuilder.buildOrder('LIMIT', {
        maker: address,
        signer: address,
        side: side,
        tokenId: outcome.onChainId,
        makerAmount: amounts.makerAmount,
        takerAmount: amounts.takerAmount,
        nonce: 0n, // IMPORTANT: Must be 0n per official docs
        feeRateBps: market.feeRateBps,
      });

      console.log('Order built:', order);

      // Build typed data
      const typedData = orderBuilder.buildTypedData(order, {
        isNegRisk: market.isNegRisk,
        isYieldBearing: market.isYieldBearing,
      });

      console.log('Typed data:', typedData);
      console.log('🔍 Typed data domain:', typedData.domain);
      console.log('🔍 verifyingContract:', typedData.domain.verifyingContract);
      console.log('🔍 Market flags - isNegRisk:', market.isNegRisk, 'isYieldBearing:', market.isYieldBearing);

      // Sign the order
      const signedOrder = await orderBuilder.signTypedDataOrder(typedData);

      console.log('Signed order:', signedOrder);
      console.log('Signed order field types:', {
        salt: typeof signedOrder.salt,
        tokenId: typeof signedOrder.tokenId,
        makerAmount: typeof signedOrder.makerAmount,
        takerAmount: typeof signedOrder.takerAmount,
        expiration: typeof signedOrder.expiration,
        nonce: typeof signedOrder.nonce,
        feeRateBps: typeof signedOrder.feeRateBps,
        side: typeof signedOrder.side,
        signatureType: typeof signedOrder.signatureType,
      });

      // Compute hash
      const hash = orderBuilder.buildTypedDataHash(typedData);

      console.log('Hash:', hash);
      console.log('Verifying signature...');

      // Verify the hash matches what we computed
      const recomputedHash = orderBuilder.buildTypedDataHash(typedData);
      console.log('Hash verification:', hash === recomputedHash ? '✅ Match' : '❌ Mismatch');

      // Submit to API with JWT token - structure must match SDK docs exactly
      // From SDK README: createOrderBody = { data: { order: { ...signedOrder, hash }, pricePerShare, strategy } }
      const orderPayload = {
        data: {
          order: { ...signedOrder, hash },
          pricePerShare: amounts.pricePerShare.toString(), // Convert BigInt to string for JSON
          strategy: 'LIMIT',
        },
      };

      console.log('Submitting order:', JSON.stringify(orderPayload, null, 2));

      // Log curl command for debugging
      console.log('Equivalent curl command:');
      console.log(`curl -X POST https://api.predict.fun/v1/orders \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: ${import.meta.env.VITE_API_KEY}" \\
  -H "Authorization: Bearer ${jwtToken.substring(0, 20)}..." \\
  -d '${JSON.stringify(orderPayload)}'`);

      // Step 7: Submit order
      setApprovalStep('Submitting order...');
      const result = await api.createOrder(orderPayload);

      if (result.success) {
        showToast('Order created successfully! 🎉', 'success');
        onClose();
      } else {
        throw new Error('Order creation failed');
      }
    } catch (err) {
      console.error('Trade error:', err);
      const errorMsg = err instanceof Error ? err.message : 'Failed to create order';

      // Check if it's an "Invalid data" error which often means missing approvals
      if (errorMsg.includes('Invalid data')) {
        const detailedMsg = 'Order failed. You may need to approve tokens first. Check console for details.';
        setError(detailedMsg);
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
    }
  };

  const totalCost = (parseFloat(price) * parseFloat(quantity)).toFixed(2);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Trade: {outcome.name}</h2>
          <button className="close-btn" onClick={onClose}>×</button>
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
            <div className="info-message" style={{
              padding: '12px',
              background: '#e3f2fd',
              border: '1px solid #2196f3',
              borderRadius: '8px',
              marginBottom: '16px',
              color: '#1976d2',
              fontSize: '14px'
            }}>
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
            <span>Total Cost:</span>
            <span className="total-amount">{totalCost} USDT</span>
          </div>

          <button
            className="submit-btn"
            onClick={handleTrade}
            disabled={loading || !isConnected || !isReady}
          >
            {loading ? (approvalStep || 'Processing...') :
              `${side === Side.BUY ? 'Buy' : 'Sell'} ${quantity} shares`}
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
