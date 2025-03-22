// src/services/wargaming/client.ts
import { Config } from '../../utils/config.ts';
import { Logger } from '../../utils/logger.ts';

/**
 * Wargaming API Client class for making API requests
 */
export class WargamingApiClient {
  private apiKey: string;
  private region: string;
  private apiBase: string;
  
  /**
   * Create a new Wargaming API client
   * @param region API region (na, eu, asia, ru)
   */
  constructor(region?: string) {
    this.apiKey = Config.wargaming.apiKey || '';
    this.region = region || Config.wargaming.region || 'na';
    
    // Determine API base URL from region
    const apiBases: Record<string, string> = {
      na: "https://api.worldofwarships.com/wows",
      eu: "https://api.worldofwarships.eu/wows",
      asia: "https://api.worldofwarships.asia/wows",
      ru: "https://api.worldofwarships.ru/wows"
    };
    
    this.apiBase = apiBases[this.region] || apiBases.na;
    
    if (!this.apiKey) {
      Logger.warn('No WG_API_KEY provided in environment variables');
    }
  }
  
  /**
   * Make a request to the Wargaming API
   * @param endpoint API endpoint (without leading slash)
   * @param params Request parameters
   * @returns API response data
   */
  async request<T>(endpoint: string, params: Record<string, any> = {}): Promise<T> {
    // Add API key to params
    const requestParams = {
      application_id: this.apiKey,
      ...params
    };
    
    // Build URL with query parameters
    const queryString = Object.entries(requestParams)
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
      .join('&');
    
    const url = `${this.apiBase}/${endpoint}/?${queryString}`;
    
    Logger.debug(`Making API request to: ${url}`);
    
    try {
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`API responded with status: ${response.status}`);
      }
      
      const data = await response.json() as { status: string; error?: { message: string }; data: T };
      
      if (data.status !== "ok") {
        throw new Error(`API error: ${data.error?.message || 'Unknown error'}`);
      }
      
      return data.data;
    } catch (error) {
      Logger.error(`API request failed: ${endpoint}`, error);
      throw error;
    }
  }
  
  /**
   * Clan Battles API - requires authentication cookies
   */
  async getClanBattles(team: 1 | 2 = 1): Promise<unknown> {
    const url = `https://clans.worldofwarships.com/api/ladder/battles/?team=${team}`;
    const cookies = Config.wargaming.cookies;
    
    if (!cookies) {
      throw new Error('No WOWS_COOKIES provided in environment variables');
    }
    
    try {
      const response = await fetch(url, {
        headers: {
          'Cookie': cookies,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
        }
      });
      
      if (!response.ok) {
        throw new Error(`API responded with status: ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      Logger.error('Failed to fetch clan battles data', error);
      throw error;
    }
  }
  
  /**
   * Find player by account name
   * @param username Player username to search for
   */
  async findPlayerByName(username: string): Promise<any[]> {
    return this.request<any[]>('account/list', { search: username });
  }
  
  /**
   * Get player details by account ID
   * @param accountId Player account ID
   */
  async getPlayerById(accountId: string): Promise<any> {
    const data = await this.request<Record<string, any>>('account/info', { account_id: accountId });
    return data[accountId];
  }
  
  /**
   * Get player's ships statistics
   * @param accountId Player account ID
   */
  async getPlayerShips(accountId: string): Promise<any[]> {
    const data = await this.request<Record<string, any[]>>('ships/stats', { account_id: accountId });
    return data[accountId] || [];
  }
  
  /**
   * Get ship details from encyclopedia
   * @param shipId Ship ID
   */
  async getShipInfo(shipId: string): Promise<any> {
    const data = await this.request<Record<string, any>>('encyclopedia/ships', { ship_id: shipId });
    return data[shipId];
  }
}

// Export singleton instance for convenience
export const wgApi = new WargamingApiClient();