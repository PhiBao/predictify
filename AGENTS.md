# Agent Instructions — Predict.fun GenLayer Edition

## Project Overview

This is a React 19 + TypeScript + Vite prediction market DApp on BNB Chain, upgraded with:
1. **GenLayer AI market analysis** via real deployed Intelligent Contract
2. **Apple-inspired design system** with glass navigation and cinematic sections
3. **Security-hardened codebase** following audit best practices

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
    AnalyzeModal.tsx      # GenLayer AI analysis with real contract calls
    MarketCard.tsx        # Market card + "Analyze with GenLayer" button
    MarketsList.tsx       # Market grid with skeleton loading
    TradeModal.tsx        # Buy/sell order interface
    SellModal.tsx         # Sell position modal
    UserPositions.tsx     # Portfolio + claim winnings
    WalletConnect.tsx     # RainbowKit wallet button
    Toast.tsx             # Notification system
    MarketSkeleton.tsx    # Shimmer loading skeletons
    ScrollToTop.tsx       # Floating scroll-to-top
  contexts/
    ToastContext.tsx      # Global toast notifications
  hooks/
    usePredictSDK.ts      # OrderBuilder SDK initialization
    useGenLayer.ts        # GenLayer analysis state management
  lib/genlayer/
    client.ts             # GenLayer client + MetaMask network helpers
    WalletProvider.tsx    # GenLayer wallet React context
  services/
    predictAPI.ts         # Predict.fun REST API client
    genlayer.ts           # REAL GenLayer contract service (write + poll)
  types/
    predict.ts            # TypeScript definitions
  config/
    wagmi.ts              # Wagmi + RainbowKit config (BNB Chain)
  App.tsx               # Main app with Apple nav + hero + features
  App.css               # Apple Design System styles
  index.css             # Global design tokens
  main.tsx              # Entry point

contracts/
  MarketAnalyzer.py     # GenLayer Intelligent Contract (deploy to Studio)
```

## Key Technical Details

### Predict.fun SDK
- Uses `@predictdotfun/sdk` OrderBuilder for order creation
- BNB Chain Mainnet (`ChainId.BnbMainnet`)
- Requires JWT authentication for order submission
- Handles both standard and NegRisk markets
- Newer helpers available: `setApprovals()`, `redeemPositions()`, `mergePositions()`

### GenLayer Integration
- `genlayer-js` SDK for blockchain interactions
- Configured for `studionet` by default
- **REAL contract calls** — no simulation
- Contract: `contracts/MarketAnalyzer.py` (deploy manually to Studio)
- Payment: native GEN via `value: BigInt(amountWei)`
- Transaction polling until `ACCEPTED` or `FINALIZED`
- MetaMask must be on GenLayer network (Chain ID 61999)

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
    key_factors: DynArray[str]
    risk_level: str
    recommended_action: str
    timestamp: str
    analyst: Address

class MarketAnalyzer(gl.Contract):
    analyses: TreeMap[u256, AnalysisResult]
    analysis_count: u256
    min_fee: u256

    def __init__(self):
        self.analysis_count = u256(0)
        self.min_fee = u256(1000000000000000000)  # 1 GEN

    @gl.public.write.payable
    def analyze_market(self, market_question: str, market_description: str, outcome_names: DynArray[str]) -> AnalysisResult:
        fee = gl.message.value
        if fee < self.min_fee:
            raise gl.vm.UserError("Insufficient fee")

        def leader_fn():
            return gl.nondet.exec_prompt(prompt, response_format="json")

        def validator_fn(leader_res):
            # Compare sentiment, risk_level, confidence±10
            return True  # or False

        result = gl.vm.run_nondet_unsafe(leader_fn, validator_fn)
        return result
```

**Critical v0.1.x vs v0.3.0 differences:**
- `from genlayer import *` (not `import genlayer as gl` + `from genlayer.types import *`)
- `gl.Contract` (not `gl.contract.Contract`)
- `@allow_storage` (not `gl.storage.allow`)
- `TreeMap`, `DynArray`, `u256`, `Address` available via star import
- `gl.vm.UserError`, `gl.vm.run_nondet_unsafe`, `gl.nondet.exec_prompt` all work on Studio

### Frontend Patterns

**GenLayer writeContract + polling:**
```typescript
const txHash = await client.writeContract({
  address: contractAddress,
  functionName: 'analyze_market',
  args: [question, description, outcomes],
  value: feeWei,
});

const tx = await pollTransaction(txHash);
// pollTransaction loops getTransaction() until status is ACCEPTED/FINALIZED
```

**readContract Map conversion:**
```typescript
const result = await client.readContract({ address, functionName, args: [] });
// result is a JS Map — convert to plain object:
const obj: Record<string, unknown> = {};
result.forEach((value, key) => { obj[key] = value; });
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
| VITE_API_KEY | Yes | Predict.fun API key |
| VITE_GENLAYER_RPC | No | GenLayer RPC endpoint |
| VITE_GENLAYER_ANALYSIS_CONTRACT | Yes | Deployed MarketAnalyzer address |

## Deploying the GenLayer Contract

1. Open [GenLayer Studio](https://studio.genlayer.com)
2. Create new contract → paste `contracts/MarketAnalyzer.py`
3. Deploy → copy contract address
4. Add to `.env`: `VITE_GENLAYER_ANALYSIS_CONTRACT=0x...`
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
--radius-md: 8px
--radius-pill: 980px
```

## Troubleshooting

**Build fails:**
- Check Node.js version (18+)
- Run `npm install` to ensure all deps

**Wallet won't connect (BNB):**
- Verify BNB Chain network (Chain ID 56)
- Check WalletConnect project ID

**GenLayer analysis fails:**
- Ensure MetaMask is connected to GenLayer Studio network (Chain ID 61999)
- Check GEN balance (get from Studio faucet)
- Verify contract address is set in `.env`
- Check browser console for specific error

## External Resources

- [Predict.fun Docs](https://dev.predict.fun)
- [Predict SDK README](https://github.com/PredictDotFun/sdk/blob/main/README.md)
- [GenLayer Full Docs](https://docs.genlayer.com/full-documentation.txt)
- [GenLayer JS SDK API](https://sdk.genlayer.com/main/_static/ai/api.txt)
- [Gotham Court Reference](https://github.com/PhiBao/gotham-court/blob/main/CLAUDE.md)
