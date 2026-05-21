# Predictify — GenLayer Staking Prediction Market

[![React](https://img.shields.io/badge/React-19-blue)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue)](https://www.typescriptlang.org)
[![Vite](https://img.shields.io/badge/Vite-7-purple)](https://vitejs.dev)
[![GenLayer](https://img.shields.io/badge/GenLayer-Intelligent%20Contracts-purple)](https://genlayer.com)

A prediction market DApp where users stake GEN tokens on market outcomes, resolve via AI consensus, and dispute with evidence — all on-chain through a single GenLayer Intelligent Contract.

> **Stake. Resolve. Dispute. Claim. All on GenLayer.**

---

## Features

- **Polymarket Data** — Markets fetched from Polymarket Gamma API, cached in Supabase
- **Staking** — Stake GEN tokens on any market outcome; pool updates on-chain
- **AI Resolution** — GenLayer AI determines outcomes via optimistic democracy consensus
- **Dispute Mechanism** — Losing-side stakers can challenge within 24h; AI re-evaluates
- **Automated Claims** — Winners claim proportional share of the total pool
- **Apple Design System** — Glass nav, cinematic sections, pure custom CSS
- **Unified Wallet** — MetaMask for all GenLayer interactions

---

## Architecture

```
Polymarket Gamma API → Supabase (cache/index) → Frontend
                                                    ↓
                                          GenLayer PredictMarket Contract
                                        (Stake → Resolve → Dispute → Claim)
```

### Three Layers

| Layer | Technology | Role |
|-------|-----------|------|
| **Data** | Polymarket API + Supabase | Market metadata, caching, offline fallback |
| **Frontend** | React 19 + TypeScript + Vite | UI, wallet connection, contract interaction |
| **Contract** | GenLayer Python IC | Pool management, AI resolution, dispute review, payout |

---

## How It Works

1. **Stake** — User stakes GEN on an outcome. Contract auto-registers the market and updates pool totals.
2. **Resolve** — Anyone triggers resolution. GenLayer validators run AI, agree on outcome, store on-chain.
3. **Dispute** — Losing stakers challenge within 24h. AI reviews evidence, makes final judgment.
4. **Claim** — Winning stakers claim proportional share of total pool. Losers' stakes are redistributed.

---

## Prerequisites

- **Node.js** 18+ and npm
- **MetaMask** browser extension
- **GEN tokens** on GenLayer Studio (get from [faucet](https://studio.genlayer.com))
- **Deployed PredictMarket contract** on GenLayer Studio
- **Supabase project** (optional — for caching)

---

## Getting Started

```bash
git clone https://github.com/yourusername/predictify.git
cd predictify
npm install
cp .env.example .env
```

Edit `.env`:

```env
VITE_WALLETCONNECT_PROJECT_ID=your_walletconnect_project_id
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
VITE_GENLAYER_CONTRACT=0xYOUR_DEPLOYED_CONTRACT_ADDRESS
```

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173)

---

## GenLayer Contract

### `contracts/MarketResolver.py`

A single Python Intelligent Contract with five core functions:

| Function | Type | Description |
|----------|------|-------------|
| `stake(market_id, question, outcomes, end_date, outcome_index)` | `write.payable` | Stake GEN on an outcome (auto-registers market) |
| `register_market(market_id, question, outcomes, end_date)` | `write` | Pre-register a market without staking |
| `resolve_market(market_id, question, outcomes, end_date)` | `write` | AI determines the actual outcome |
| `dispute_resolution(market_id, evidence_urls, reasoning)` | `write.payable` | Challenge a resolution; AI reviews and makes final judgment |
| `claim_winnings(market_id)` | `write` | Claim winnings after dispute period expires |

### View Functions

| Function | Returns |
|----------|---------|
| `get_market(market_id)` | Market state JSON |
| `get_all_pools(market_id)` | Pool distribution `[{outcome_index, amount}]` |
| `get_user_stakes(market_id, user_hex)` | User's stakes with `claimed` status |
| `get_stake(market_id, user_hex, outcome_index)` | Single stake `{exists, amount, claimed}` |
| `get_dispute(market_id, challenger_hex)` | DisputeRecord with `judgment_reasoning` |
| `get_contract_balance()` | Contract GEN balance |
| `get_min_stake()` / `get_min_dispute_fee()` | Minimum amounts |

### Deploy

1. Open [GenLayer Studio](https://studio.genlayer.com)
2. Create new contract → paste `contracts/MarketResolver.py`
3. Deploy → copy address → set `VITE_GENLAYER_CONTRACT`
4. Get GEN from Studio faucet for staking

---

## Project Structure

```
src/
  components/         # UI components
    MarketCard.tsx        # Market card with outcome probabilities
    GroupedMarketCard.tsx # Grouped card with scrollable rows
    MarketsList.tsx       # Grid with filter tabs
    MarketDetail.tsx      # Detail page with resolution + dispute
    MarketGroupDetail.tsx # Unified group detail page
    ResolutionModal.tsx   # Trigger AI resolution
    DisputeModal.tsx      # Challenge resolution with evidence
    StakeModal.tsx        # Stake GEN on outcomes
    PortfolioPage.tsx     # Stakes + claimable winnings
    WalletConnect.tsx     # RainbowKit wallet button
  hooks/
    useGenLayer.ts        # Stake, resolve, dispute, claim state
    useNetworkState.ts    # Network detection + switching
  services/
    polymarketAPI.ts      # Polymarket Gamma API client
    supabase.ts           # Supabase market indexing
    genlayer.ts           # GenLayer contract service
  types/
    market.ts             # TypeScript definitions
  config/
    wagmi.ts              # Wagmi + RainbowKit config
  App.tsx               # Routes, nav, hero, features
  App.css               # Apple Design System styles
  index.css             # Design tokens

contracts/
  MarketResolver.py     # GenLayer Intelligent Contract

demo/
  demo-guide.md         # Recording script for video demo
```

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_WALLETCONNECT_PROJECT_ID` | Yes | WalletConnect Cloud project ID |
| `VITE_SUPABASE_URL` | Yes | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Yes | Supabase anon key |
| `VITE_GENLAYER_RPC` | No | GenLayer RPC (default: `https://studio.genlayer.com/api`) |
| `VITE_GENLAYER_CONTRACT` | Yes | Deployed PredictMarket address |

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| **Build fails** | Check Node.js 18+. Run `npm install` |
| **Wallet won't connect** | Verify MetaMask is unlocked. Check WalletConnect project ID |
| **GenLayer operations fail** | Ensure on GenLayer Studio network (Chain ID 61999). Check GEN balance. Verify contract address |
| **Markets not loading** | Check Supabase URL + anon key. Polymarket API may be rate-limited |
| **Pool distribution wrong** | Redeploy contract with latest `MarketResolver.py` (write-back fix) |

---

## Resources

- [GenLayer Docs](https://docs.genlayer.com)
- [GenLayer Studio](https://studio.genlayer.com)
- [Polymarket Gamma API](https://polymarket.com/)
- [GenLayer JS SDK](https://sdk.genlayer.com/main/_static/ai/api.txt)
- [Supabase Docs](https://supabase.com/docs)

---

## License

MIT
