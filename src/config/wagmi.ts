import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { bsc } from 'wagmi/chains';

const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID;

export const config = getDefaultConfig({
  appName: 'Predictify',
  projectId: projectId || 'YOUR_WALLET_CONNECT_PROJECT_ID',
  chains: [bsc],
  ssr: false,
});
