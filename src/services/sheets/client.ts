// src/services/sheets/client.ts
import { db } from '../../database/db.js';
import { players, ships } from '../../database/drizzle/schema.js';
import { eq, and } from 'drizzle-orm';
import { Config } from '../../utils/config.js';
import { Logger } from '../../utils/logger.js';
import { handleError, ErrorCode } from '../../utils/errors.js';

// Google API client for sheets
async function generateJWT(email: string, privateKey: string): Promise<string> {
  // For a production application, you would implement proper JWT generation
  // This is a simplified placeholder
  const header = {
    alg: 'RS256',
    typ: 'JWT'
  };
  
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: email,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now
  };
  
  // In a real implementation, you'd use a JWT library
  Logger.debug('JWT would be generated with:', { header, payload });
  
  // Return a placeholder - replace with actual implementation
  return 'placeholder_jwt_token';
}

/**
 * Upload data to Google Sheets
 * @param sheetId Google Sheets ID
 * @param sheetName Sheet name within the spreadsheet
 * @param values Array of row values to upload
 * @returns Success status
 */
async function uploadToGoogleSheets(
  sheetId: string, 
  sheetName: string, 
  values: any[][]
): Promise<boolean> {
  try {
    Logger.info(`Uploading data to Google Sheets: ${sheetName}`);
    
    const serviceAccountEmail = Config.google.serviceAccountEmail;
    const privateKey = Config.google.privateKey;
    
    if (!serviceAccountEmail || !privateKey) {
      throw handleError(
        'Google Sheets upload failed',
        'Google API credentials missing. Check environment variables.',
        ErrorCode.CONFIG_MISSING_VALUE
      );
    }
    
    // Create JWT token for authentication
    const token = await generateJWT(serviceAccountEmail, privateKey);
    
    // Format values for the Sheets API
    const body = {
      values: values
    };
    
    // Make the API request
    const response = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${sheetName}!A1:Z${values.length + 1}?valueInputOption=USER_ENTERED`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      }
    );
    
    if (!response.ok) {
      const error = await response.json();
      throw handleError(
        'Google Sheets API error',
        error.error?.message || response.statusText,
        ErrorCode.API_REQUEST_FAILED
      );
    }
    
    return true;
  } catch (error) {
    if (!(error instanceof Error && error.name === 'BotError')) {
      throw handleError('Error uploading to Google Sheets', error, ErrorCode.API_REQUEST_FAILED);
    }
    throw error;
  }
}

/**
 * Upload data to Google Sheets for all clans
 * @returns Results for each clan
 */
export async function uploadDataToSheets(): Promise<{
  results: Array<{
    clan: string;
    success: boolean;
  }>;
  totalSuccess: number;
}> {
  Logger.info('Uploading data to Google Sheets for all clans...');
  
  const results = [];
  let totalSuccess = 0;
  
  for (const clan of Object.values(Config.clans)) {
    try {
      // Get the clan-specific sheet ID if available, otherwise use the default
      const sheetId = process.env[`GOOGLE_SHEET_ID_${clan.tag}`] || Config.google.sheetId;
      
      if (!sheetId) {
        Logger.warn(`No Google Sheet ID available for clan ${clan.tag}`);
        results.push({
          clan: clan.tag,
          success: false
        });
        continue;
      }
      
      // Upload data for this clan
      const success = await uploadClanDataToSheet(clan.tag, sheetId);
      results.push({
        clan: clan.tag,
        success
      });
      
      if (success) {
        totalSuccess++;
      }
    } catch (error) {
      Logger.error(`Failed to upload data for clan ${clan.tag}:`, error);
      results.push({
        clan: clan.tag,
        success: false
      });
    }
  }
  
  Logger.info(`Completed data upload to Google Sheets. Success for ${totalSuccess} clans.`);
  
  return {
    results,
    totalSuccess
  };
}

/**
 * Upload data for a specific clan to Google Sheets
 * @param clanTag Clan tag (e.g., "PN31")
 * @param sheetId Google Sheets ID
 */
export async function uploadClanDataToSheet(clanTag: string, sheetId: string): Promise<boolean> {
  try {
    Logger.info(`Uploading data for clan ${clanTag} to Google Sheets...`);
    
    const clan = Object.values(Config.clans).find(c => c.tag === clanTag);
    if (!clan) {
      throw handleError(
        `Google Sheets upload failed`,
        `Clan with tag "${clanTag}" not found in configuration`,
        ErrorCode.CLAN_NOT_FOUND
      );
    }
    
    // Get player data with ships
    const playersData = await getPlayersWithShips(clan.id.toString());
    
    // Prepare data for player stats sheet
    const playerRows = preparePlayerData(playersData);
    
    // Prepare data for ship stats sheet
    const shipRows = prepareShipData(playersData);
    
    // Upload player data
    await uploadToGoogleSheets(sheetId, `${clanTag}_PlayerStats`, playerRows);
    
    // Upload ship data
    await uploadToGoogleSheets(sheetId, `${clanTag}_ShipStats`, shipRows);
    
    Logger.info(`Google Sheets data updated successfully for clan ${clanTag}`);
    return true;
  } catch (error) {
    Logger.error(`Error updating Google Sheets for clan ${clanTag}:`, error);
    if (!(error instanceof Error && error.name === 'BotError')) {
      throw handleError(
        `Error updating Google Sheets for clan ${clanTag}`,
        error,
        ErrorCode.API_REQUEST_FAILED
      );
    }
    throw error;
  }
}

/**
 * Get all players with their ships for a specific clan
 * @param clanId Clan ID
 * @returns Players with their ships data
 */
async function getPlayersWithShips(clanId: string) {
  try {
    // Get all players for this clan
    const allPlayers = await db.select()
      .from(players)
      .where(eq(players.clanId, clanId));
    
    if (allPlayers.length === 0) {
      Logger.warn(`No players found for clan ID ${clanId}`);
      return [];
    }
    
    // For each player, get their ships
    const playersWithShips = [];
    
    for (const player of allPlayers) {
      // Query ships for this player - use composite key
      const playerShips = await db.select()
        .from(ships)
        .where(
          and(
            eq(ships.playerId, player.id),
            eq(ships.clanId, clanId)
          )
        );
      
      playersWithShips.push({
        ...player,
        ships: playerShips
      });
    }
    
    return playersWithShips;
  } catch (error) {
    throw handleError(`Failed to get players with ships for clan ID ${clanId}`, error, ErrorCode.DB_QUERY_FAILED);
  }
}

/**
 * Prepare player data for Google Sheets
 * @param playersData Players with ships data
 * @returns Formatted rows for Google Sheets
 */
function preparePlayerData(playersData: any[]): any[][] {
  // Format for player summary sheet
  const rows = [
    ['AccountID', 'Username', 'Clan', 'ShipCount', 'AvgTier', 'AvgWinRate', 'TopShips', 'LastUpdated']
  ];
  
  for (const player of playersData) {
    rows.push([
      player.id,
      player.username,
      player.clanTag || 'No Clan',
      player.ships.length,
      calculateAvgTier(player.ships),
      calculateAvgWinRate(player.ships),
      getTopShips(player.ships, 3).map((s: any) => s.name).join(', '),
      new Date(player.lastUpdated || Date.now()).toLocaleString()
    ]);
  }
  
  return rows;
}

/**
 * Prepare ship data for Google Sheets
 * @param playersData Players with ships data
 * @returns Formatted rows for Google Sheets
 */
function prepareShipData(playersData: any[]): any[][] {
  // Headers for ship stats sheet
  const rows = [
    ['Player', 'Ship', 'Tier', 'Type', 'Nation', 'Battles', 'WinRate', 'SurvivalRate', 'AvgDamage', 'ShipScore', 'LastPlayed']
  ];
  
  // Flatten player->ships data
  for (const player of playersData) {
    for (const ship of player.ships) {
      rows.push([
        player.username,
        ship.name,
        ship.tier,
        ship.type,
        ship.nation || 'Unknown',
        ship.battles,
        `${(ship.winRate || 0).toFixed(2)}%`,
        `${(ship.survivalRate || 0).toFixed(2)}%`,
        Math.round(ship.damageAvg || 0).toLocaleString(),
        (ship.shipScore || 0).toFixed(2),
        ship.lastPlayed ? new Date(ship.lastPlayed * 1000).toLocaleDateString() : 'Unknown'
      ]);
    }
  }
  
  return rows;
}

// Helper functions
function calculateAvgTier(ships: any[]): number {
  if (ships.length === 0) return 0;
  
  const totalTier = ships.reduce((sum, ship) => sum + (ship.tier || 0), 0);
  return Number((totalTier / ships.length).toFixed(1));
}

function calculateAvgWinRate(ships: any[]): string {
  if (ships.length === 0) return '0.0%';
  
  // Filter ships with at least 1 battle
  const shipsWithBattles = ships.filter(ship => (ship.battles || 0) > 0);
  if (shipsWithBattles.length === 0) return '0.0%';
  
  // Calculate weighted average by battles
  const totalBattles = shipsWithBattles.reduce((sum, ship) => sum + (ship.battles || 0), 0);
  const weightedWinRate = shipsWithBattles.reduce((sum, ship) => {
    return sum + ((ship.winRate || 0) * (ship.battles || 0));
  }, 0);
  
  return `${(weightedWinRate / totalBattles).toFixed(2)}%`;
}

function getTopShips(ships: any[], count: number): any[] {
  // Sort by shipScore, descending
  return [...ships]
    .filter(ship => (ship.battles || 0) >= 10) // Minimum battles requirement
    .sort((a, b) => (b.shipScore || 0) - (a.shipScore || 0))
    .slice(0, count);
}