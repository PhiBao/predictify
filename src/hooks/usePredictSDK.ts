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
    let cancelled = false;

    async function initSDK() {
      if (!walletClient || !address) {
        if (!cancelled) {
          setOrderBuilder(null);
          setIsReady(false);
        }
        return;
      }

      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const provider = new BrowserProvider(walletClient.transport as any);
        const signer = await provider.getSigner();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const builder = await OrderBuilder.make(ChainId.BnbMainnet, signer as any);

        if (!cancelled) {
          setOrderBuilder(builder);
          setIsReady(true);
        }
      } catch (error) {
        console.error('Failed to initialize SDK:', error);
        if (!cancelled) {
          setOrderBuilder(null);
          setIsReady(false);
        }
      }
    }

    initSDK();

    return () => {
      cancelled = true;
    };
  }, [address, walletClient]);

  return {
    address,
    chainId,
    orderBuilder,
    isReady,
    walletClient,
  };
}
