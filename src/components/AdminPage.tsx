import { useState, useCallback } from 'react'
import { useAccount } from 'wagmi'
import { useNavigate } from 'react-router-dom'
import { useToast } from '../contexts/ToastContext'
import { getActiveMarkets } from '../services/polymarketAPI'
import { upsertMarkets, getLastSyncTime, updateLastSyncTime, getMarkets as getSupabaseMarkets } from '../services/supabase'
import type { SupabaseMarketRow } from '../types/market'

const ADMIN_ADDRESS = (import.meta.env.VITE_ADMIN_ADDRESS || '').trim().toLowerCase()

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
    setSyncProgress('Fetching active markets from Polymarket...')

    try {
      const batches = []
      let offset = 0
      const limit = 50

      while (true) {
        setSyncProgress(`Fetching batch ${Math.floor(offset / limit) + 1}...`)
        const markets = await getActiveMarkets({ limit, offset, closed: false })
        if (markets.length === 0) break

        const rows: SupabaseMarketRow[] = markets.map((m) => ({
          id: m.id,
          condition_id: m.conditionId,
          question: m.question,
          description: m.description,
          slug: m.slug,
          category: m.category,
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

        batches.push(rows)
        offset += limit

        if (markets.length < limit) break
      }

      setSyncProgress(`Syncing ${batches.reduce((sum, b) => sum + b.length, 0)} markets to Supabase...`)

      for (const batch of batches) {
        await upsertMarkets(batch)
      }

      await updateLastSyncTime(new Date().toISOString())

      showToast(`Successfully synced ${batches.reduce((sum, b) => sum + b.length, 0)} markets`, 'success')
      loadStats()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Sync failed', 'error')
    } finally {
      setSyncing(false)
      setSyncProgress('')
    }
  }, [isAdmin, showToast, loadStats])

  if (!isConnected) {
    return (
      <div className="admin-page">
        <div className="admin-content">
          <button className="back-link" onClick={() => navigate('/')}>← Back</button>
          <div className="admin-empty">
            <h2>Admin Panel</h2>
            <p>Connect your wallet to access the admin panel.</p>
          </div>
        </div>
      </div>
    )
  }

  if (!isAdmin) {
    return (
      <div className="admin-page">
        <div className="admin-content">
          <button className="back-link" onClick={() => navigate('/')}>← Back</button>
          <div className="admin-empty">
            <h2>Access Denied</h2>
            <p>Only the admin wallet can access this page.</p>
            <p className="admin-address">Connected: {address}</p>
            <p className="admin-address">Expected: {ADMIN_ADDRESS || '(not set in .env)'}</p>
            {!ADMIN_ADDRESS && <p className="admin-address" style={{ color: '#ff3b30' }}>Set VITE_ADMIN_ADDRESS in your .env file</p>}
          </div>
        </div>
      </div>
    )
  }

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

        <div className="admin-actions">
          <button
            className="btn-sync"
            onClick={handleSync}
            disabled={syncing}
          >
            {syncing ? 'Syncing...' : 'Sync Markets from Polymarket'}
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
