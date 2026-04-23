import { Routes, Route, useLocation } from 'react-router-dom';
import { useAccount } from 'wagmi';
import { WalletConnect } from './components/WalletConnect';
import { MarketsList } from './components/MarketsList';
import { UserPositions } from './components/UserPositions';
import { MarketDetail } from './components/MarketDetail';
import { ToastProvider } from './contexts/ToastContext';
import { ScrollToTop } from './components/ScrollToTop';
import './App.css';

function HomePage() {
  const { isConnected } = useAccount();

  return (
    <>
      {/* Hero Section */}
      <section className="hero-section">
        <div className="hero-content">
          <h1 className="hero-title">Trade the Future.</h1>
          <p className="hero-subtitle">
            Decentralized prediction markets powered by AI.
            Analyze with GenLayer, trade with confidence.
          </p>
          <div className="hero-ctas">
            <a href="#markets" className="btn-pill btn-pill-primary">
              Explore Markets
            </a>
            <a href="https://dev.predict.fun" target="_blank" rel="noopener noreferrer" className="btn-pill btn-pill-outline">
              Learn more ›
            </a>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="features-section">
        <div className="features-grid">
          <div className="feature-card">
            <div className="feature-icon">🎯</div>
            <h3 className="feature-title">Prediction Markets</h3>
            <p className="feature-description">
              Trade on real-world outcomes across crypto, politics, sports, and more with deep liquidity.
            </p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">🧠</div>
            <h3 className="feature-title">GenLayer AI Analysis</h3>
            <p className="feature-description">
              Leverage AI-powered market intelligence. Pay with native GEN tokens for real-time sentiment and risk analysis.
            </p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">🔐</div>
            <h3 className="feature-title">Self-Custodial</h3>
            <p className="feature-description">
              Your keys, your positions. Trade directly from your wallet with no intermediaries or custodial risk.
            </p>
          </div>
        </div>
      </section>

      {/* Positions Section */}
      {isConnected && (
        <section id="positions" className="section-light">
          <div className="section-content">
            <UserPositions />
          </div>
        </section>
      )}

      {/* Markets Section */}
      <section id="markets" className="section-light">
        <div className="section-content">
          <MarketsList />
        </div>
      </section>
    </>
  );
}

function App() {
  const location = useLocation();
  const isMarketPage = location.pathname.startsWith('/market/');

  return (
    <ToastProvider>
      <div className="app">
        {/* Apple-style Navigation */}
        <nav className="app-nav">
          <div className="nav-content">
            <a href="/" className="nav-brand">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" fill="none"/>
                <path d="M12 6v6l4 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Predict.fun
            </a>
            <div className="nav-links">
              <a href="/#markets" className="nav-link">Markets</a>
              <a href="/#positions" className="nav-link">Positions</a>
              <a href="https://dev.predict.fun" target="_blank" rel="noopener noreferrer" className="nav-link">Docs</a>
            </div>
            <div className="nav-actions">
              <WalletConnect />
            </div>
          </div>
        </nav>

        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/market/:id" element={<MarketDetail />} />
        </Routes>

        {/* Footer - hide on market detail for cleaner focus */}
        {!isMarketPage && (
          <footer className="app-footer">
            <div className="footer-content">
              <p className="footer-text">
                Powered by{' '}
                <a href="https://predict.fun" target="_blank" rel="noopener noreferrer">
                  Predict.fun
                </a>
                {' · '}
                <a href="https://dev.predict.fun" target="_blank" rel="noopener noreferrer">
                  API Docs
                </a>
                {' · '}
                <a href="https://genlayer.com" target="_blank" rel="noopener noreferrer">
                  GenLayer
                </a>
              </p>
            </div>
          </footer>
        )}

        <ScrollToTop />
      </div>
    </ToastProvider>
  );
}

export default App;
