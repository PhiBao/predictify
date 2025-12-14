// In development, use proxy to avoid CORS. In production, use direct API URL
const API_BASE_URL = import.meta.env.DEV 
  ? '/api'  // Proxy through Vite dev server
  : (import.meta.env.VITE_API_URL || 'https://api.predict.fun');
const API_KEY = import.meta.env.VITE_API_KEY;

export class PredictAPI {
  private baseUrl: string;
  private apiKey?: string;
  private jwtToken?: string;

  constructor(apiKey?: string, jwtToken?: string) {
    this.baseUrl = API_BASE_URL;
    this.apiKey = apiKey || API_KEY;
    this.jwtToken = jwtToken;
  }

  setJWT(token: string) {
    this.jwtToken = token;
  }

  private async fetchAPI(endpoint: string, options: RequestInit = {}) {
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
        ...(options.headers as Record<string, string>),
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

    return response.json();
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
    return this.fetchAPI(`/markets${query ? `?${query}` : ''}`);
  }

  async getMarket(marketId: string) {
    return this.fetchAPI(`/markets/${marketId}`);
  }

  async getOrderbook(marketId: string) {
    return this.fetchAPI(`/orderbook/${marketId}`);
  }

  async getPositions(address: string) {
    return this.fetchAPI(`/positions?address=${address}`);
  }

  async getOrders(address: string) {
    return this.fetchAPI(`/orders?maker=${address}`);
  }

  async createOrder(orderData: any) {
    return this.fetchAPI('/orders', {
      method: 'POST',
      body: JSON.stringify(orderData),
    });
  }

  async cancelOrders(orderIds: string[]) {
    return this.fetchAPI('/orders/cancel', {
      method: 'POST',
      body: JSON.stringify({ orderIds }),
    });
  }

  async getCategories() {
    return this.fetchAPI('/categories');
  }

  // Authentication methods
  async getAuthMessage(address: string) {
    return this.fetchAPI(`/auth/message?address=${address}`);
  }

  async getJWT(address: string, signature: string, message: string) {
    return this.fetchAPI('/auth', {
      method: 'POST',
      body: JSON.stringify({ signer: address, signature, message }),
    });
  }
}

export const predictAPI = new PredictAPI();
