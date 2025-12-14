import { useAccount } from 'wagmi';
import { WalletConnect } from './components/WalletConnect';
import { MarketsList } from './components/MarketsList';
import { UserPositions } from './components/UserPositions';
import { ToastProvider } from './contexts/ToastContext';
import './App.css';

function App() {
  const { isConnected } = useAccount();

  return (
    <ToastProvider>
      <div className="app">
      <header className="app-header">
        <div className="header-content">
          <h1>🎯 Predict.fun</h1>
          <WalletConnect />
        </div>
      </header>

      <main className="app-main">
        {isConnected && (
          <section className="positions-section">
            <UserPositions />
          </section>
        )}

        <section className="markets-section">
          <MarketsList />
        </section>
      </main>

      <footer className="app-footer">
        <p>
          Powered by <a href="https://predict.fun" target="_blank" rel="noopener noreferrer">Predict</a>
          {' · '}
          <a href="https://dev.predict.fun" target="_blank" rel="noopener noreferrer">API Docs</a>
        </p>
      </footer>
      </div>
    </ToastProvider>
  );
}

export default App;
