import { useState, useCallback } from 'react'
import { useAccount } from 'wagmi'
import { useNavigate } from 'react-router-dom'
import { useToast } from '../contexts/ToastContext'
import { getActiveMarkets, getTrendingMarkets, getClosingSoonMarkets } from '../services/polymarketAPI'
import { upsertMarkets, getLastSyncTime, updateLastSyncTime, getMarkets as getSupabaseMarkets } from '../services/supabase'
import type { SupabaseMarketRow } from '../types/market'

const ADMIN_ADDRESS = (import.meta.env.VITE_ADMIN_ADDRESS || '').trim().toLowerCase()

type SyncMode = 'active' | 'trending' | 'closing-soon' | 'all'

interface SyncStats {
  total: number
  active: number
  resolved: number
  closed: number
  lastSync: string | null
}

export function AdminPage() {
  const { address, isConnected } = useAccount()
  const navigate = useNavigate()
  const { showToast } = useToast()

  const [syncing, setSyncing] = useState(false)
  const [syncProgress, setSyncProgress] = useState('')
  const [syncMode, setSyncMode] = useState<SyncMode>('active')
  const [stats, setStats] = useState<SyncStats | null>(null)
  const [loadingStats, setLoadingStats] = useState(false)

  const connectedAddr = (address || '').toLowerCase()
  const isAdmin = isConnected && !!ADMIN_ADDRESS && connectedAddr === ADMIN_ADDRESS

  const loadStats = useCallback(async () => {
    setLoadingStats(true)
    try {
      const lastSync = await getLastSyncTime()

      const [active, resolved, all] = await Promise.all([
        getSupabaseMarkets({ status: 'active', limit: 1 }),
        getSupabaseMarkets({ status: 'resolved', limit: 1 }),
        getSupabaseMarkets({ limit: 1 }),
      ])

      setStats({
        total: all.length,
        active: active.length,
        resolved: resolved.length,
        closed: 0,
        lastSync: lastSync || null,
      })
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to load stats', 'error')
    } finally {
      setLoadingStats(false)
    }
  }, [showToast])

  const handleSync = useCallback(async () => {
    if (!isAdmin) {
      showToast('Not authorized', 'error')
      return
    }

    setSyncing(true)
    setSyncProgress('Fetching markets from Polymarket...')

    try {
      let allMarkets: Awaited<ReturnType<typeof getActiveMarkets>>

      switch (syncMode) {
        case 'trending':
          setSyncProgress('Fetching trending markets...')
          allMarkets = await getTrendingMarkets(200)
          break
        case 'closing-soon':
          setSyncProgress('Fetching closing soon markets...')
          allMarkets = await getClosingSoonMarkets(200)
          break
        case 'all':
          setSyncProgress('Fetching all markets...')
          allMarkets = await fetchAllMarkets()
          break
        default:
          setSyncProgress('Fetching active markets...')
          allMarkets = await fetchAllMarkets()
      }

      setSyncProgress(`Processing ${allMarkets.length} markets...`)

      const rows: SupabaseMarketRow[] = allMarkets.map((m) => ({
        id: m.id,
        condition_id: m.conditionId,
        question: m.question,
        description: m.description,
        slug: m.slug,
        category: typeof m.category === 'string' ? m.category : JSON.stringify(m.category),
        tags: m.tags,
        outcomes: m.outcomes,
        outcome_prices: m.outcomePrices,
        probabilities: m.probabilities,
        volume: m.volume,
        volume_24h: m.volume24h,
        liquidity: m.liquidity,
        status: m.status,
        close_date: m.closeDate,
        end_date: m.endDate,
        image: m.image,
        icon: m.icon,
        resolution_source: m.resolutionSource,
        group_slug: m.groupSlug || null,
        group_name: m.groupName || null,
        last_synced: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }))

      setSyncProgress(`Upserting ${rows.length} markets to Supabase...`)

      const batchSize = 50
      for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize)
        await upsertMarkets(batch)
        setSyncProgress(`Upserting batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(rows.length / batchSize)}...`)
      }

      await updateLastSyncTime(new Date().toISOString())

      showToast(`Successfully synced ${rows.length} markets`, 'success')
      loadStats()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Sync failed', 'error')
    } finally {
      setSyncing(false)
      setSyncProgress('')
    }
  }, [isAdmin, showToast, loadStats, syncMode])

  return (
    <div className="admin-page">
      <div className="admin-content">
        <button className="back-link" onClick={() => navigate('/')}>← Back</button>

        <div className="admin-header">
          <h1>Admin Panel</h1>
          <p className="admin-wallet">
            <span className="admin-dot" />
            {address?.slice(0, 6)}...{address?.slice(-4)}
          </p>
        </div>

        {stats && (
          <div className="admin-stats">
            <div className="stat-card">
              <span className="stat-value">{stats.total}</span>
              <span className="stat-label">Total Markets</span>
            </div>
            <div className="stat-card">
              <span className="stat-value">{stats.active}</span>
              <span className="stat-label">Active</span>
            </div>
            <div className="stat-card">
              <span className="stat-value">{stats.resolved}</span>
              <span className="stat-label">Resolved</span>
            </div>
            <div className="stat-card">
              <span className="stat-value">{stats.lastSync ? new Date(stats.lastSync).toLocaleString() : 'Never'}</span>
              <span className="stat-label">Last Sync</span>
            </div>
          </div>
        )}

        <div className="admin-sync-options">
          <h3>Sync Mode</h3>
          <div className="sync-mode-buttons">
            <button
              className={`sync-mode-btn ${syncMode === 'active' ? 'active' : ''}`}
              onClick={() => setSyncMode('active')}
            >
              Active Markets
            </button>
            <button
              className={`sync-mode-btn ${syncMode === 'trending' ? 'active' : ''}`}
              onClick={() => setSyncMode('trending')}
            >
              Trending
            </button>
            <button
              className={`sync-mode-btn ${syncMode === 'closing-soon' ? 'active' : ''}`}
              onClick={() => setSyncMode('closing-soon')}
            >
              Closing Soon
            </button>
            <button
              className={`sync-mode-btn ${syncMode === 'all' ? 'active' : ''}`}
              onClick={() => setSyncMode('all')}
            >
              All Markets
            </button>
          </div>
          <p className="sync-mode-hint">
            {syncMode === 'active' && 'Fetches all active markets from Polymarket'}
            {syncMode === 'trending' && 'Fetches top 200 trending markets by volume'}
            {syncMode === 'closing-soon' && 'Fetches markets closing within 24 hours'}
            {syncMode === 'all' && 'Fetches all markets (active + closed) - may take longer'}
          </p>
        </div>

        <div className="admin-actions">
          <button
            className="btn-sync"
            onClick={handleSync}
            disabled={syncing}
          >
            {syncing ? 'Syncing...' : `Sync ${syncMode === 'all' ? 'All' : syncMode === 'trending' ? 'Trending' : syncMode === 'closing-soon' ? 'Closing Soon' : 'Active'} Markets`}
          </button>

          <button
            className="btn-refresh-stats"
            onClick={loadStats}
            disabled={loadingStats}
          >
            {loadingStats ? 'Loading...' : 'Refresh Stats'}
          </button>
        </div>

        {syncProgress && (
          <div className="sync-progress">
            <div className="sync-spinner" />
            <span>{syncProgress}</span>
          </div>
        )}
      </div>
    </div>
  )
}

async function fetchAllMarkets() {
  const markets: Awaited<ReturnType<typeof getActiveMarkets>> = []
  let offset = 0
  const limit = 50

  while (true) {
    const batch = await getActiveMarkets({ limit, offset, closed: false })
    if (batch.length === 0) break

    markets.push(...batch)
    offset += limit

    if (batch.length < limit) break
  }

  return markets
}
