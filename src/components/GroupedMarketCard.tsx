import { Link } from 'react-router-dom'
import type { PolymarketMarket, PoolEntry } from '../types/market'
import { formatVolume, formatGen } from '../types/market'

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
  poolsByMarketId?: Record<string, PoolEntry[]>
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

export function GroupedMarketCard({ group, poolsByMarketId }: GroupedMarketCardProps) {
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
            {group.markets.map((market) => {
              const pools = poolsByMarketId?.[market.id]
              const { percentages, totalStaked } = calculatePercentages(market.outcomes, pools)
              const deadline = market.endDate || market.closeDate
              const deadlineDate = deadline ? new Date(deadline) : null
              const now = new Date()
              const isExpired = deadlineDate ? now > deadlineDate : false
              const daysLeft = deadlineDate ? Math.max(0, Math.ceil((deadlineDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))) : null

              return (
                <div key={market.id} className="grouped-market-row">
                  <div className="grouped-market-row-header">
                    <span className="grouped-market-title">{market.question}</span>
                    <div className="grouped-market-row-meta">
                      {totalStaked > 0 && (
                        <span className="grouped-market-staked">{formatGen(totalStaked)}</span>
                      )}
                      {deadlineDate && (
                        <span className={`grouped-market-deadline ${isExpired ? 'expired' : ''}`}>
                          {isExpired ? 'Ended' : daysLeft === 0 ? 'Ends today' : daysLeft === 1 ? '1 day left' : `${daysLeft}d left`}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="grouped-unified-bar">
                    {market.outcomes.slice(0, 4).map((outcome, index) => (
                      <div
                        key={outcome}
                        className="grouped-unified-segment"
                        style={{ width: `${percentages[index]}%` }}
                      >
                        <span className="grouped-unified-label">{outcome}</span>
                        <span className="grouped-unified-percent">{percentages[index].toFixed(0)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </Link>
  )
}
