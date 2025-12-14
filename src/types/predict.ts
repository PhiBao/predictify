export interface Outcome {
  id: string;
  name: string;
  index: number;
  indexSet: number;
  status: string | null;
  onChainId: string;
  bestBid?: string;
  bestAsk?: string;
}

export interface Market {
  id: number;
  title: string;
  question: string;
  description: string;
  outcomes: Outcome[];
  status: string | null;
  imageUrl: string;
  createdAt: string;
  categorySlug: string;
  feeRateBps: number;
  isNegRisk: boolean;
  isYieldBearing: boolean;
}

export interface Position {
  id: string;
  marketId: string;
  outcome: string;
  outcomeIndex: number;
  outcomeId: string;
  shares: string;
  value: string;
}

export interface Order {
  id: string;
  marketId: string;
  side: 'BUY' | 'SELL';
  outcome: string;
  price: string;
  amount: string;
  status: string;
}
