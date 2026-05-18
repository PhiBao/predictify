# Agent Instructions — Predictify v2

## Project Overview

This is a React 19 + TypeScript + Vite prediction market DApp with:
1. **Polymarket data** — markets fetched from Polymarket Gamma API
2. **Supabase indexing** — all market data cached and indexed in Supabase
3. **GenLayer AI** — handles market analysis, outcome resolution, and dispute review
4. **Apple-inspired design system** with glass navigation and cinematic sections
5. **Unified wallet** — MetaMask for GenLayer interactions

## Quick Commands

```bash
npm run dev       # Start development server (http://localhost:5173)
npm run build     # Production build
npm run lint      # ESLint check
npm run preview   # Preview production build
```

## Architecture

```
src/
  components/         # UI components (Apple design system)
    MarketCard.tsx        # Market card with outcome probabilities
    GroupedMarketCard.tsx # Grouped card with internal scroll for rows
    MarketsList.tsx       # Market grid with filter tabs (Live/Trending/Closing Soon/Resolved/All)
    MarketDetail.tsx      # Detail page with outcomes, GenLayer analysis + resolution
    MarketGroupDetail.tsx # Unified group detail page with all markets
    ResolutionModal.tsx   # Request market resolution via GenLayer
    DisputeModal.tsx      # Challenge a resolution with evidence
    AnalyzeModal.tsx      # Standalone AI analysis modal
    WalletConnect.tsx     # RainbowKit wallet button
    Toast.tsx             # Notification system
    MarketSkeleton.tsx    # Shimmer loading skeletons
    ScrollToTop.tsx       # Floating scroll-to-top
  contexts/
    ToastContext.tsx      # Global toast notifications
  hooks/
    useGenLayer.ts        # GenLayer state management (analysis, resolution, disputes)
    useNetworkState.ts    # Network detection + switching
  lib/genlayer/
    client.ts             # GenLayer client + MetaMask network helpers
  services/
    polymarketAPI.ts      # Polymarket Gamma API client
    supabase.ts           # Supabase client for market indexing
    genlayer.ts           # GenLayer contract service (analysis + resolution + disputes)
  types/
    market.ts             # TypeScript definitions for markets, analysis, resolution, disputes
    predict.ts            # Re-exports from market.ts for backwards compatibility
  config/
    wagmi.ts              # Wagmi + RainbowKit config
  App.tsx               # Routes, nav with network badge, hero, features
  App.css               # Apple Design System + detail page + card styles
  index.css             # Global design tokens
  main.tsx              # Entry point

contracts/
  MarketResolver.py     # GenLayer Intelligent Contract (deploy to Studio)
```

## Key Technical Details

### Data Flow

```
Polymarket Gamma API → Supabase (cache/index) → Frontend
                                                    ↓
                                              GenLayer Contract
                                          (Analysis/Resolution/Disputes)
```

### Polymarket Integration
- Markets fetched from `https://gamma-api.polymarket.com/events`
- Supports filtering by category, tag, slug, closed status
- Markets are synced to Supabase for faster loading and offline caching
- No trading — markets are informational with GenLayer-powered resolution

### Supabase Integration
- Tables: `markets`, `analyses`, `resolutions`, `disputes`, `sync_metadata`
- Markets are upserted on fetch for caching
- Analysis and resolution results are stored after GenLayer transactions
- Provides fallback when Polymarket API is unavailable

**Required Supabase schema:**
```sql
CREATE TABLE markets (
  id TEXT PRIMARY KEY,
  condition_id TEXT,
  question TEXT NOT NULL,
  description TEXT,
  slug TEXT,
  category TEXT,
  tags TEXT[],
  outcomes TEXT[],
  outcome_prices TEXT[],
  probabilities FLOAT[],
  volume FLOAT,
  volume_24h FLOAT,
  liquidity FLOAT,
  status TEXT,
  close_date TEXT,
  end_date TEXT,
  image TEXT,
  icon TEXT,
  resolution_source TEXT,
  group_slug TEXT,
  group_name TEXT,
  last_synced TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE analyses (
  id SERIAL PRIMARY KEY,
  market_id TEXT NOT NULL,
  sentiment TEXT,
  confidence INT,
  summary TEXT,
  key_factors TEXT[],
  risk_level TEXT,
  recommended_action TEXT,
  timestamp TEXT,
  tx_hash TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE resolutions (
  id SERIAL PRIMARY KEY,
  market_id TEXT NOT NULL,
  resolved_outcome TEXT,
  outcome_index INT,
  confidence INT,
  reasoning TEXT,
  evidence TEXT[],
  timestamp TEXT,
  tx_hash TEXT,
  status TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE disputes (
  id SERIAL PRIMARY KEY,
  market_id TEXT NOT NULL,
  resolution_id INT,
  challenger TEXT,
  proposed_outcome TEXT,
  proposed_outcome_index INT,
  evidence TEXT,
  reasoning TEXT,
  status TEXT,
  timestamp TEXT,
  tx_hash TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE sync_metadata (
  id INT PRIMARY KEY DEFAULT 1,
  last_sync TIMESTAMPTZ
);
```

### GenLayer Integration

**One contract handles everything:** `contracts/MarketResolver.py`

