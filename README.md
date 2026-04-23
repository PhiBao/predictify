# Predict.fun DApp — GenLayer AI Edition

[![BNB Chain](https://img.shields.io/badge/BNB%20Chain-Mainnet-yellow)](https://www.bnbchain.org)
[![React](https://img.shields.io/badge/React-19-blue)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue)](https://www.typescriptlang.org)
[![Vite](https://img.shields.io/badge/Vite-7-purple)](https://vitejs.dev)
[![GenLayer](https://img.shields.io/badge/GenLayer-AI%20Analysis-purple)](https://genlayer.com)

A production-grade decentralized prediction market application built on **BNB Chain**, upgraded with **GenLayer AI analysis** and an **Apple-inspired design system**.

> **Trade prediction markets. Analyze with AI. Own your positions.**

---

## Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [GenLayer Contract Deployment](#genlayer-contract-deployment)
- [Project Structure](#project-structure)
- [API Reference](#api-reference)
- [How to Use](#how-to-use)
- [Security](#security)
- [Deployment](#deployment)
- [Troubleshooting](#troubleshooting)
- [License](#license)

---

## Features

### Core Trading (Predict.fun)
- **Wallet Integration** — MetaMask, WalletConnect, Rainbow, Coinbase Wallet via RainbowKit
- **Market Discovery** — Browse active prediction markets with live data
- **Limit Orders** — Buy/sell shares at your price with full order lifecycle
- **Portfolio Management** — View positions, track P&L, redeem winnings
- **Smart Approvals** — Automatic ERC-20 and ERC-1155 token approvals via SDK helpers
- **NegRisk & Yield-Bearing** — Full support for advanced market types
- **Redeem Positions** — One-click redemption of winning positions via SDK helper

### GenLayer AI Analysis
- **Real Intelligent Contract** — Deployed GenLayer Python contract with native LLM access
- **Optimistic Democracy Consensus** — Multiple AI validators reach agreement on analysis
- **Structured Output** — Sentiment, confidence score, risk level, key factors, recommendations
- **Native GEN Payments** — Pay for analysis in GenLayer's native token
- **On-Chain History** — All analyses stored permanently on GenLayer with analyst attribution
- **MetaMask Integration** — Separate wallet connection for GenLayer studionet

### Design System
- **Apple-Inspired UI** — Minimal, premium aesthetic with cinematic section pacing
- **Glass Navigation** — Translucent blur nav bar (`backdrop-filter: blur(20px)`)
- **Typography** — Inter font with Apple-style optical sizing and negative tracking
- **Responsive** — Optimized from 320px mobile to 1440px+ desktop
- **Accessibility** — ARIA labels, focus rings, semantic HTML, reduced-motion support

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND (React 19)                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────────────┐ │
│  │  MarketsList │  │  TradeModal  │  │ AnalyzeModal │  │  UserPositions  │ │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └────────┬────────┘ │
│         │                 │                  │                    │          │
│  ┌──────▼───────┐  ┌──────▼───────┐  ┌──────▼───────┐  ┌────────▼────────┐ │
│  │ predictAPI   │  │ usePredictSDK│  │ useGenLayer  │  │  usePredictSDK  │ │
│  │ (REST)       │  │ (OrderBuilder│  │ (writeContract│  │  (redeemPositions│ │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └────────┬────────┘ │
│         │                 │                  │                    │          │
└─────────┼─────────────────┼──────────────────┼────────────────────┼──────────┘
          │                 │                  │                    │
          ▼                 ▼                  ▼                    ▼
   ┌─────────────┐   ┌─────────────┐   ┌─────────────┐   ┌─────────────┐
   │ predict.fun │   │ BNB Chain   │   │ GenLayer    │   │ BNB Chain   │
   │ REST API    │   │ Mainnet     │   │ Studionet   │   │ Mainnet     │
   │             │   │             │   │             │   │             │
   │ /markets    │   │ Conditional │   │ MarketAnaly-│   │ Conditional │
   │ /orders     │   │ Tokens      │   │ zer Contract│   │ Tokens      │
   │ /positions  │   │ CTF Exchange│   │ (Python IC) │   │ CTF Exchange│
   │ /auth       │   │ USDT        │   │             │   │ USDT        │
   └─────────────┘   └─────────────┘   └─────────────┘   └─────────────┘
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Framework** | React 19 + TypeScript 5.9 |
| **Build Tool** | Vite 7 |
| **Web3 (BNB)** | Wagmi 2 + RainbowKit 2 + Viem 2 |
| **Web3 (GenLayer)** | genlayer-js 1.1.2 |
| **SDK** | @predictdotfun/sdk 1.2.4 |
| **Ethers** | ethers v6 (peer dependency of Predict SDK) |
| **Styling** | Custom CSS (Apple Design System) |
| **State** | React Hooks + Context API |
| **Linting** | ESLint 9 + typescript-eslint |

---

## Prerequisites

- **Node.js** 18+ and npm
- **MetaMask** browser extension
- **BNB tokens** for gas fees on BNB Chain Mainnet
- **USDT on BNB Chain** for trading
- **GEN tokens on GenLayer** for AI analysis (get from [GenLayer Faucet](https://studio.genlayer.com))
- **Predict.fun API Key** (join [Discord](https://discord.gg/predictdotfun) and request in #api-access)

---

## Getting Started

### 1. Clone & Install

```bash
git clone https://github.com/PhiBao/predictify.git
cd predictify
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your credentials:

```env
# Required — Predict.fun
VITE_WALLETCONNECT_PROJECT_ID=your_walletconnect_project_id
VITE_API_KEY=your_predict_api_key

# Required — GenLayer AI Analysis
VITE_GENLAYER_RPC=https://studio.genlayer.com/api
VITE_GENLAYER_ANALYSIS_CONTRACT=0xYOUR_DEPLOYED_CONTRACT_ADDRESS
```

**Get credentials:**
- **WalletConnect Project ID**: [cloud.walletconnect.com](https://cloud.walletconnect.com)
- **Predict API Key**: Join [Discord](https://discord.gg/predictdotfun) → open support ticket
- **GenLayer Contract**: Deploy the included contract (see below)

### 3. Run Development Server

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173)

### 4. Build for Production

```bash
npm run build
npm run preview
```

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_WALLETCONNECT_PROJECT_ID` | **Yes** | WalletConnect Cloud project ID |
| `VITE_API_KEY` | **Yes** | Predict.fun REST API key |
| `VITE_GENLAYER_RPC` | No | GenLayer RPC endpoint (default: `https://studio.genlayer.com/api`) |
| `VITE_GENLAYER_ANALYSIS_CONTRACT` | **Yes** | Deployed MarketAnalyzer contract address |

---

## GenLayer Contract Deployment

The app includes a **real GenLayer Intelligent Contract** for AI market analysis.

### Contract: `contracts/MarketAnalyzer.py`

This contract uses **GenLayer v0.1.x syntax** (compatible with Studio):
1. Accepts native GEN payments (`@gl.public.write.payable`)
2. Uses `gl.nondet.exec_prompt()` for LLM market analysis
3. Runs `gl.vm.run_nondet_unsafe()` for Optimistic Democracy consensus
4. Stores results on-chain in `TreeMap`
5. Returns structured JSON with sentiment, confidence, risk, factors

### Deploy to GenLayer Studio

1. **Open [GenLayer Studio](https://studio.genlayer.com)**
2. **Create a new contract** and paste the contents of `contracts/MarketAnalyzer.py`
3. **Deploy** the contract — Studio will assign an address
4. **Copy the contract address** into your `.env`:
   ```env
   VITE_GENLAYER_ANALYSIS_CONTRACT=0x09c7fF6DbaF4dA1A826eCa3B2D46cF11Dab9f064
   ```
5. **Get GEN tokens** from the Studio faucet for testing

### Deploy via GenLayer CLI (Advanced)

```bash
# Install GenLayer CLI
npm install -g genlayer

# Login
genlayer login

# Select network
genlayer network
# → Choose studionet

# Deploy
genlayer deploy contracts/MarketAnalyzer.py
```

### Contract Methods

| Method | Type | Description |
|--------|------|-------------|
| `analyze_market(question, description, outcomes)` | `write.payable` | Submit market for AI analysis (costs GEN) |
| `get_analysis(id)` | `view` | Retrieve stored analysis by ID |
| `get_analysis_count()` | `view` | Total analyses performed |
| `get_min_fee()` | `view` | Current minimum fee in wei |
| `set_min_fee(new_fee)` | `write` | Update minimum fee |

### Analysis Result Structure

```json
{
  "sentiment": "bullish",
  "confidence": 75,
  "summary": "Market indicators suggest a favorable outcome...",
  "key_factors": ["Increasing social engagement", "Strong on-chain metrics"],
  "risk_level": "medium",
  "recommended_action": "Consider taking a position",
  "timestamp": "2026-04-24T12:00:00Z",
  "analyst": "0x..."
}
```

---

## Project Structure

```
predictify/
├── contracts/
│   └── MarketAnalyzer.py          # GenLayer Intelligent Contract
├── src/
│   ├── components/
│   │   ├── AnalyzeModal.tsx       # GenLayer AI analysis modal
│   │   ├── MarketCard.tsx         # Market card with analyze button
│   │   ├── MarketSkeleton.tsx     # Skeleton loading states
│   │   ├── MarketsList.tsx        # Market grid + fetch logic
│   │   ├── ScrollToTop.tsx        # Floating scroll-to-top button
│   │   ├── SellModal.tsx          # Sell position modal
│   │   ├── Toast.tsx              # Notification component
│   │   ├── TradeModal.tsx         # Buy/sell trade modal
│   │   ├── UserPositions.tsx      # Portfolio + claim winnings
│   │   └── WalletConnect.tsx      # RainbowKit connect button
│   ├── contexts/
│   │   └── ToastContext.tsx       # Global toast notifications
│   ├── hooks/
│   │   ├── useGenLayer.ts         # GenLayer analysis hook
│   │   └── usePredictSDK.ts       # OrderBuilder initialization
│   ├── lib/
│   │   └── genlayer/
│   │       ├── client.ts          # GenLayer client + MetaMask helpers
│   │       └── WalletProvider.tsx # GenLayer wallet React context
│   ├── services/
│   │   ├── genlayer.ts            # Real GenLayer contract service
│   │   └── predictAPI.ts          # Predict.fun REST API client
│   ├── types/
│   │   └── predict.ts             # TypeScript definitions
│   ├── config/
│   │   └── wagmi.ts               # Wagmi + RainbowKit configuration
│   ├── App.tsx                    # Main app shell
│   ├── App.css                    # Apple Design System styles
│   ├── index.css                  # Global design tokens
│   └── main.tsx                   # Entry point
├── .env.example                   # Environment template
├── vite.config.ts                 # Vite config with API proxy
└── README.md                      # This file
```

---

## API Reference

### Predict.fun REST API

Base URL (proxied via Vite): `/api` → `https://api.predict.fun/v1`

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/markets` | GET | API Key | List markets |
| `/markets/:id` | GET | API Key | Get market details |
| `/orderbook/:id` | GET | API Key | Get orderbook |
| `/positions` | GET | JWT | Get user positions |
| `/orders` | GET | JWT | Get user orders |
| `/orders` | POST | JWT | Create order |
| `/orders/cancel` | POST | JWT | Cancel orders |
| `/auth/message` | GET | API Key | Get auth message |
| `/auth` | POST | API Key | Get JWT token |

### Predict SDK (`@predictdotfun/sdk`)

```typescript
// Initialize (once per signer)
const orderBuilder = await OrderBuilder.make(ChainId.BnbMainnet, signer);

// Set all approvals
await orderBuilder.setApprovals();

// Calculate amounts
const amounts = orderBuilder.getLimitOrderAmounts({ side, pricePerShareWei, quantityWei });

// Build, sign, and hash order
const order = orderBuilder.buildOrder('LIMIT', { maker, signer, side, tokenId, makerAmount, takerAmount, nonce, feeRateBps });
const typedData = orderBuilder.buildTypedData(order, { isNegRisk, isYieldBearing });
const signedOrder = await orderBuilder.signTypedDataOrder(typedData);
const hash = orderBuilder.buildTypedDataHash(typedData);

// Redeem positions
await orderBuilder.redeemPositions({ conditionId, indexSet, isNegRisk, isYieldBearing });

// Merge positions
await orderBuilder.mergePositions({ conditionId, amount, isNegRisk, isYieldBearing });
```

### GenLayer JS SDK (`genlayer-js`)

```typescript
// Create client with MetaMask account
const client = createGenLayerClient(metaMaskAddress);

// Write to contract (sends tx, returns hash)
const txHash = await client.writeContract({
  address: contractAddress,
  functionName: 'analyze_market',
  args: [question, description, outcomes],
  value: feeWei,
});

// Poll for transaction status
const tx = await client.getTransaction({ hash: txHash });
// Status: PENDING → PROPOSING → COMMITTING → REVEALING → ACCEPTED → FINALIZED
```

---

## How to Use

### Trading

1. **Connect Wallet** — Click "Connect Wallet" in the top right
2. **Browse Markets** — Scroll to the Markets section
3. **Select Outcome** — Click any outcome button on a market card
4. **Set Price & Quantity** — Enter your desired price (0.01–0.99 USDT) and share count
5. **Approve & Submit** — The app auto-approves tokens and submits your order
6. **View Positions** — Go to "Your Positions" to track holdings

### GenLayer AI Analysis

1. **Find a Market** — Any market card has an "Analyze with GenLayer" button
2. **Connect GenLayer** — The modal will prompt you to connect MetaMask to GenLayer Studio
3. **Enter Fee** — Minimum 1 GEN (adjustable by contract owner)
4. **Submit** — The transaction is sent to GenLayer validators
5. **Wait for Consensus** — Leader proposes, validators verify, result is finalized
6. **Review Results** — Sentiment, confidence bar, key factors, risk level, recommendation

### Claiming Winnings

1. **Wait for Resolution** — Markets resolve when the outcome is known
2. **Go to Positions** — Winning positions show a green "Winner" badge
3. **Click Claim** — Uses SDK's `redeemPositions()` helper for one-click redemption

---

## Security

This codebase follows security best practices from [Nemesis Auditor](https://github.com/0xiehnnkta/nemesis-auditor) and [Pashov Audit Group](https://github.com/pashov/skills):

- **Input Validation** — All user inputs validated before use
- **Error Handling** — Comprehensive try/catch with meaningful messages
- **Type Safety** — Strict TypeScript, explicit interfaces, minimal `any`
- **Effect Cleanup** — Cancellation flags prevent race conditions in async effects
- **No Secrets in Code** — All sensitive config in `.env`
- **Sanitized Outputs** — No raw HTML injection, safe DOM operations

### Smart Contracts

- **ConditionalTokens**: `0x22DA1810B194ca018378464a58f6Ac2B10C9d244`
- **CTF Exchange**: `0x8BC070BEdAB741406F4B1Eb65A72bee27894B689`
- **NegRisk CTF Exchange**: `0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E`
- **USDT**: `0x55d398326f99059fF775485246999027B3197955`

---

## Deployment

### Vercel

1. Push to GitHub
2. Import in [Vercel](https://vercel.com)
3. Add environment variables:
   - `VITE_WALLETCONNECT_PROJECT_ID`
   - `VITE_API_KEY`
   - `VITE_GENLAYER_RPC`
   - `VITE_GENLAYER_ANALYSIS_CONTRACT`
4. Deploy

The `vercel.json` and `vite.config.ts` already include API proxy rewrites to avoid CORS.

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| **Build fails** | Check Node.js 18+. Run `npm install` |
| **Wallet won't connect (BNB)** | Verify you're on BNB Chain Mainnet (Chain ID 56) |
| **Wallet won't connect (GenLayer)** | Add GenLayer Studio network in MetaMask (Chain ID 61999, RPC: `https://studio.genlayer.com/api`) |
| **Order fails** | Ensure sufficient BNB for gas + USDT for trade. Check approvals succeeded |
| **GenLayer analysis fails** | Ensure wallet is connected to GenLayer network. Check GEN balance. Verify contract address is set |
| **Positions not showing** | Wait a few seconds after order confirmation. Refresh page |
| **CORS errors** | The dev server proxies `/api` to Predict.fun. In production, ensure Vercel rewrites are configured |

---

## Resources

- [Predict.fun](https://predict.fun)
- [Predict Docs](https://dev.predict.fun)
- [Predict TypeScript SDK](https://www.npmjs.com/package/@predictdotfun/sdk)
- [GenLayer Docs](https://docs.genlayer.com)
- [GenLayer JS SDK](https://docs.genlayer.com/api-references/genlayer-js)
- [GenLayer Python SDK API](https://sdk.genlayer.com/main/_static/ai/api.txt)
- [Gotham Court Reference](https://github.com/PhiBao/gotham-court/blob/main/CLAUDE.md)

---

## License

MIT

---

Made with precision for the prediction markets community.
