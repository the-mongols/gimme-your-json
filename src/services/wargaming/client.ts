// src/services/wargaming/client.ts
import { Config } from '../../utils/config.js';
import { Logger } from '../../utils/logger.js';
import type { ClanConfig } from '../../config/clans.js';

/**
 * Wargaming API Client class for making API requests
 */
export class WargamingApiClient {
  private apiKey: string;
  private region: string;
  private apiBase: string;
  private clan?: ClanConfig;
  
  /**
   * Create a new Wargaming API client
   * @param clan Optional clan configuration - if provided, will use clan-specific settings
   * @param region API region (na, eu, asia, ru) - overrides clan.region if provided
   */
  constructor(clan?: ClanConfig, region?: string) {
    this.apiKey = Config.wargaming.apiKey || '';
    this.clan = clan;
    
    // Use the following order for region: 
    // 1. Provided region parameter 
    // 2. Clan's region setting 
    // 3. Config default region
    this.region = region || clan?.region || Config.wargaming.region || 'na';
    
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
   * @param team Team number (1 or 2)
   * @returns Clan battles data
   */
  async getClanBattles(team: 1 | 2 = 1): Promise<unknown> {
    const url = `https://clans.worldofwarships.com/api/ladder/battles/?team=${team}`;
    
    // Use clan-specific cookies if available
    const cookies = this.clan?.cookies;
    
    if (!cookies) {
      throw new Error(`No cookies available for clan ${this.clan?.tag || 'unknown'}`);
    }
    
    try {
      Logger.debug(`Fetching clan battles for clan ${this.clan?.tag || 'unknown'}, team ${team}`);
      
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
      Logger.error(`Failed to fetch clan battles data for clan ${this.clan?.tag || 'unknown'}`, error);
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
  
  /**
   * Get clan details
   * @param clanId Clan ID
   */
  async getClanInfo(clanId: number): Promise<any> {
    const data = await this.request<Record<string, any>>('clans/info', { clan_id: clanId });
    return data[clanId.toString()];
  }
  
  /**
   * Search for clan by tag
   * @param clanTag Clan tag to search for
   */
  async findClanByTag(clanTag: string): Promise<any[]> {
    return this.request<any[]>('clans/list', { search: clanTag });
  }
}

/**
 * Create a WargamingApiClient instance for a specific clan
 * @param clanTag Clan tag (e.g., "PN31")
 * @returns API client for the specified clan
 */
export function getApiClientForClan(clanTag: string): WargamingApiClient {
  const clan = Object.values(Config.clans).find(c => c.tag === clanTag);
  return new WargamingApiClient(clan);
}

// Export singleton instance for convenience (uses default clan)
export const wgApi = new WargamingApiClient(Config.defaultClan);