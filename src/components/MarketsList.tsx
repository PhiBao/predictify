import { useEffect, useState, useMemo } from 'react';
import { MarketCard } from './MarketCard';
import { GroupedMarketCard, type MarketGroup } from './GroupedMarketCard';
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

/** Convert a slug like "number-of-cz-tweets" to "Number Of Cz Tweets" */
function unsanitizeSlug(slug: string): string {
  return slug
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Derive a human-readable group title from the markets in the group */
function deriveGroupTitle(markets: Market[]): string {
  if (markets.length === 0) return '';
  // If all markets share the same question, use it
  const firstQuestion = markets[0].question;
  const allSameQuestion = markets.every((m) => m.question === firstQuestion);
  if (allSameQuestion && firstQuestion && firstQuestion !== markets[0].categorySlug) {
    return firstQuestion;
  }
  // Otherwise unsanitize the category slug
  return unsanitizeSlug(markets[0].categorySlug);
}

function groupMarkets(markets: Market[]): (Market | MarketGroup)[] {
  const groups = new Map<string, Market[]>();
  const singles: Market[] = [];

  for (const market of markets) {
    // Group by categorySlug so related markets (e.g. CZ tweet ranges) merge into one card
    const key = market.categorySlug?.trim().toLowerCase() || `market-${market.id}`;
    const existing = groups.get(key);
    if (existing) {
      existing.push(market);
    } else {
      // Check if another market shares this category
      const hasSibling = markets.some(
        (m) => m.id !== market.id && m.categorySlug?.trim().toLowerCase() === key
      );
      if (hasSibling) {
        groups.set(key, [market]);
      } else {
        singles.push(market);
      }
    }
  }

  const result: (Market | MarketGroup)[] = [...singles];

  for (const [, groupMarkets] of groups) {
    if (groupMarkets.length === 1) {
      result.push(groupMarkets[0]);
    } else {
      const first = groupMarkets[0];
      result.push({
        question: deriveGroupTitle(groupMarkets),
        imageUrl: first.imageUrl,
        description: first.description,
        categorySlug: first.categorySlug,
        status: first.status,
        feeRateBps: first.feeRateBps,
        isNegRisk: first.isNegRisk,
        isYieldBearing: first.isYieldBearing,
        markets: groupMarkets,
      });
    }
  }

  return result;
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

  const filteredItems = useMemo(() => {
    const liveMarkets = filter === 'live' ? markets.filter(isLiveMarket) : markets;
    return groupMarkets(liveMarkets);
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

      {filteredItems.length === 0 ? (
        <div className="no-markets">
          {filter === 'live'
            ? 'No live markets available right now. Try viewing All markets.'
            : 'No markets available.'}
        </div>
      ) : (
        <div className="markets-grid">
          {filteredItems.map((item, index) => {
            if ('markets' in item) {
              return <GroupedMarketCard key={`group-${index}`} group={item} />;
            }
            return <MarketCard key={item.id} market={item} />;
          })}
        </div>
      )}
    </div>
  );
}
