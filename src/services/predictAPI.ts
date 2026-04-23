// Always use /api proxy for both dev and production to avoid CORS
const API_BASE_URL = '/api';
const API_KEY = import.meta.env.VITE_API_KEY;

export interface FetchOptions extends RequestInit {
  headers?: Record<string, string>;
}

export class PredictAPI {
  private baseUrl: string;
  private apiKey?: string;
  private jwtToken?: string;

  constructor(apiKey?: string, jwtToken?: string) {
    this.baseUrl = API_BASE_URL;
    this.apiKey = apiKey || API_KEY;
    this.jwtToken = jwtToken;
  }

  setJWT(token: string): void {
    this.jwtToken = token;
  }

  private async fetchAPI<T>(endpoint: string, options: FetchOptions = {}): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.apiKey) {
      headers['x-api-key'] = this.apiKey;
    }

    if (this.jwtToken) {
      headers['Authorization'] = `Bearer ${this.jwtToken}`;
    }

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers: {
        ...headers,
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      try {
        const errorJson = JSON.parse(errorText);
        console.error('API Error Details:', errorJson);
      } catch {
        console.error('API Error (non-JSON):', errorText);
      }
      throw new Error(`API Error (${response.status}): ${response.statusText}${errorText ? ' - ' + errorText : ''}`);
    }

    return response.json() as Promise<T>;
  }

  async getMarkets(params?: {
    category?: string;
    status?: string;
    limit?: number;
    offset?: number;
  }) {
    const queryParams = new URLSearchParams();
    if (params?.category) queryParams.set('category', params.category);
    if (params?.status) queryParams.set('status', params.status);
    if (params?.limit) queryParams.set('limit', params.limit.toString());
    if (params?.offset) queryParams.set('offset', params.offset.toString());

    const query = queryParams.toString();
    return this.fetchAPI<Record<string, unknown>>(`/markets${query ? `?${query}` : ''}`);
  }

  async getMarket(marketId: string) {
    return this.fetchAPI<Record<string, unknown>>(`/markets/${marketId}`);
  }

  async getOrderbook(marketId: string) {
    return this.fetchAPI<Record<string, unknown>>(`/orderbook/${marketId}`);
  }

  async getPositions(address: string) {
    return this.fetchAPI<Record<string, unknown>>(`/positions?address=${encodeURIComponent(address)}`);
  }

  async getOrders(address: string) {
    return this.fetchAPI<Record<string, unknown>>(`/orders?maker=${encodeURIComponent(address)}`);
  }

  async createOrder(orderData: unknown) {
    return this.fetchAPI<Record<string, unknown>>('/orders', {
      method: 'POST',
      body: JSON.stringify(orderData),
    });
  }

  async cancelOrders(orderIds: string[]) {
    return this.fetchAPI<Record<string, unknown>>('/orders/cancel', {
      method: 'POST',
      body: JSON.stringify({ orderIds }),
    });
  }

  async getCategories() {
    return this.fetchAPI<Record<string, unknown>>('/categories');
  }

  // Authentication methods
  async getAuthMessage(address: string) {
    return this.fetchAPI<{ message: string; data?: { message: string } }>(`/auth/message?address=${encodeURIComponent(address)}`);
  }

  async getJWT(address: string, signature: string, message: string) {
    return this.fetchAPI<{ token?: string; data?: { token: string } }>('/auth', {
      method: 'POST',
      body: JSON.stringify({ signer: address, signature, message }),
    });
  }
}

export const predictAPI = new PredictAPI();
