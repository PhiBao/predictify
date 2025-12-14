import { useState, useEffect } from 'react';
import { useAccount, useWalletClient } from 'wagmi';
import { OrderBuilder, ChainId } from '@predictdotfun/sdk';
import { BrowserProvider } from 'ethers';

export function usePredictSDK() {
  const { address, chainId } = useAccount();
  const { data: walletClient } = useWalletClient();
  const [orderBuilder, setOrderBuilder] = useState<OrderBuilder | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    async function initSDK() {
      if (!walletClient || !address) {
        setOrderBuilder(null);
        setIsReady(false);
        return;
      }

      try {
        // Create ethers provider from wagmi wallet client
        const provider = new BrowserProvider(walletClient as any);
        const signer = await provider.getSigner();

        // Initialize OrderBuilder with BNB mainnet
        const builder = await OrderBuilder.make(ChainId.BnbMainnet, signer);
        
        setOrderBuilder(builder);
        setIsReady(true);
      } catch (error) {
        console.error('Failed to initialize SDK:', error);
        setOrderBuilder(null);
        setIsReady(false);
      }
    }

    initSDK();
  }, [address, walletClient]);

  return {
    address,
    chainId,
    orderBuilder,
    isReady,
    walletClient,
  };
}
