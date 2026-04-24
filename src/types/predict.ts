export interface PriceLevel {
  price: string;
  size: string;
}

export interface Outcome {
  id: string;
  name: string;
  index: number;
  indexSet: number;
  status: string | null;
  onChainId: string;
  /** API may return string or {price, size} object */
  bestBid?: string | PriceLevel;
  bestAsk?: string | PriceLevel;
}

/** Safely extract a display string from bestBid/bestAsk */
export function formatPriceLevel(value: string | PriceLevel | undefined): string {
  if (!value) return '';
  if (typeof value === 'string') return value;
  return value.price ?? '';
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
  conditionId?: string;
  condition?: { id: string };
  /** ISO 8601 timestamp when market closes / resolves */
  endTime?: string;
  /** Alternative field for close time from API */
  closesAt?: string;
  /** ISO 8601 timestamp when market was resolved */
  resolvedAt?: string;
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

export interface MarketAnalysis {
  sentiment: 'bullish' | 'bearish' | 'neutral';
  confidence: number;
  summary: string;
  keyFactors: string[];
  riskLevel: 'low' | 'medium' | 'high';
  recommendedAction: string;
  timestamp: string;
}

export interface APIResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
}

export interface AuthMessageResponse {
  message: string;
  data?: { message: string };
}

export interface JWTResponse {
  token?: string;
  data?: { token: string };
}
