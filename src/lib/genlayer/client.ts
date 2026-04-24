import { createClient } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';

// GenLayer Network Configuration
export const GENLAYER_CHAIN_ID = 61999;
export const GENLAYER_CHAIN_ID_HEX = `0x${GENLAYER_CHAIN_ID.toString(16).toUpperCase()}`;

// BNB Chain Configuration
export const BSC_CHAIN_ID = 56;
export const BSC_CHAIN_ID_HEX = `0x${BSC_CHAIN_ID.toString(16).toUpperCase()}`;

export const GENLAYER_NETWORK = {
  chainId: GENLAYER_CHAIN_ID_HEX,
  chainName: 'GenLayer Studio',
  nativeCurrency: {
    name: 'GEN',
    symbol: 'GEN',
    decimals: 18,
  },
  rpcUrls: [import.meta.env.VITE_GENLAYER_RPC || 'https://studio.genlayer.com/api'],
  blockExplorerUrls: [],
};

export const BSC_NETWORK = {
  chainId: BSC_CHAIN_ID_HEX,
  chainName: 'BNB Chain Mainnet',
  nativeCurrency: {
    name: 'BNB',
    symbol: 'BNB',
    decimals: 18,
  },
  rpcUrls: ['https://bsc-dataseed.binance.org/'],
  blockExplorerUrls: ['https://bscscan.com/'],
};

export function getContractAddress(): string {
  return import.meta.env.VITE_GENLAYER_ANALYSIS_CONTRACT || '';
}

// --- MetaMask Network Helpers ---

interface EthereumProvider {
  isMetaMask?: boolean;
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
}

function getProvider(): EthereumProvider | null {
  if (typeof window === 'undefined') return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (window as any).ethereum || null;
}

export async function getCurrentChainId(): Promise<number | null> {
  const provider = getProvider();
  if (!provider) return null;
  try {
    const chainId = await provider.request({ method: 'eth_chainId' }) as string;
    return parseInt(chainId, 16);
  } catch {
    return null;
  }
}

export async function isOnGenLayerNetwork(): Promise<boolean> {
  const chainId = await getCurrentChainId();
  return chainId === GENLAYER_CHAIN_ID;
}

export async function isOnBSC(): Promise<boolean> {
  const chainId = await getCurrentChainId();
  return chainId === BSC_CHAIN_ID;
}

export async function addGenLayerNetwork(): Promise<void> {
  const provider = getProvider();
  if (!provider) throw new Error('MetaMask not available');
  await provider.request({
    method: 'wallet_addEthereumChain',
    params: [GENLAYER_NETWORK],
  });
}

export async function addBSCNetwork(): Promise<void> {
  const provider = getProvider();
  if (!provider) throw new Error('MetaMask not available');
  await provider.request({
    method: 'wallet_addEthereumChain',
    params: [BSC_NETWORK],
  });
}

/** Switch to GenLayer. If already on GenLayer, does nothing. */
export async function switchToGenLayerNetwork(): Promise<void> {
  const currentChain = await getCurrentChainId();
  if (currentChain === GENLAYER_CHAIN_ID) {
    return; // Already on GenLayer, nothing to do
  }

  const provider = getProvider();
  if (!provider) throw new Error('MetaMask not available');
  try {
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: GENLAYER_CHAIN_ID_HEX }],
    });
  } catch (error: unknown) {
    const err = error as { code?: number; message?: string };
    if (err.code === 4001) throw new Error('User rejected network switch');
    const needsAdd =
      err.code === 4902 ||
      /unrecognized chain id/i.test(err.message || '') ||
      /try adding the chain/i.test(err.message || '');
    if (needsAdd) {
      await addGenLayerNetwork();
    } else {
      throw new Error(`Failed to switch network: ${err.message}`);
    }
  }
}

/** Switch to BNB Chain. If already on BNB, does nothing. */
export async function switchToBSC(): Promise<void> {
  const currentChain = await getCurrentChainId();
  if (currentChain === BSC_CHAIN_ID) {
    return; // Already on BSC, nothing to do
  }

  const provider = getProvider();
  if (!provider) throw new Error('MetaMask not available');
  try {
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: BSC_CHAIN_ID_HEX }],
    });
  } catch (error: unknown) {
    const err = error as { code?: number; message?: string };
    if (err.code === 4001) throw new Error('User rejected network switch');
    const needsAdd =
      err.code === 4902 ||
      /unrecognized chain id/i.test(err.message || '') ||
      /try adding the chain/i.test(err.message || '');
    if (needsAdd) {
      await addBSCNetwork();
    } else {
      throw new Error(`Failed to switch network: ${err.message}`);
    }
  }
}

// --- GenLayer Client ---

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createGenLayerClient(address?: string): any {
  const config: { chain: typeof studionet; account?: `0x${string}` } = {
    chain: studionet,
  };
  if (address) {
    config.account = address as `0x${string}`;
  }
  return createClient(config);
}
