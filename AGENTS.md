# Agent Instructions — Predict.fun GenLayer Edition

## Project Overview

This is a React 19 + TypeScript + Vite prediction market DApp on BNB Chain, upgraded with:
1. **GenLayer AI market analysis** via real deployed Intelligent Contract
2. **Apple-inspired design system** with glass navigation and cinematic sections
3. **Unified wallet** — single MetaMask handles both BNB Chain trading and GenLayer analysis
4. **Security-hardened codebase** following audit best practices

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
    MarketCard.tsx        # Market card with binary side-by-side outcomes
    GroupedMarketCard.tsx # Grouped card with internal scroll for rows
    MarketsList.tsx       # Market grid with Live/All filter + grouping
    MarketDetail.tsx      # Detail page with markdown, outcomes, GenLayer analysis
    MarketGroupDetail.tsx # Unified group detail page with all markets
    TradeModal.tsx        # Buy/sell order interface (Market/Limit)
    SellModal.tsx         # Sell position modal
    UserPositions.tsx     # Portfolio + claim winnings + dismiss resolved
    WalletConnect.tsx     # RainbowKit wallet button
    Toast.tsx             # Notification system
    MarketSkeleton.tsx    # Shimmer loading skeletons
    ScrollToTop.tsx       # Floating scroll-to-top
  contexts/
    ToastContext.tsx      # Global toast notifications
  hooks/
    usePredictSDK.ts      # OrderBuilder SDK initialization
    useGenLayer.ts        # GenLayer analysis state management
    useNetworkState.ts    # Unified BNB/GenLayer network detection + switching
  lib/genlayer/
    client.ts             # GenLayer client + MetaMask network helpers
  services/
    predictAPI.ts         # Predict.fun REST API client
    genlayer.ts           # REAL GenLayer contract service (write + poll + read)
  types/
    predict.ts            # TypeScript definitions + formatPriceLevel helper
  config/
    wagmi.ts              # Wagmi + RainbowKit config (BNB Chain only)
  App.tsx               # Routes, nav with network badge, hero, features
  App.css               # Apple Design System + detail page + card styles
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

### Unified Wallet + Network Switching

**One MetaMask wallet, two networks.** The app uses a single `useAccount()` from wagmi and switches networks via raw `window.ethereum.request()` calls:

```typescript
// hooks/useNetworkState.ts
const network = useNetworkState();
// network.current: 'bnb' | 'genlayer' | null
// network.isChecking: true while detecting
// network.isSwitching: true while switching
// network.switchToBSC(): Promise<void>
// network.switchToGenLayer(): Promise<void>
```

**Trade buttons auto-switch:** If user is on GenLayer and clicks a trade button, the app automatically switches to BNB Chain first, then opens the trade modal. No manual switching needed.

**Analysis buttons auto-switch:** If user is on BNB Chain and clicks "Analyze", the app shows a "Switch to GenLayer Studio" button.

**Navigation badge:** The top nav shows a purple pulsing dot for GenLayer or a gold dot for BNB Chain, so users always know which network they're on.

