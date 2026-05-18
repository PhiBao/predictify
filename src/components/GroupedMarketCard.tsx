import { Link } from 'react-router-dom'
import type { PolymarketMarket } from '../types/market'
import { formatPriceLevel, formatVolume } from '../types/market'

export interface MarketGroup {
  question: string
  imageUrl: string
  description: string
  category: string
  status: string
  volume: number
  groupSlug: string
  markets: PolymarketMarket[]
}

interface GroupedMarketCardProps {
  group: MarketGroup
}

export function GroupedMarketCard({ group }: GroupedMarketCardProps) {
  const statusClass = group.status

  return (
    <Link
      to={`/market/group/${encodeURIComponent(group.groupSlug)}`}
      className="market-card-link"
    >
      <div className="market-card grouped-market-card">
        <div className="market-image-wrapper">
          {group.imageUrl ? (
            <img
              src={group.imageUrl}
              alt={group.question}
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
          <h3 className="market-question">{group.question}</h3>

          {group.description && (
            <p className="market-description">{group.description.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')}</p>
          )}

          <div className="market-meta">
            <span className="market-meta-item">
              Category:<span>{group.category}</span>
            </span>
            <span className="market-meta-item">
              Volume:<span>{formatVolume(group.volume)}</span>
            </span>
            {group.markets.length > 1 && (
              <span className="market-meta-item">
                Markets:<span>{group.markets.length}</span>
              </span>
            )}
          </div>

          <div className="grouped-outcomes">
            {group.markets.map((market) => (
              <div key={market.id} className="grouped-market-row">
                <div className="grouped-market-row-header">
                  <span className="grouped-market-title">{market.question}</span>
                  {market.probabilities[0] && (
                    <span className="grouped-market-probability">
                      {formatPriceLevel(market.probabilities[0])}
                    </span>
                  )}
                </div>
                <div className="grouped-market-outcomes">
                  {market.outcomes.map((outcome, idx) => (
                    <div key={outcome} className="grouped-outcome-btn">
                      {outcome}
                      {market.probabilities[idx] && (
                        <span className="grouped-outcome-price">{formatPriceLevel(market.probabilities[idx])}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Link>
  )
}
