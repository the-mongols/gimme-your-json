// src/services/wargaming/client.ts
import { Config } from '../../utils/config.js';
import { Logger } from '../../utils/logger.js';
import { handleError, ErrorCode } from '../../utils/errors.js';
import type { ClanConfig } from '../../config/clans.js';
import type { ClanBattlesResponse } from '../../types/wowsAPI.js';

/**
 * Wargaming API Client class for making API requests
 */
export class WargamingApiClient {
  private apiKey: string;
  private region: string;
  private apiBase: string;
  private clan?: ClanConfig;
  private rateLimitDelay = 500; // ms between requests
  private lastRequestTime = 0;
  
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
    // Implement rate limiting
    await this.respectRateLimit();
    
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
      this.lastRequestTime = Date.now();
      
      if (!response.ok) {
        throw new Error(`API responded with status: ${response.status}`);
      }
      
      const data = await response.json() as { status: string; error?: { message: string; code?: number }; data: T };
      
      if (data.status !== "ok") {
        throw new Error(`API error: ${data.error?.message || 'Unknown error'}`);
      }
      
      return data.data;
    } catch (error) {
      throw handleError(`API request to ${endpoint} failed`, error, ErrorCode.API_REQUEST_FAILED);
    }
  }
  
  /**
   * Make a request to the WG API with automatic retry for rate limits
   * @param endpoint API endpoint
   * @param params Request parameters
   * @param retries Number of retries allowed
   * @returns API response data
   */
  async requestWithRetry<T>(endpoint: string, params: Record<string, any> = {}, retries = 3): Promise<T> {
    try {
      return await this.request<T>(endpoint, params);
    } catch (error) {
      // Check if error is rate limiting related (HTTP 429)
      if (
        error instanceof Error && 
        error.message.includes('status: 429') && 
        retries > 0
      ) {
        // Exponential backoff: wait longer for each retry
        const delay = Math.pow(2, 4 - retries) * 1000;
        Logger.warn(`Rate limited by WG API. Retrying in ${delay}ms (${retries} retries left)`);
        
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.requestWithRetry<T>(endpoint, params, retries - 1);
      }
      
      // For other errors, or if we've run out of retries, rethrow
      throw error;
    }
  }
  
  /**
   * Ensure we're respecting rate limits
   */
  private async respectRateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    if (timeSinceLastRequest < this.rateLimitDelay) {
      const delayNeeded = this.rateLimitDelay - timeSinceLastRequest;
      await new Promise(resolve => setTimeout(resolve, delayNeeded));
    }
  }
  
  /**
   * Clan Battles API - requires authentication cookies
   * @param team Team number (1 or 2)
   * @returns Clan battles data
   */
  async getClanBattles(team: 1 | 2 = 1): Promise<ClanBattlesResponse> {
    const url = `https://clans.worldofwarships.com/api/ladder/battles/?team=${team}`;
    
    // Use clan-specific cookies if available
    const cookies = this.clan?.cookies;
    
    if (!cookies) {
      throw handleError(
        `Cannot fetch clan battles data for ${this.clan?.tag || 'unknown'}`,
        'Missing authentication cookies',
        ErrorCode.API_AUTHENTICATION_FAILED,
        'Cannot access clan battles data: missing authentication'
      );
    }
    
    try {
      await this.respectRateLimit();
      Logger.debug(`Fetching clan battles for clan ${this.clan?.tag || 'unknown'}, team ${team}`);
      
      const response = await fetch(url, {
        headers: {
          'Cookie': cookies,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
        }
      });
      
      this.lastRequestTime = Date.now();
      
      if (!response.ok) {
        // Handle authentication errors specifically
        if (response.status === 401 || response.status === 403) {
          throw handleError(
            `Authentication failed for clan battles API`,
            `Status: ${response.status}`,
            ErrorCode.API_AUTHENTICATION_FAILED,
            'Authentication to clan battles API failed. Cookies may have expired.'
          );
        }
        
        throw new Error(`API responded with status: ${response.status}`);
      }
      
      return await response.json() as ClanBattlesResponse;
    } catch (error) {
      if (!(error instanceof Error && error.name === 'BotError')) {
        throw handleError(
          `Failed to fetch clan battles data for clan ${this.clan?.tag || 'unknown'}`, 
          error,
          ErrorCode.API_REQUEST_FAILED
        );
      }
      throw error;
    }
  }
  
  /**
   * Find player by account name
   * @param username Player username to search for
   */
  async findPlayerByName(username: string): Promise<any[]> {
    return this.requestWithRetry<any[]>('account/list', { search: username });
  }
  
  /**
   * Get player details by account ID
   * @param accountId Player account ID
   */
  async getPlayerById(accountId: string): Promise<any> {
    const data = await this.requestWithRetry<Record<string, any>>('account/info', { account_id: accountId });
    return data[accountId];
  }
  
  /**
   * Get player's ships statistics
   * @param accountId Player account ID
   */
  async getPlayerShips(accountId: string): Promise<any[]> {
    const data = await this.requestWithRetry<Record<string, any[]>>('ships/stats', { account_id: accountId });
    return data[accountId] || [];
  }
  
  /**
   * Get ship details from encyclopedia
   * @param shipId Ship ID
   */
  async getShipInfo(shipId: string): Promise<any> {
    const data = await this.requestWithRetry<Record<string, any>>('encyclopedia/ships', { ship_id: shipId });
    return data[shipId];
  }
  
  /**
   * Get clan details
   * @param clanId Clan ID
   */
  async getClanInfo(clanId: number): Promise<any> {
    const data = await this.requestWithRetry<Record<string, any>>('clans/info', { clan_id: clanId });
    return data[clanId.toString()];
  }
  
  /**
   * Search for clan by tag
   * @param clanTag Clan tag to search for
   */
  async findClanByTag(clanTag: string): Promise<any[]> {
    return this.requestWithRetry<any[]>('clans/list', { search: clanTag });
  }
  
  /**
   * Attempt to refresh authentication cookies (placeholder for future implementation)
   * @returns Whether the refresh was successful
   */
  async refreshAuthentication(): Promise<boolean> {
    Logger.warn(`Cookie refresh not implemented yet for clan ${this.clan?.tag || 'unknown'}`);
    // This would be implemented with your authentication system
    // For now, return false to indicate refresh failed
    return false;
  }
}

/**
 * Create a WargamingApiClient instance for a specific clan
 * @param clanTag Clan tag (e.g., "PN31")
 * @returns API client for the specified clan
 */
export function getApiClientForClan(clanTag: string): WargamingApiClient {
  const clan = Object.values(Config.clans).find(c => c.tag === clanTag);
  
  if (!clan) {
    throw handleError(
      `Cannot create API client`,
      `Clan with tag "${clanTag}" not found in configuration`,
      ErrorCode.CLAN_NOT_FOUND
    );
  }
  
  return new WargamingApiClient(clan);
}

// Export singleton instance for convenience (uses default clan)
export const wgApi = new WargamingApiClient(Config.defaultClan);