### GenLayer Integration
- `genlayer-js` SDK for blockchain interactions
- Configured for `studionet` by default
- **REAL contract calls** — no simulation
- Contract: `contracts/MarketAnalyzer.py` (deploy manually to Studio)
- Payment: native GEN via `value: BigInt(amountWei)`
- Transaction polling via SDK-native `client.waitForTransactionReceipt({ status: TransactionStatus.FINALIZED })`
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
    key_factors_json: str    # JSON string, NOT DynArray (avoids serialization issues)
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
    def analyze_market(self, market_question: str, market_description: str, outcome_names: DynArray[str]):
        fee = gl.message.value
        if fee < self.min_fee:
            raise gl.UserError("Insufficient fee")

        prompt = "..."

        def leader_fn():
            return gl.nondet.exec_prompt(prompt, response_format="json")

        def validator_fn(leader_res):
            # Compare sentiment, risk_level, confidence±10
            return True  # or False

        result = gl.vm.run_nondet_unsafe(leader_fn, validator_fn)

        # Store key_factors as JSON string to avoid DynArray issues
        factors = result.get("key_factors", [])
        key_factors_json = str(factors) if isinstance(factors, list) else '[]'

        analysis = AnalysisResult(
            sentiment=str(result.get("sentiment", "neutral")),
            confidence=u32(int(result.get("confidence", 50))),
            summary=str(result.get("summary", "")),
            key_factors_json=key_factors_json,
            risk_level=str(result.get("risk_level", "medium")),
            recommended_action=str(result.get("recommended_action", "")),
            timestamp=str(gl.message_raw.get("datetime", "")),
            analyst=gl.message.sender_address,
        )

        self.analysis_count = u256(int(self.analysis_count) + 1)
        self.analyses[self.analysis_count] = analysis

    @gl.public.view
    def get_analysis(self, analysis_id: u256):
        if analysis_id == u256(0) or analysis_id > self.analysis_count:
            raise gl.UserError("Analysis not found")
        a = self.analyses[analysis_id]
        return {
            "sentiment": a.sentiment,
            "confidence": int(a.confidence),
            "summary": a.summary,
            "key_factors": a.key_factors_json,
            "risk_level": a.risk_level,
            "recommended_action": a.recommended_action,
            "timestamp": a.timestamp,
            "analyst": a.analyst.as_hex,
        }
```

**Critical v0.1.x vs v0.3.0 differences:**
- `from genlayer import *` (not `import genlayer as gl` + `from genlayer.types import *`)
- `gl.Contract` (not `gl.contract.Contract`)
- `@allow_storage` (not `gl.storage.allow`)
- `gl.UserError` (not `gl.vm.UserError`)
- `TreeMap`, `DynArray`, `u256`, `Address` available via star import
- `gl.vm.run_nondet_unsafe`, `gl.nondet.exec_prompt` all work on Studio

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
// genlayer-js returns raw primitives for simple types, NOT { value: bigint }
function parseU256(raw: unknown): number {
  if (typeof raw === 'bigint') return Number(raw);
  if (typeof raw === 'number') return raw;
  if (typeof raw === 'string') return Number(raw);
  const obj = raw as { value?: bigint | number | string };
  return Number(obj.value ?? 0);
}
```

**Robust read-after-write (multiple candidate IDs):**
```typescript
// After tx finalization, read count again to know exact slot
const countAfter = parseU256(await client.readContract({...}));
// Try multiple IDs in order of likelihood, return first valid one
const candidateIds = [countAfter, countAfter - 1, countBefore + 1];
for (const id of candidateIds) {
  const result = await client.readContract({ functionName: 'get_analysis', args: [BigInt(id)] });
  const parsed = parseAnalysisResult(result);
  if (parsed.sentiment && parsed.sentiment !== 'neutral') return parsed;
  if (parsed.summary && parsed.summary.length > 10) return parsed;
}
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
- **Card features:** same height grid, staggered entrance animations, hover lift + shadow
- **Binary outcomes:** side-by-side grid layout for 2-option markets
- **Grouped markets:** internal scroll with custom thin scrollbar
- **Network-aware buttons:** amber border indicates auto-switch will happen on click

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
--radius-md: 12px
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
- If analysis returns old data: check `parseU256` is handling the return type correctly

**Trade button shows "Switch to BNB Chain" even after switching:**
- The button now auto-switches on click. If it still shows the message, `useNetworkState` may not have detected the switch yet. Wait 1-2 seconds for wagmi to update.

## External Resources

- [Predict.fun Docs](https://dev.predict.fun)
- [Predict SDK README](https://github.com/PredictDotFun/sdk/blob/main/README.md)
- [GenLayer Full Docs](https://docs.genlayer.com/full-documentation.txt)
- [GenLayer JS SDK API](https://sdk.genlayer.com/main/_static/ai/api.txt)
- [Gotham Court Reference](https://github.com/PhiBao/gotham-court/blob/main/CLAUDE.md)
