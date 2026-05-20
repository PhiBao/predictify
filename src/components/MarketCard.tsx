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
  const msLeft = deadlineDate ? Math.max(0, deadlineDate.getTime() - now.getTime()) : 0

  function formatDeadline(): string {
    if (!deadlineDate) return ''
    if (isExpired) return 'Ended'
    if (msLeft < 60 * 1000) return `${Math.floor(msLeft / 1000)}s left`
    if (msLeft < 60 * 60 * 1000) return `${Math.floor(msLeft / (60 * 1000))}m left`
    if (msLeft < 24 * 60 * 60 * 1000) return `${Math.floor(msLeft / (60 * 60 * 1000))}h left`
    const days = Math.ceil(msLeft / (24 * 60 * 60 * 1000))
    return days === 1 ? '1 day left' : `${days}d left`
  }

  return (
    <Link
      to={market.groupSlug ? `/market/group/${market.groupSlug}` : `/market/${market.id}`}
      className="market-card-link"
      style={{ animationDelay: `${animationDelay}ms` }}
    >
      <div className={`market-card ${statusClass}`}>
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
              {formatDeadline()}
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
