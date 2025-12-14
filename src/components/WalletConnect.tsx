import { ConnectButton } from '@rainbow-me/rainbowkit';

export function WalletConnect() {
  return (
    <div className="wallet-connect">
      <ConnectButton 
        showBalance={false}
        chainStatus="icon"
      />
    </div>
  );
}
