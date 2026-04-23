export function MarketSkeleton() {
  return (
    <div className="market-card skeleton">
      <div className="market-image-wrapper">
        <div className="skeleton-image" />
      </div>
      <div className="market-body">
        <div className="skeleton-title" />
        <div className="skeleton-description" />
        <div className="skeleton-meta" />
        <div className="skeleton-outcomes">
          <div className="skeleton-outcome" />
          <div className="skeleton-outcome" />
        </div>
        <div className="skeleton-action" />
      </div>
    </div>
  );
}

export function MarketsSkeleton() {
  return (
    <div className="markets-list">
      <h2 className="section-title light">Prediction Markets</h2>
      <div className="markets-grid">
        {Array.from({ length: 6 }).map((_, i) => (
          <MarketSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
