import { Link } from 'react-router-dom'
import type { PolymarketMarket, PoolEntry } from '../types/market'
import { formatVolume, formatGen } from '../types/market'

interface MarketCardProps {
  market: PolymarketMarket
  animationDelay?: number
  pools?: PoolEntry[]
}

function calculatePercentages(outcomes: string[], pools: PoolEntry[] | undefined): { percentages: number[]; totalStaked: number } {
  if (!pools || pools.length === 0) {
    const equalShare = 100 / outcomes.length
    return { percentages: outcomes.map(() => equalShare), totalStaked: 0 }
  }

  const totalStaked = pools.reduce((sum, p) => sum + p.amount, 0)
  if (totalStaked === 0) {
    const equalShare = 100 / outcomes.length
    return { percentages: outcomes.map(() => equalShare), totalStaked: 0 }
  }

  const percentages = outcomes.map((_, index) => {
    const pool = pools.find((p) => p.outcomeIndex === index)
    return pool ? (pool.amount / totalStaked) * 100 : 0
  })

  return { percentages, totalStaked }
}

export function MarketCard({ market, animationDelay = 0, pools }: MarketCardProps) {
  const statusClass = market.status
  const isResolved = market.status === 'resolved' || market.status === 'closed'

  const { percentages, totalStaked } = calculatePercentages(market.outcomes, pools)

  const deadline = market.endDate || market.closeDate
  const deadlineDate = deadline ? new Date(deadline) : null
  const now = new Date()
  const isExpired = deadlineDate ? now > deadlineDate : false
  const daysLeft = deadlineDate ? Math.max(0, Math.ceil((deadlineDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))) : null

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
          {deadlineDate && !isExpired && (
            <span className="market-deadline-badge">
              {daysLeft === 0 ? 'Ends today' : daysLeft === 1 ? '1 day left' : `${daysLeft}d left`}
            </span>
          )}
          {deadlineDate && isExpired && (
            <span className="market-deadline-badge expired">Ended</span>
          )}
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
            {totalStaked > 0 && (
              <span className="market-meta-item">
                Staked:<span>{formatGen(totalStaked)}</span>
              </span>
            )}
          </div>

          <div className="market-unified-bar">
            {market.outcomes.slice(0, 4).map((outcome, index) => (
              <div
                key={outcome}
                className="market-unified-segment"
                style={{
                  width: `${percentages[index]}%`,
                  animationDelay: `${animationDelay + index * 100}ms`,
                }}
              >
                <span className="market-unified-label">{outcome}</span>
                <span className="market-unified-percent">{percentages[index].toFixed(0)}%</span>
              </div>
            ))}
          </div>

          <div className="market-actions">
            <span className="market-view-link">
              {isResolved ? 'View Resolution →' : 'Stake Now →'}
            </span>
          </div>
        </div>
      </div>
    </Link>
  )
}
