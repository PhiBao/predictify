import { useEffect, useState } from 'react';
import { useAccount, useWalletClient } from 'wagmi';
import { predictAPI } from '../services/predictAPI';
import { formatEther } from 'ethers';
import { SellModal } from './SellModal';
import { usePredictSDK } from '../hooks/usePredictSDK';
import { useToast } from '../contexts/ToastContext';
import type { Position } from '../types/predict';

export function UserPositions() {
  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();
  const { orderBuilder, isReady } = usePredictSDK();
  const { showToast } = useToast();
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(false);
  const [claiming, setClaiming] = useState<string>('');
  const [sellModalPosition, setSellModalPosition] = useState<any>(null);

  const fetchPositions = async () => {
    if (!address || !walletClient) return;

    try {
      setLoading(true);
      
      // Get JWT token first
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
        console.log('Authentication failed, trying without JWT:', authErr);
      }
      
      const data = await predictAPI.getPositions(address);
      console.log('Positions API response:', data);
      
      // Handle the API response - it might be data.data or data.positions or just data
      const positionsArray = data.data?.positions || data.data || data.positions || [];
      console.log('Parsed positions array:', positionsArray);
      
      setPositions(positionsArray);
    } catch (err) {
      // 404 means no positions yet, which is fine
      // 401 means authentication failed, which is also fine
      if (err instanceof Error && (err.message.includes('404') || err.message.includes('401'))) {
        console.log('No positions found or authentication required');
        setPositions([]);
      } else {
        console.error('Failed to fetch positions:', err);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPositions();
  }, [address, walletClient]);

  const handleSell = (position: any) => {
    setSellModalPosition(position);
  };

  const handleSellSuccess = () => {
    // Refresh positions after successful sell
    fetchPositions();
  };

  const handleClaim = async (position: any) => {
    if (!address || !walletClient || !isReady || !orderBuilder) {
      showToast('Wallet not connected or SDK not ready', 'error');
      return;
    }

    const market = position.market;
    const positionOutcome = position.outcome;

    // Find the winning outcome - try multiple detection methods
    let winningOutcome = market.outcomes?.find((o: any) => 
      o.status === 'WIN' || 
      o.status === 'WINNER' || 
      o.status === 'WON' ||
      o.status?.toUpperCase() === 'WIN' ||
      o.status?.toUpperCase() === 'WINNER'
    );

    // If no outcome has explicit WIN status, check user's outcome status
    if (!winningOutcome && positionOutcome?.status) {
      const userOutcomeStatus = positionOutcome.status.toUpperCase();
      if (userOutcomeStatus === 'WIN' || userOutcomeStatus === 'WINNER' || userOutcomeStatus === 'WON') {
        winningOutcome = positionOutcome;
      }
    }

    if (!winningOutcome) {
      console.error('Could not determine winning outcome. Market data:', {
        marketId: market.id,
        marketStatus: market.status,
        outcomes: market.outcomes?.map((o: any) => ({
          name: o.name,
          status: o.status,
          onChainId: o.onChainId,
        })),
      });
      showToast('Could not determine winning outcome. Check console for details.', 'error');
      return;
    }

    // Check if user's position is on the winning outcome
    const isWinningPosition = 
      positionOutcome.onChainId === winningOutcome.onChainId || 
      positionOutcome.indexSet === winningOutcome.indexSet ||
      positionOutcome.id === winningOutcome.id;

    if (!isWinningPosition) {
      showToast('This position did not win. No payout available.', 'info');
      return;
    }

    setClaiming(position.id || `${market.id}-${positionOutcome.onChainId}`);

    try {
      showToast('Claiming winnings...', 'info');

      if (orderBuilder.contracts) {
        const conditionalTokensKey = market.isYieldBearing ? 'YIELD_BEARING_CONDITIONAL_TOKENS' : 'CONDITIONAL_TOKENS';
        const conditionalTokensContract = (orderBuilder.contracts as any)[conditionalTokensKey].contract;

        // Prepare redeem parameters
        // redeemPositions(IERC20 collateralToken, bytes32 parentCollectionId, bytes32 conditionId, uint[] calldata indexSets)
        const collateralToken = orderBuilder.contracts['USDT'].contract.target;
        const parentCollectionId = '0x0000000000000000000000000000000000000000000000000000000000000000'; // No parent collection
        
        // Get conditionId from market (this should be available in market data)
        const conditionId = market.conditionId || market.condition?.id;
        
        if (!conditionId) {
          throw new Error('Market condition ID not found. Cannot redeem.');
        }

        // Index sets for the winning outcome
        const indexSets = [winningOutcome.indexSet];

        console.log('Redeeming position:', {
          collateralToken,
          parentCollectionId,
          conditionId,
          indexSets,
          market: market.id,
          outcome: winningOutcome.name,
        });

        // Call redeemPositions
        const tx = await conditionalTokensContract.redeemPositions(
          collateralToken,
          parentCollectionId,
          conditionId,
          indexSets
        );

        showToast('Confirming transaction...', 'info');
        await tx.wait();

        const sharesNum = parseFloat(formatEther(position.amount || '0'));
        showToast(`Successfully claimed ${sharesNum.toFixed(2)} USDT! 🎉`, 'success');
        
        // Refresh positions
        fetchPositions();
      } else {
        throw new Error('Contract not initialized');
      }
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
    return <div className="loading">Loading positions...</div>;
  }

  if (positions.length === 0) {
    return (
      <div className="positions-empty">
        No active positions. Start trading to see your positions here!
        {address && <div style={{ fontSize: '0.8rem', marginTop: '0.5rem', color: '#a0aec0' }}>
          Connected: {address.slice(0, 6)}...{address.slice(-4)}
        </div>}
      </div>
    );
  }

  // Log the first position for debugging
  if (positions.length > 0) {
    console.log('First position structure:', JSON.stringify(positions[0], null, 2));
    
    // Debug: Log all outcomes and their statuses for resolved markets
    positions.forEach((pos: any, idx: number) => {
      if (pos.market?.status === 'RESOLVED' || pos.market?.status === 'CLOSED') {
        console.log(`Position ${idx} - Resolved Market:`, {
          marketId: pos.market?.id,
          marketStatus: pos.market?.status,
          userOutcome: pos.outcome?.name,
          userOutcomeStatus: pos.outcome?.status,
          allOutcomes: pos.market?.outcomes?.map((o: any) => ({
            name: o.name,
            status: o.status,
            onChainId: o.onChainId,
            indexSet: o.indexSet,
          })),
        });
      }
    });
  }

  return (
    <div className="user-positions">
      <h2>Your Positions</h2>
      <div className="positions-list">
        {positions.map((position: any, index) => {
          // Extract data from API response structure
          const marketQuestion = position.market?.question || 'Unknown Market';
          const outcomeName = position.outcome?.name || 'Unknown';
          const marketStatus = position.market?.status;
          const isResolved = marketStatus === 'RESOLVED' || marketStatus === 'CLOSED';
          
          // Convert amount from Wei to readable number
          const amountInWei = position.amount || '0';
          const sharesNum = parseFloat(formatEther(amountInWei));
          
          // Use valueUsd for dollar value (this is the position's USD value)
          const valueNum = parseFloat(position.valueUsd || '0');
          
          // Calculate average price paid per share
          const avgPrice = sharesNum > 0 ? (valueNum / sharesNum) : 0;

          // Check if this is a winning position (for resolved markets)
          // Try multiple ways to identify winning outcome
          let winningOutcome = position.market?.outcomes?.find((o: any) => 
            o.status === 'WIN' || 
            o.status === 'WINNER' || 
            o.status === 'WON' ||
            o.status?.toUpperCase() === 'WIN' ||
            o.status?.toUpperCase() === 'WINNER'
          );

          // If no outcome has explicit WIN status, check if the user's outcome status indicates a win
          if (!winningOutcome && isResolved && position.outcome?.status) {
            const userOutcomeStatus = position.outcome.status.toUpperCase();
            if (userOutcomeStatus === 'WIN' || userOutcomeStatus === 'WINNER' || userOutcomeStatus === 'WON') {
              winningOutcome = position.outcome;
            }
          }

          const isWinningPosition = winningOutcome && 
            (position.outcome?.onChainId === winningOutcome.onChainId || 
             position.outcome?.indexSet === winningOutcome.indexSet ||
             position.outcome?.id === winningOutcome.id);

          const positionKey = position.id || `${position.market?.id}-${position.outcome?.onChainId}`;
          const isClaimingThis = claiming === positionKey;
          
          return (
            <div key={index} className="position-card">
              {isResolved && (
                <div className={`market-status-badge ${isWinningPosition ? 'winning' : 'losing'}`}>
                  {isWinningPosition ? '🎉 Winner' : '❌ Lost'}
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
                  {isResolved && isWinningPosition && (
                    <div className="position-payout">Payout: ${sharesNum.toFixed(2)} USDT</div>
                  )}
                </div>
                <div className="position-value">
                  {!isResolved && `$${valueNum.toFixed(2)}`}
                  {isResolved && isWinningPosition && `$${sharesNum.toFixed(2)}`}
                  {isResolved && !isWinningPosition && '$0.00'}
                </div>
              </div>
              
              {!isResolved && (
                <button
                  className="btn-sell"
                  onClick={() => handleSell(position)}
                  disabled={sharesNum === 0}
                >
                  Sell Position
                </button>
              )}
              
              {isResolved && isWinningPosition && (
                <button
                  className="btn-claim"
                  onClick={() => handleClaim(position)}
                  disabled={sharesNum === 0 || isClaimingThis}
                >
                  {isClaimingThis ? 'Claiming...' : 'Claim Winnings'}
                </button>
              )}

              {isResolved && !isWinningPosition && (
                <button
                  className="btn-disabled"
                  disabled={true}
                >
                  No Payout
                </button>
              )}
            </div>
          );
        })}
      </div>
      
      {sellModalPosition && (
        <SellModal
          position={sellModalPosition}
          onClose={() => setSellModalPosition(null)}
          onSuccess={handleSellSuccess}
        />
      )}
    </div>
  );
}
