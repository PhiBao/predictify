import { useState, useEffect, useCallback } from 'react';
import { useChainId } from 'wagmi';
import { isOnGenLayerNetwork, switchToGenLayerNetwork, switchToBSC } from '../lib/genlayer/client';

const GENLAYER_CHAIN_ID = 61999;
const BSC_CHAIN_ID = 56;

export type NetworkTarget = 'bnb' | 'genlayer' | null;

export interface NetworkState {
  /** Current detected network target */
  current: NetworkTarget;
  /** True while we're checking which network the wallet is on */
  isChecking: boolean;
  /** True while actively switching networks */
  isSwitching: boolean;
  /** Switch to GenLayer network */
  switchToGenLayer: () => Promise<void>;
  /** Switch to BNB Chain */
  switchToBSC: () => Promise<void>;
}

/**
 * Hook that tracks which network the user's wallet is connected to.
 * Uses wagmi's synchronous chainId for immediate UI feedback,
 * then verifies with an async check for edge cases.
 */
export function useNetworkState(): NetworkState {
  const wagmiChainId = useChainId();
  const [current, setCurrent] = useState<NetworkTarget>(null);
  const [isChecking, setIsChecking] = useState(true);
  const [isSwitching, setIsSwitching] = useState(false);

  // Map wagmi chainId to our network targets
  useEffect(() => {
    setIsChecking(true);

    // First, use wagmi's synchronous chainId for immediate feedback
    if (wagmiChainId === GENLAYER_CHAIN_ID) {
      setCurrent('genlayer');
      setIsChecking(false);
      return;
    }
    if (wagmiChainId === BSC_CHAIN_ID) {
      setCurrent('bnb');
      setIsChecking(false);
      return;
    }

    // If wagmi doesn't know the chain (e.g. custom network not in config),
    // fall back to checking the provider directly
    const checkAsync = async () => {
      try {
        const onGenLayer = await isOnGenLayerNetwork();
        setCurrent(onGenLayer ? 'genlayer' : 'bnb');
      } catch {
        setCurrent(null);
      } finally {
        setIsChecking(false);
      }
    };

    // Small delay to let wagmi settle
    const timer = setTimeout(checkAsync, 300);
    return () => clearTimeout(timer);
  }, [wagmiChainId]);

  const switchToGenLayerWrapped = useCallback(async () => {
    if (isSwitching) return;
    setIsSwitching(true);
    try {
      await switchToGenLayerNetwork();
      setCurrent('genlayer');
    } finally {
      setIsSwitching(false);
    }
  }, [isSwitching]);

  const switchToBSCWrapped = useCallback(async () => {
    if (isSwitching) return;
    setIsSwitching(true);
    try {
      await switchToBSC();
      setCurrent('bnb');
    } finally {
      setIsSwitching(false);
    }
  }, [isSwitching]);

  return {
    current,
    isChecking,
    isSwitching,
    switchToGenLayer: switchToGenLayerWrapped,
    switchToBSC: switchToBSCWrapped,
  };
}
