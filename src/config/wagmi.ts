import { getDefaultConfig } from '@rainbow-me/rainbowkit'
import type { Chain } from 'viem'

const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID

const genlayerStudio: Chain = {
  id: 61999,
  name: 'GenLayer Studio',
  nativeCurrency: { name: 'GEN', symbol: 'GEN', decimals: 18 },
  rpcUrls: {
    default: { http: [import.meta.env.VITE_GENLAYER_RPC || 'https://studio.genlayer.com/api'] },
    public: { http: [import.meta.env.VITE_GENLAYER_RPC || 'https://studio.genlayer.com/api'] },
  },
}

export const config = getDefaultConfig({
  appName: 'Predictify',
  projectId: projectId || 'YOUR_WALLET_CONNECT_PROJECT_ID',
  chains: [genlayerStudio],
  ssr: false,
})
