# Predict.fun Betting DApp

A decentralized prediction market application built on BNB Chain, allowing users to trade on prediction markets using their Web3 wallet.

![BNB Chain](https://img.shields.io/badge/BNB%20Chain-Mainnet-yellow)
![React](https://img.shields.io/badge/React-18.3.1-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-5.6.2-blue)
![Vite](https://img.shields.io/badge/Vite-7.2.7-purple)

## Features

✨ **Wallet Integration**
- Connect with MetaMask, WalletConnect, and other popular Web3 wallets
- Powered by RainbowKit for seamless wallet connection
- BNB Chain Mainnet support

📊 **Market Trading**
- Browse active prediction markets
- View market details, outcomes, and statistics
- Place buy orders with custom price and quantity
- Create sell orders with flexible percentage options (25%, 50%, 75%, 100%)

💼 **Portfolio Management**
- View all your active positions
- Track position values and average prices
- Manage and sell positions through an intuitive interface

🔐 **Smart Order System**
- Automatic token approvals (USDT and Conditional Tokens)
- JWT authentication for secure API access
- Support for both standard and NegRisk markets
- Real-time order status updates with toast notifications

## Tech Stack

- **Frontend:** React 18 + TypeScript + Vite
- **Web3:** Wagmi v3 + RainbowKit + Ethers v6
- **Blockchain:** BNB Chain Mainnet (Chain ID: 56)
- **SDK:** @predictdotfun/sdk v1.2.4
- **Styling:** Custom CSS with responsive design
- **State Management:** React Hooks + Context API

## Prerequisites

- Node.js 18+ and npm/yarn
- A Web3 wallet (MetaMask recommended)
- BNB tokens for gas fees
- USDT on BNB Chain for trading

## Getting Started

### 1. Clone the Repository

```bash
git clone https://github.com/yourusername/predict-dapp.git
cd predict-dapp
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

Create a `.env` file in the root directory:

```bash
cp .env.example .env
```

Edit `.env` and add your credentials:

```env
# Get from https://cloud.walletconnect.com
VITE_WALLETCONNECT_PROJECT_ID=your_project_id_here

# Predict.fun API configuration
VITE_API_URL=https://api.predict.fun
VITE_API_KEY=your_api_key_here
```

**Get your API Key:**
- Join Predict.fun Discord: https://discord.gg/predictfun
- Request API access in the #api-access channel

### 4. Run Development Server

```bash
npm run dev
```

Visit `http://localhost:5173` to see the app in action!

### 5. Build for Production

```bash
npm run build
```

The production-ready files will be in the `dist/` directory.

## Smart Contracts

The app interacts with these contracts on BNB Chain:

- **ConditionalTokens:** `0x22DA1810B194ca018378464a58f6Ac2B10C9d244`
- **CTF Exchange:** `0x8BC070BEdAB741406F4B1Eb65A72bee27894B689`
- **NegRisk CTF Exchange:** `0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E`
- **USDT:** `0x55d398326f99059fF775485246999027B3197955`

## How to Use

### Buying Shares

1. Connect your wallet using the "Connect Wallet" button
2. Browse available markets
3. Click "Trade" on your desired market outcome
4. Select "BUY" and enter:
   - Price per share (0.01 - 0.99)
   - Quantity (number of shares)
5. Approve USDT spending (first time only)
6. Approve Conditional Tokens (first time only)
7. Sign and submit your order
8. Wait for order confirmation

### Selling Shares

1. Go to "Your Positions" section
2. Click "Sell Position" on the position you want to sell
3. Choose the amount to sell (25%, 50%, 75%, or 100%)
4. Set your desired sell price
5. Review the order summary
6. Sign and submit the sell order

## Project Structure

```
src/
├── components/          # React components
│   ├── MarketsList.tsx  # Market browsing and display
│   ├── TradeModal.tsx   # Buy order interface
│   ├── SellModal.tsx    # Sell order interface
│   ├── UserPositions.tsx # Portfolio view
│   └── Toast.tsx        # Notification system
├── contexts/            # React contexts
│   └── ToastContext.tsx # Global toast notifications
├── hooks/               # Custom React hooks
│   └── usePredictSDK.ts # OrderBuilder SDK integration
├── services/            # API services
│   └── predictAPI.ts    # Predict.fun API client
├── types/               # TypeScript types
│   └── predict.ts       # Type definitions
├── styles/              # CSS styles
│   └── Toast.css        # Toast notification styles
├── App.tsx              # Main app component
├── App.css              # Global styles
└── main.tsx             # App entry point
```

## Deployment

### Deploy to Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/yourusername/predict-dapp)

1. Push your code to GitHub
2. Import the project in Vercel
3. Add environment variables:
   - `VITE_WALLETCONNECT_PROJECT_ID`
   - `VITE_API_KEY`
   - `VITE_API_URL`
4. Deploy!

### Environment Variables for Production

Make sure to set these in your Vercel project settings:

```env
VITE_WALLETCONNECT_PROJECT_ID=your_project_id
VITE_API_URL=https://api.predict.fun
VITE_API_KEY=your_api_key
```

## Key Features Explained

### Automatic Approvals

The app automatically checks if token approvals are needed and requests them:
- **USDT Approval:** Required for buying shares
- **Conditional Token Approval:** Required for creating orders

### NegRisk Market Support

The app detects NegRisk markets and routes approvals to the correct exchange contract automatically.

### Toast Notifications

Real-time feedback for all actions:
- ✅ Success: Green notifications
- ❌ Error: Red notifications
- ℹ️ Info: Blue notifications
- ⚠️ Warning: Yellow notifications

### Price Validation

- Buy/Sell prices must be between $0.01 and $0.99
- Automatic Wei conversion for blockchain transactions
- Prevents invalid orders from being submitted

## Troubleshooting

**Wallet won't connect:**
- Make sure you're on BNB Chain (Chain ID: 56)
- Check if your wallet is unlocked
- Try refreshing the page

**Order fails:**
- Ensure you have enough BNB for gas fees
- Verify you have sufficient USDT balance
- Check that approvals were successful

**Positions not showing:**
- Wait a few seconds after order confirmation
- Refresh the page
- Check your wallet address is correct

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License.

## Resources

- **Predict.fun Website:** https://predict.fun
- **Documentation:** https://docs.predict.fun
- **Discord:** https://discord.gg/predictfun
- **Twitter:** https://twitter.com/predictdotfun
- **BNB Chain:** https://www.bnbchain.org

## Acknowledgments

- Built with [Predict.fun SDK](https://www.npmjs.com/package/@predictdotfun/sdk)
- Wallet integration by [RainbowKit](https://www.rainbowkit.com/)
- Web3 functionality by [Wagmi](https://wagmi.sh/)

---

Made with ❤️ for the prediction markets community
