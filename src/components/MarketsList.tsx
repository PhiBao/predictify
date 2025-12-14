import { useEffect, useState } from 'react';
import { MarketCard } from './MarketCard';
import { predictAPI } from '../services/predictAPI';
import type { Market } from '../types/predict';

export function MarketsList() {
  const [markets, setMarkets] = useState<Market[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchMarkets() {
      try {
        setLoading(true);
        setError(null);
        const data = await predictAPI.getMarkets({ limit: 20 });
        console.log('Markets data received:', data.data);
        console.log('First market isNegRisk:', data.data?.[0]?.isNegRisk);
        
        // Log all unique status values (including null)
        const statuses = [...new Set(data.data?.map(m => m.status === null ? 'null (OPEN)' : m.status) || [])];
        console.log('Market statuses found:', statuses);
        
        setMarkets(data.data || []);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Failed to fetch markets';
        setError(errorMsg);
        console.error('Market fetch error:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchMarkets();
  }, []);

  if (loading) {
    return <div className="loading">Loading markets...</div>;
  }

  if (error) {
    return <div className="error">Error: {error}</div>;
  }

  if (markets.length === 0) {
    return <div className="no-markets">No markets available</div>;
  }

  return (
    <div className="markets-list">
      <h2>Prediction Markets</h2>
      <div className="markets-grid">
        {markets.map((market) => (
          <MarketCard key={market.id} market={market} />
        ))}
      </div>
    </div>
  );
}
