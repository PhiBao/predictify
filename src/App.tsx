import { Routes, Route, useLocation } from 'react-router-dom'
import { useAccount } from 'wagmi'
import { WalletConnect } from './components/WalletConnect'
import { MarketsList } from './components/MarketsList'
import { MarketDetail } from './components/MarketDetail'
import { MarketGroupDetail } from './components/MarketGroupDetail'
import { AdminPage } from './components/AdminPage'
import { ToastProvider } from './contexts/ToastContext'
import { ScrollToTop } from './components/ScrollToTop'
import { useNetworkState } from './hooks/useNetworkState'
import './App.css'

function NetworkBadge() {
  const { isConnected } = useAccount()
  const network = useNetworkState()

  if (!isConnected || network.isChecking) return null

  if (network.current === 'genlayer') {
    return (
      <span className="nav-network-badge genlayer">
        <span className="network-dot" />
        GenLayer
      </span>
    )
  }

  return (
    <span className="nav-network-badge wrong-chain">
      <span className="network-dot" />
      Wrong Network
    </span>
  )
}

function NetworkPrompt() {
  const { isConnected } = useAccount()
  const network = useNetworkState()

  if (!isConnected || network.isChecking || network.current === 'genlayer') return null

  return (
    <div className="network-prompt">
      <div className="network-prompt-content">
        <span className="network-prompt-icon">⚠️</span>
        <span>Switch to GenLayer Studio to use Predictify</span>
        <button
          className="btn-switch-network"
          onClick={network.switchToGenLayer}
          disabled={network.isSwitching}
        >
          {network.isSwitching ? 'Switching...' : 'Switch Network'}
        </button>
      </div>
    </div>
  )
}

function HomePage() {
  return (
    <>
      <section className="hero-section">
        <div className="hero-content">
          <h1 className="hero-title">Predict the Future.</h1>
          <p className="hero-subtitle">
            AI-powered prediction markets with trustless resolution.
            Markets from Polymarket, resolved by GenLayer.
          </p>
          <div className="hero-ctas">
            <a href="#markets" className="btn-pill btn-pill-primary">
              Explore Markets
            </a>
          </div>
        </div>
      </section>

      <section id="markets" className="section-light">
        <div className="section-content">
          <MarketsList />
        </div>
      </section>
    </>
  )
}

function App() {
  const location = useLocation()
  const { address, isConnected } = useAccount()
  const isMarketPage = location.pathname.startsWith('/market/')
  const isAdminPage = location.pathname === '/admin'

  const adminAddress = (import.meta.env.VITE_ADMIN_ADDRESS || '').trim().toLowerCase()
  const connectedAddr = (address || '').toLowerCase()
  const isAdmin = isConnected && !!adminAddress && connectedAddr === adminAddress

  return (
    <ToastProvider>
      <div className="app">
        <nav className="app-nav">
          <div className="nav-content">
            <a href="/" className="nav-brand">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" fill="none"/>
                <path d="M12 6v6l4 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Predictify
            </a>
          <div className="nav-links">
            <a href="/" className="nav-link">Markets</a>
            {isAdmin && <a href="/admin" className="nav-link">Admin</a>}
          </div>
            <div className="nav-actions">
              <NetworkBadge />
              <WalletConnect />
            </div>
          </div>
        </nav>

        <NetworkPrompt />

        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/market/:id" element={<MarketDetail />} />
          <Route path="/market/group/:slug" element={<MarketGroupDetail />} />
          <Route path="/admin" element={<AdminPage />} />
        </Routes>

        {!isMarketPage && !isAdminPage && (
          <footer className="app-footer">
            <div className="footer-content">
              <p className="footer-text">
                Markets from{' '}
                <a href="https://polymarket.com" target="_blank" rel="noopener noreferrer">Polymarket</a>
                {' · '}
                Resolution by{' '}
                <a href="https://genlayer.com" target="_blank" rel="noopener noreferrer">GenLayer</a>
              </p>
            </div>
          </footer>
        )}

        <ScrollToTop />
      </div>
    </ToastProvider>
  )
}

export default App
