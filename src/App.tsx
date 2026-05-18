import { Routes, Route, useLocation } from 'react-router-dom'
import { useAccount } from 'wagmi'
import { WalletConnect } from './components/WalletConnect'
import { MarketsList } from './components/MarketsList'
import { MarketDetail } from './components/MarketDetail'
import { MarketGroupDetail } from './components/MarketGroupDetail'
import { ToastProvider } from './contexts/ToastContext'
import { ScrollToTop } from './components/ScrollToTop'
import { useNetworkState } from './hooks/useNetworkState'
import './App.css'

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
            <a href="https://genlayer.com" target="_blank" rel="noopener noreferrer" className="btn-pill btn-pill-outline">
              Learn more about GenLayer
            </a>
          </div>
        </div>
      </section>

      <section className="features-section">
        <div className="features-grid">
          <div className="feature-card">
            <div className="feature-icon">📊</div>
            <h3 className="feature-title">Polymarket Markets</h3>
            <p className="feature-description">
              Browse real prediction markets with deep liquidity across politics, crypto, sports, and more.
            </p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">🧠</div>
            <h3 className="feature-title">GenLayer AI Analysis</h3>
            <p className="feature-description">
              Get AI-powered market intelligence with sentiment analysis, risk assessment, and key factors.
            </p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">⚖️</div>
            <h3 className="feature-title">Trustless Resolution</h3>
            <p className="feature-description">
              Markets resolved by GenLayer AI consensus with dispute review. No central authority needed.
            </p>
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

  if (network.current === 'bnb') {
    return (
      <span className="nav-network-badge bnb">
        <span className="network-dot still" />
        BNB Chain
      </span>
    )
  }

  return null
}

function App() {
  const location = useLocation()
  const isMarketPage = location.pathname.startsWith('/market/')

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
              <a href="https://genlayer.com" target="_blank" rel="noopener noreferrer" className="nav-link">GenLayer</a>
              <a href="https://polymarket.com" target="_blank" rel="noopener noreferrer" className="nav-link">Polymarket</a>
            </div>
            <div className="nav-actions">
              <NetworkBadge />
              <WalletConnect />
            </div>
          </div>
        </nav>

        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/market/:id" element={<MarketDetail />} />
          <Route path="/market/group/:slug" element={<MarketGroupDetail />} />
        </Routes>

        {!isMarketPage && (
          <footer className="app-footer">
            <div className="footer-content">
              <p className="footer-text">
                Markets from{' '}
                <a href="https://polymarket.com" target="_blank" rel="noopener noreferrer">
                  Polymarket
                </a>
                {' · '}
                Resolution by{' '}
                <a href="https://genlayer.com" target="_blank" rel="noopener noreferrer">
                  GenLayer
                </a>
                {' · '}
                Indexed on{' '}
                <a href="https://supabase.com" target="_blank" rel="noopener noreferrer">
                  Supabase
                </a>
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
