import { useEffect, useState, useMemo } from 'react';
import { MarketCard } from './MarketCard';
import { MarketsSkeleton } from './MarketSkeleton';
import { predictAPI } from '../services/predictAPI';
import type { Market } from '../types/predict';

const LIVE_STATUSES = new Set(['OPEN', 'ACTIVE', 'REGISTERED', 'PENDING']);
const CLOSED_STATUSES = new Set(['RESOLVED', 'CLOSED', 'EXPIRED', 'CANCELLED', 'SETTLED']);

function isLiveMarket(market: Market): boolean {
  const status = market.status?.toUpperCase() || '';
  if (CLOSED_STATUSES.has(status)) return false;
  if (LIVE_STATUSES.has(status)) return true;

  // Fallback: check end time if available
  const end = market.endTime || market.closesAt;
  if (end) {
    try {
      const endDate = new Date(end);
      if (!isNaN(endDate.getTime()) && endDate.getTime() < Date.now()) {
        return false;
      }
    } catch {
      // ignore invalid date
    }
  }

  return true;
}

export function MarketsList() {
  const [markets, setMarkets] = useState<Market[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'live' | 'all'>('live');

  useEffect(() => {
    let cancelled = false;

    async function fetchMarkets() {
      try {
        setLoading(true);
        setError(null);

        // Request live markets from API when filter is live
        const apiParams: { status?: string; limit: number } = { limit: 50 };
        if (filter === 'live') {
          apiParams.status = 'OPEN';
        }

        const data = await predictAPI.getMarkets(apiParams);

        if (cancelled) return;

        const marketsData: Market[] = Array.isArray(data.data) ? data.data : [];
        setMarkets(marketsData);
      } catch (err) {
        if (cancelled) return;
        const errorMsg = err instanceof Error ? err.message : 'Failed to fetch markets';
        setError(errorMsg);
        console.error('Market fetch error:', err);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchMarkets();

    return () => {
      cancelled = true;
    };
  }, [filter]);

  const filteredMarkets = useMemo(() => {
    if (filter === 'all') return markets;
    return markets.filter(isLiveMarket);
  }, [markets, filter]);

  if (loading) {
    return <MarketsSkeleton />;
  }

  if (error) {
    return (
      <div className="markets-list">
        <h2 className="section-title light">Prediction Markets</h2>
        <div className="error">Error: {error}</div>
      </div>
    );
  }

  return (
    <div className="markets-list">
      <div className="markets-header">
        <h2 className="section-title light">Prediction Markets</h2>
        <div className="markets-filter-bar" role="tablist" aria-label="Market filter">
          <button
            className={`filter-segment ${filter === 'live' ? 'active' : ''}`}
            onClick={() => setFilter('live')}
            role="tab"
            aria-selected={filter === 'live'}
          >
            Live
          </button>
          <button
            className={`filter-segment ${filter === 'all' ? 'active' : ''}`}
            onClick={() => setFilter('all')}
            role="tab"
            aria-selected={filter === 'all'}
          >
            All
          </button>
        </div>
      </div>

      {filteredMarkets.length === 0 ? (
        <div className="no-markets">
          {filter === 'live'
            ? 'No live markets available right now. Try viewing All markets.'
            : 'No markets available.'}
        </div>
      ) : (
        <div className="markets-grid">
          {filteredMarkets.map((market) => (
            <MarketCard key={market.id} market={market} />
          ))}
        </div>
      )}
    </div>
  );
}
