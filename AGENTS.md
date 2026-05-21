# Agent Instructions — Predictify v2

## Project Overview

This is a React 19 + TypeScript + Vite prediction market DApp with:
1. **Polymarket data** — markets fetched from Polymarket Gamma API
2. **Supabase indexing** — all market data cached and indexed in Supabase
3. **GenLayer AI** — handles market resolution and dispute review via staking-based predict market contract
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
    MarketDetail.tsx      # Detail page with outcomes, GenLayer resolution + dispute
    MarketGroupDetail.tsx # Unified group detail page with all markets
    ResolutionModal.tsx   # Request market resolution via GenLayer
    DisputeModal.tsx      # Challenge a resolution with evidence
    StakeModal.tsx        # Stake GEN tokens on outcomes
    WalletConnect.tsx     # RainbowKit wallet button
    Toast.tsx             # Notification system
    MarketSkeleton.tsx    # Shimmer loading skeletons
    ScrollToTop.tsx       # Floating scroll-to-top
    PortfolioPage.tsx     # User portfolio with stakes + claimable winnings
  contexts/
    ToastContext.tsx      # Global toast notifications
  hooks/
    useGenLayer.ts        # GenLayer state management (stake, resolve, dispute, claim)
    useNetworkState.ts    # Network detection + switching (GenLayer Studio)
  lib/genlayer/
    client.ts             # GenLayer client + MetaMask network helpers
  services/
    polymarketAPI.ts      # Polymarket Gamma API client
    supabase.ts           # Supabase client for market indexing
    genlayer.ts           # GenLayer contract service (stake + resolve + dispute + claim)
  types/
    market.ts             # TypeScript definitions for markets, stakes, resolutions, disputes
    predict.ts            # Re-exports from market.ts for backwards compatibility
  config/
    wagmi.ts              # Wagmi + RainbowKit config
  App.tsx               # Routes, nav with network badge, hero, features
  App.css               # Apple Design System + detail page + card styles
  index.css             # Global design tokens
  main.tsx              # Entry point

contracts/
  MarketResolver.py     # GenLayer Intelligent Contract (deploy to Studio)

demo/
  demo.sh               # Automated demo script (<  2 min)
```

## Data Flow

```
Polymarket Gamma API → Supabase (cache/index) → Frontend
                                                    ↓
                                          GenLayer PredictMarket Contract
                                        (Stake → Resolve → Dispute → Claim)
```

### Polymarket Integration
- Markets fetched from `https://gamma-api.polymarket.com/events`
- Supports filtering by category, tag, slug, closed status
- Markets are synced to Supabase for faster loading and offline caching
- No trading — markets are informational with GenLayer-powered resolution

### Supabase Integration
- Tables: `markets`, `analyses`, `resolutions`, `disputes`, `sync_metadata`, `stakes`, `market_pools`
- Markets are upserted on fetch for caching
- Stake and pool data cached after GenLayer transactions
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

CREATE TABLE market_pools (
  id SERIAL PRIMARY KEY,
  market_id TEXT NOT NULL,
  outcome_index INT NOT NULL,
  amount FLOAT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(market_id, outcome_index)
);