**Three core functions:**
1. `analyze_market()` — AI opinion on market sentiment, risk, key factors
2. `resolve_market()` — AI determines the actual outcome based on evidence
3. `dispute_resolution()` — Challenge a resolution; AI reviews and makes final judgment

**Network:** GenLayer Studio (Chain ID 61999)
**Payment:** native GEN tokens via `value: BigInt(amountWei)`

### GenLayer Contract Pattern (v0.1.x — Studio Compatible)

```python
from dataclasses import dataclass
from genlayer import *

@allow_storage
@dataclass
class AnalysisResult:
    sentiment: str
    confidence: u32
    summary: str
    key_factors_json: str
    risk_level: str
    recommended_action: str
    timestamp: str
    analyst: Address

@allow_storage
@dataclass
class ResolutionResult:
    market_id: str
    resolved_outcome: str
    outcome_index: u32
    confidence: u32
    reasoning: str
    evidence_json: str
    timestamp: str
    resolver: Address
    is_finalized: bool
    dispute_count: u32

@allow_storage
@dataclass
class DisputeRecord:
    market_id: str
    resolution_id: u256
    challenger: Address
    proposed_outcome: str
    proposed_outcome_index: u32
    evidence: str
    reasoning: str
    timestamp: str
    is_valid: bool
    reviewed: bool

class MarketResolver(gl.Contract):
    analyses: TreeMap[u256, AnalysisResult]
    analysis_count: u256
    resolutions: TreeMap[u256, ResolutionResult]
    resolution_count: u256
    disputes: TreeMap[u256, DisputeRecord]
    dispute_count: u256
    market_resolutions: TreeMap[str, u256]
    min_analysis_fee: u256
    min_resolution_fee: u256
    min_dispute_fee: u256
    owner: Address
    # ... see contracts/MarketResolver.py for full implementation
```

### Frontend Patterns

**GenLayer writeContract + polling (SDK-native):**
```typescript
const receipt = await client.waitForTransactionReceipt({
  hash: txHash,
  status: TransactionStatus.FINALIZED,
  interval: 3000,
  retries: 200,
});
```

**u256 parsing from readContract:**
```typescript
function parseU256(raw: unknown): number {
  if (typeof raw === 'bigint') return Number(raw);
  if (typeof raw === 'number') return raw;
  if (typeof raw === 'string') return Number(raw);
  const obj = raw as { value?: bigint | number | string };
  return Number(obj.value ?? 0);
}
```

### Design System
- Apple Design System colors, typography, spacing
- CSS custom properties in `index.css`
- Component styles in `App.css`
- No external UI library — pure custom CSS

## Code Quality Standards

1. **TypeScript Strict:** Minimize `any`, prefer explicit interfaces
2. **Error Handling:** All async operations wrapped in try/catch
3. **Effect Cleanup:** Use cancellation flags for async effects
4. **Accessibility:** ARIA labels, focus states, semantic HTML
5. **Performance:** Lazy loading images, memoized callbacks
6. **Security:** No secrets in code, input validation, sanitized outputs

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| VITE_WALLETCONNECT_PROJECT_ID | Yes | WalletConnect project ID |
| VITE_SUPABASE_URL | Yes | Supabase project URL |
| VITE_SUPABASE_ANON_KEY | Yes | Supabase anon key |
| VITE_GENLAYER_RPC | No | GenLayer RPC endpoint (default: https://studio.genlayer.com/api) |
| VITE_GENLAYER_CONTRACT | Yes | Deployed MarketResolver address |

## Deploying the GenLayer Contract

1. Open [GenLayer Studio](https://studio.genlayer.com)
2. Create new contract → paste `contracts/MarketResolver.py`
3. Deploy → copy contract address
4. Add to `.env`: `VITE_GENLAYER_CONTRACT=0x...`
5. Get GEN from Studio faucet

## Design Tokens Reference

```css
/* Colors */
--apple-black: #000000
--apple-light-gray: #f5f5f7
--apple-near-black: #1d1d1f
--apple-blue: #0071e3
--apple-bright-blue: #2997ff

/* Typography */
--font-display: Inter, SF Pro Display, sans-serif
--font-body: Inter, SF Pro Text, sans-serif

/* Border Radius */
--radius-md: 12px
--radius-pill: 980px
```

## Troubleshooting

**Build fails:**
- Check Node.js version (18+)
- Run `npm install` to ensure all deps

**Wallet won't connect:**
- Verify MetaMask is installed and unlocked
- Check WalletConnect project ID

**GenLayer operations fail:**
- Ensure MetaMask is connected to GenLayer Studio network (Chain ID 61999)
- Check GEN balance (get from Studio faucet)
- Verify contract address is set in `.env`
- Check browser console for specific error

**Markets not loading:**
- Check Supabase connection (URL and anon key in `.env`)
- Polymarket API may be rate-limited; Supabase cache provides fallback

## External Resources

- [Polymarket API Docs](https://polymarket.com/)
- [GenLayer Full Docs](https://docs.genlayer.com/full-documentation.txt)
- [GenLayer JS SDK API](https://sdk.genlayer.com/main/_static/ai/api.txt)
- [Supabase Docs](https://supabase.com/docs)
