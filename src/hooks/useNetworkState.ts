import { useState, useEffect, useCallback } from 'react'
import { useChainId } from 'wagmi'
import { isOnGenLayerNetwork, switchToGenLayerNetwork } from '../lib/genlayer/client'

const GENLAYER_CHAIN_ID = 61999

export type NetworkTarget = 'genlayer' | 'wrong' | null

export interface NetworkState {
  current: NetworkTarget
  isChecking: boolean
  isSwitching: boolean
  switchToGenLayer: () => Promise<void>
}

export function useNetworkState(): NetworkState {
  const wagmiChainId = useChainId()
  const [current, setCurrent] = useState<NetworkTarget>(null)
  const [isChecking, setIsChecking] = useState(true)
  const [isSwitching, setIsSwitching] = useState(false)

  useEffect(() => {
    setIsChecking(true)

    if (wagmiChainId === GENLAYER_CHAIN_ID) {
      setCurrent('genlayer')
      setIsChecking(false)
      return
    }

    if (wagmiChainId && wagmiChainId !== 0) {
      setCurrent('wrong')
      setIsChecking(false)
      return
    }

    const checkAsync = async () => {
      try {
        const onGenLayer = await isOnGenLayerNetwork()
        setCurrent(onGenLayer ? 'genlayer' : 'wrong')
      } catch {
        setCurrent('wrong')
      } finally {
        setIsChecking(false)
      }
    }

    const timer = setTimeout(checkAsync, 300)
    return () => clearTimeout(timer)
  }, [wagmiChainId])

  const switchToGenLayerWrapped = useCallback(async () => {
    if (isSwitching) return
    setIsSwitching(true)
    try {
      await switchToGenLayerNetwork()
      setCurrent('genlayer')
    } finally {
      setIsSwitching(false)
    }
  }, [isSwitching])

  return {
    current,
    isChecking,
    isSwitching,
    switchToGenLayer: switchToGenLayerWrapped,
  }
}
