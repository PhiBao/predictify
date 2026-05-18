import type { PolymarketMarket, Position } from '../types/market'
import { formatShares, formatPriceLevel } from '../types/market'

interface PositionsPanelProps {
  market: PolymarketMarket
  positions: Position[]
  onSell: () => void
}

export function PositionsPanel({ market, positions, onSell }: PositionsPanelProps) {
  if (positions.length === 0) return null

  const totalValue = positions.reduce((sum, pos) => {
    const price = market.probabilities[pos.outcomeIndex] || 0
    return sum + pos.shares * price
  }, 0)

  return (
    <div className="positions-panel">
      <div className="positions-header">
        <h3>Your Positions</h3>
        <span className="positions-total">
          Est. Value: {totalValue.toFixed(4)} GEN
        </span>
      </div>

      <div className="positions-list">
        {positions.map((pos) => {
          const outcomeName = market.outcomes[pos.outcomeIndex] || `Outcome ${pos.outcomeIndex}`
          const currentPrice = market.probabilities[pos.outcomeIndex] || 0
          const currentValue = pos.shares * currentPrice
          const costBasis = pos.shares * (pos.avgPrice / 1e18)
          const pnl = currentValue - costBasis
          const pnlPercent = costBasis > 0 ? (pnl / costBasis) * 100 : 0
          const isProfit = pnl >= 0

          return (
            <div key={pos.outcomeIndex} className="position-item">
              <div className="position-info">
                <span className="position-outcome">{outcomeName}</span>
                <span className="position-shares">{formatShares(pos.shares)} shares</span>
              </div>
              <div className="position-details">
                <span className="position-price">
                  Avg: {formatPriceLevel(pos.avgPrice / 1e18)}
                </span>
                <span className={`position-pnl ${isProfit ? 'profit' : 'loss'}`}>
                  {isProfit ? '+' : ''}{pnl.toFixed(4)} GEN ({isProfit ? '+' : ''}{pnlPercent.toFixed(1)}%)
                </span>
              </div>
              <button
                className="btn-sell-position"
                onClick={onSell}
              >
                Sell
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