CREATE TABLE stakes (
  id SERIAL PRIMARY KEY,
  market_id TEXT NOT NULL,
  user TEXT NOT NULL,
  outcome_index INT NOT NULL DEFAULT 0,
  amount FLOAT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
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

**Five core functions:**
1. `stake()` — Stake GEN tokens on a market outcome (auto-registers market)
2. `register_market()` — Pre-register a market without staking
3. `resolve_market()` — AI determines the actual outcome based on evidence
4. `dispute_resolution()` — Challenge a resolution; AI reviews and makes final judgment
5. `claim_winnings()` — Claim winnings after dispute period expires

**Storage keys (critical):**
```python
_stake_key(market_id, user, outcome_index) = f"{market_id}:{user.as_hex}:{int(outcome_index)}"
_pool_key(market_id, outcome_index) = f"{market_id}:{int(outcome_index)}"
```
Output: Always write back mutated Market objects: `self.markets[market_id] = market`

**Network:** GenLayer Studio (Chain ID 61999)
**Payment:** native GEN tokens via `value: BigInt(amountWei)`

### GenLayer Contract State

```python
@allow_storage
@dataclass
class Market:
    market_id, question, outcomes, outcome_count, end_date
    is_active, is_resolved, resolved_outcome_index, total_pool
    resolution_reasoning, resolved_at, dispute_deadline

@allow_storage
@dataclass
class Stake:
    user, outcome_index, amount, claimed

@allow_storage
@dataclass
class DisputeRecord:
    market_id, challenger, proposed_outcome_index
    evidence_urls, reasoning, is_valid, reviewed
    fee_held, judgment_reasoning
```

### View Functions (all return JSON strings via json.dumps)

| Function | Args | Returns |
|----------|------|---------|
| `get_market` | `(market_id)` | `Market` JSON or null |
| `get_all_pools` | `(market_id)` | `[{outcome_index, amount}]` |
| `get_stake` | `(market_id, user_hex, outcome_index)` | `{exists, amount, claimed}` |
| `get_user_stakes` | `(market_id, user_hex)` | `[{market_id, user, outcome_index, amount, claimed}]` |
| `get_dispute` | `(market_id, challenger_hex)` | `DisputeRecord` JSON or null |
| `get_dispute_count` | `()` | `u256` |
| `get_contract_balance` | `()` | `u256` |
| `get_min_stake` | `()` | `u256` |
| `get_min_dispute_fee` | `()` | `u256` |

### Frontend Patterns

**GenLayer writeContract + polling (SDK-native):**
```typescript
const receipt = await client.waitForTransactionReceipt({
  hash: txHash,
  status: 'FINALIZED',
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

**Reading JSON-string view returns:**
```typescript
const jsonStr = typeof raw === 'string' ? raw : String(raw ?? 'null');
const parsed = JSON.parse(jsonStr);
```

### Design System
- Apple Design System colors, typography, spacing
- CSS custom properties in `index.css`
- Component styles in `App.css`
- No external UI library — pure custom CSS

## Known Bugs (Fixed)

1. **Missing `self.markets[market_id] = market` write-back**: TreeMap.get returns a copy of stored objects. Mutations to fields (e.g. `market.total_pool += amount`) are lost unless explicitly written back. Fixed in `stake()`, `resolve_market()`, `dispute_resolution()`.

## Code Quality Standards

1. **TypeScript Strict:** Minimize `any`, prefer explicit interfaces
2. **Error Handling:** All async operations wrapped in try/catch
3. **Effect Cleanup:** Use cancellation flags for async effects
4. **Performance:** Keep console.log out of production builds
5. **Security:** No secrets in code, input validation, sanitized outputs

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| VITE_WALLETCONNECT_PROJECT_ID | Yes | WalletConnect project ID |
| VITE_SUPABASE_URL | Yes | Supabase project URL |
| VITE_SUPABASE_ANON_KEY | Yes | Supabase anon key |
| VITE_GENLAYER_RPC | No | GenLayer RPC endpoint (default: https://studio.genlayer.com/api) |
| VITE_GENLAYER_CONTRACT | Yes | Deployed PredictMarket address |

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

**Markets not loading:**
- Check Supabase connection (URL and anon key in `.env`)
- Polymarket API may be rate-limited; Supabase cache provides fallback

**Stakes show wrong pool distribution:**
- The deployed contract may need redeployment with Market object write-back fix

## External Resources

- [Polymarket API Docs](https://polymarket.com/)
- [GenLayer Full Docs](https://docs.genlayer.com/full-documentation.txt)
- [GenLayer JS SDK API](https://sdk.genlayer.com/main/_static/ai/api.txt)
- [GenLayer Studio](https://studio.genlayer.com)
- [Supabase Docs](https://supabase.com/docs)
