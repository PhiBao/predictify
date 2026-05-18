import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getMarketsByGroupSlug } from '../services/polymarketAPI'
import { getMarketsByGroupSlug as getSupabaseGroupMarkets } from '../services/supabase'
import type { PolymarketMarket } from '../types/market'
import { formatPriceLevel, formatVolume } from '../types/market'

function parseCategory(raw: string): string {
  if (!raw) return 'Other'
  try {
    const parsed = JSON.parse(raw)
    return parsed.label || parsed.name || raw
  } catch {
    return raw
  }
}

export function MarketGroupDetail() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const [groupMarkets, setGroupMarkets] = useState<PolymarketMarket[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function fetchGroup() {
      if (!slug) return
      try {
        setLoading(true)
        setError(null)

        const decodedSlug = decodeURIComponent(slug).trim()
        let marketsData: PolymarketMarket[] = []

        try {
          const cached = await getSupabaseGroupMarkets(decodedSlug)
          if (cached.length > 0) {
            marketsData = cached.map((row) => ({
              id: row.id,
              conditionId: row.condition_id,
              question: row.question,
              description: row.description,
              slug: row.slug,
              category: parseCategory(row.category),
              tags: row.tags,
              outcomes: row.outcomes,
              outcomePrices: row.outcome_prices,
              probabilities: row.probabilities,
              volume: row.volume,
              volume24h: row.volume_24h,
              liquidity: row.liquidity,
              status: row.status,
              closeDate: row.close_date,
              endDate: row.end_date,
              image: row.image,
              icon: row.icon,
              resolutionSource: row.resolution_source,
              groupSlug: row.group_slug || undefined,
              groupName: row.group_name || undefined,
            }))
          }
        } catch {
          // fall through to live fetch
        }

        if (marketsData.length === 0) {
          marketsData = await getMarketsByGroupSlug(decodedSlug)
          marketsData = marketsData.map((m) => ({ ...m, category: parseCategory(m.category) }))
        }

        if (cancelled) return

        if (marketsData.length === 0) {
          setError('No markets found for this group.')
        } else {
          setGroupMarkets(marketsData)
        }
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Failed to load markets')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchGroup()
    return () => { cancelled = true }
  }, [slug])

  const firstMarket = groupMarkets[0]

  const displayTitle = useMemo(() => {
    if (!firstMarket) return ''
    if (firstMarket.groupName) return firstMarket.groupName
    return firstMarket.question
  }, [firstMarket])

  if (loading) {
    return (
      <div className="market-detail-loading">
        <div className="loading-spinner"></div>
        <p>Loading market group...</p>
      </div>
    )
  }

  if (error || !firstMarket) {
    return (
      <div className="market-detail-error">
        <h2>Market group not found</h2>
        <p>{error || 'This market group does not exist or has been removed.'}</p>
        <button className="btn-pill btn-pill-primary" onClick={() => navigate('/')}>
          Back to Markets
        </button>
      </div>
    )
  }

  return (
    <div className="market-detail">
      <div className="market-detail-hero">
        <div className="market-detail-content">
          <button className="back-link" onClick={() => navigate(-1)}>
            ← Back
          </button>

          <div className="market-detail-header">
            {firstMarket.image && (
              <div className="market-detail-image">
                <img src={firstMarket.image} alt={displayTitle} />
              </div>
            )}
            <div className="market-detail-info">
              <div className="market-detail-badges">
                <span className={`market-status-badge ${firstMarket.status}`}>
                  {firstMarket.status.toUpperCase()}
                </span>
                <span className="market-detail-category">{firstMarket.category}</span>
              </div>
              <h1 className="market-detail-title">{displayTitle}</h1>
              <div className="market-detail-meta">
                <span>Volume: {formatVolume(firstMarket.volume)}</span>
                <span className="meta-tag">{groupMarkets.length} Markets</span>
              </div>
            </div>
          </div>

          <div className="market-detail-outcomes">
            <h3>Markets</h3>
            <div className="market-group-rows">
              {groupMarkets.map((market) => (
                <div key={market.id} className="market-group-row">
                  <div className="market-group-row-title">
                    <a href={`/market/${market.id}`} className="market-group-row-link">
                      {market.question}
                    </a>
                  </div>
                  <div className="outcomes-grid">
                    {market.outcomes.map((outcome, idx) => {
                      const probability = market.probabilities[idx] || 0
                      return (
                        <div key={outcome} className="outcome-card">
                          <div className="outcome-card-header">
                            <span className="outcome-card-name">{outcome}</span>
                          </div>
                          <div className="outcome-card-prices">
                            <span className="outcome-price probability">
                              {formatPriceLevel(probability)}
                            </span>
                          </div>
                          <div className="outcome-probability-bar">
                            <div
                              className="outcome-probability-fill"
                              style={{ width: `${probability * 100}%` }}
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
