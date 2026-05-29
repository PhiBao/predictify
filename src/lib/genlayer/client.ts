import { createClient } from 'genlayer-js'
import { studionet } from 'genlayer-js/chains'

export const GENLAYER_CHAIN_ID = 61999
export const GENLAYER_CHAIN_ID_HEX = `0x${GENLAYER_CHAIN_ID.toString(16).toUpperCase()}`

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
}

export function getContractAddress(): string {
  return import.meta.env.VITE_GENLAYER_CONTRACT || ''
}

interface EthereumProvider {
  isMetaMask?: boolean
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
}

function getProvider(): EthereumProvider | null {
  if (typeof window === 'undefined') return null
  return (window as unknown as { ethereum?: EthereumProvider }).ethereum || null
}

export async function getCurrentChainId(): Promise<number | null> {
  const provider = getProvider()
  if (!provider) return null
  try {
    const chainId = await provider.request({ method: 'eth_chainId' }) as string
    return parseInt(chainId, 16)
  } catch {
    return null
  }
}

export async function isOnGenLayerNetwork(): Promise<boolean> {
  const chainId = await getCurrentChainId()
  return chainId === GENLAYER_CHAIN_ID
}

export async function addGenLayerNetwork(): Promise<void> {
  const provider = getProvider()
  if (!provider) throw new Error('MetaMask not available')
  await provider.request({
    method: 'wallet_addEthereumChain',
    params: [GENLAYER_NETWORK],
  })
}

export async function switchToGenLayerNetwork(): Promise<void> {
  const currentChain = await getCurrentChainId()
  if (currentChain === GENLAYER_CHAIN_ID) return

  const provider = getProvider()
  if (!provider) throw new Error('MetaMask not available')
  try {
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: GENLAYER_CHAIN_ID_HEX }],
    })
  } catch (error: unknown) {
    const err = error as { code?: number; message?: string }
    if (err.code === 4001) throw new Error('User rejected network switch')
    const needsAdd =
      err.code === 4902 ||
      /unrecognized chain id/i.test(err.message || '') ||
      /try adding the chain/i.test(err.message || '')
    if (needsAdd) {
      await addGenLayerNetwork()
    } else {
      throw new Error(`Failed to switch network: ${err.message}`)
    }
  }
}

export function createGenLayerClient(address?: string) {
  const config: { chain: typeof studionet; account?: `0x${string}` } = {
    chain: studionet,
  }
  if (address) {
    config.account = address as `0x${string}`
  }
  return createClient(config)
}
