import { Link } from 'react-router-dom'
import type { PolymarketMarket } from '../types/market'
import { formatPriceLevel, formatVolume } from '../types/market'

interface MarketCardProps {
  market: PolymarketMarket
  animationDelay?: number
}

export function MarketCard({ market, animationDelay = 0 }: MarketCardProps) {
  const statusClass = market.status
  const isResolved = market.status === 'resolved' || market.status === 'closed'

  return (
    <Link
      to={market.groupSlug ? `/market/group/${market.groupSlug}` : `/market/${market.id}`}
      className="market-card-link"
      style={{ animationDelay: `${animationDelay}ms` }}
    >
      <div className="market-card">
        <div className="market-image-wrapper">
          {market.image ? (
            <img
              src={market.image}
              alt={market.question}
              className="market-image"
              loading="lazy"
              onError={(e) => {
                ;(e.target as HTMLImageElement).style.display = 'none'
              }}
            />
          ) : null}
          <span className={`market-status-badge ${statusClass}`}>{statusClass.toUpperCase()}</span>
        </div>

        <div className="market-body">
          <h3 className="market-question">{market.question}</h3>

          <div className="market-meta">
            <span className="market-meta-item">
              Category:<span>{market.category}</span>
            </span>
            <span className="market-meta-item">
              Volume:<span>{formatVolume(market.volume)}</span>
            </span>
          </div>

          <div className={`outcomes ${market.outcomes.length === 2 ? 'outcomes-binary' : ''}`}>
            {market.outcomes.slice(0, 3).map((outcome, index) => {
              const probability = market.probabilities[index] || 0
              return (
                <div
                  key={outcome}
                  className={`outcome-btn ${isResolved ? 'outcome-resolved' : ''}`}
                >
                  <span>{outcome}</span>
                  <span className="outcome-price">{formatPriceLevel(probability)}</span>
                </div>
              )
            })}
            {market.outcomes.length > 3 && (
              <span className="outcome-more">+{market.outcomes.length - 3} more</span>
            )}
          </div>

          <div className="market-actions">
            <span className="market-view-link">
              {isResolved ? 'View Resolution →' : 'View Market →'}
            </span>
          </div>
        </div>
      </div>
    </Link>
  )
}
