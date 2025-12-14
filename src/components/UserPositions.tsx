import { useEffect, useState } from 'react';
import { useAccount, useWalletClient } from 'wagmi';
import { predictAPI } from '../services/predictAPI';
import { formatEther } from 'ethers';
import { SellModal } from './SellModal';
import type { Position } from '../types/predict';

export function UserPositions() {
  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(false);
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
  }

  return (
    <div className="user-positions">
      <h2>Your Positions</h2>
      <div className="positions-list">
        {positions.map((position: any, index) => {
          // Extract data from API response structure
          const marketQuestion = position.market?.question || 'Unknown Market';
          const outcomeName = position.outcome?.name || 'Unknown';
          
          // Convert amount from Wei to readable number
          const amountInWei = position.amount || '0';
          const sharesNum = parseFloat(formatEther(amountInWei));
          
          // Use valueUsd for dollar value (this is the position's USD value)
          const valueNum = parseFloat(position.valueUsd || '0');
          
          // Calculate average price paid per share
          const avgPrice = sharesNum > 0 ? (valueNum / sharesNum) : 0;
          
          return (
            <div key={index} className="position-card">
              <div className="position-market" title={marketQuestion}>
                {marketQuestion}
              </div>
              <div className="position-outcome">{outcomeName}</div>
              <div className="position-details">
                <div>
                  <div className="position-shares">{sharesNum.toFixed(2)} shares</div>
                  <div className="position-avg-price">Avg: ${avgPrice.toFixed(3)}/share</div>
                </div>
                <div className="position-value">${valueNum.toFixed(2)}</div>
              </div>
              <button
                className="btn-sell"
                onClick={() => handleSell(position)}
                disabled={sharesNum === 0}
              >
                Sell Position
              </button>
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
