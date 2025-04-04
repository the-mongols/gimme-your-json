// src/services/sheets/client.ts
import { db } from '../../database/db.js';
import { players, ships } from '../../database/drizzle/schema.js';
import { eq, and } from 'drizzle-orm';
import { Config } from '../../utils/config.js';
import { Logger } from '../../utils/logger.js';
import { handleError, ErrorCode } from '../../utils/errors.js';
import crypto from 'crypto';
import { promisify } from 'util';

// Async sign function for JWT
const asyncSign = promisify(crypto.sign);

/**
 * Generate a JWT token for Google Sheets API authentication
 * @param email Service account email
 * @param privateKey Private key for signing
 * @returns JWT token
 */
async function generateJWT(email: string, privateKey: string): Promise<string> {
  try {
    Logger.debug('Generating JWT for Google Sheets API');
    Logger.debug(`Service Account Email: ${email}`);
    Logger.debug(`Private Key Length: ${privateKey.length} characters`);

    // Current timestamp
    const now = Math.floor(Date.now() / 1000);
    const expiry = now + 3600; // Token valid for 1 hour

    // JWT Header (Base64Url encoded)
    const header = Buffer.from(JSON.stringify({
      alg: 'RS256',
      typ: 'JWT'
    })).toString('base64url');

    // JWT Payload (Base64Url encoded)
    const payload = Buffer.from(JSON.stringify({
      iss: email,
      scope: 'https://www.googleapis.com/auth/spreadsheets',
      aud: 'https://oauth2.googleapis.com/token',
      exp: expiry,
      iat: now
    })).toString('base64url');

    // Signing input
    const signingInput = `${header}.${payload}`;

    // Sign the input with the private key
    const privateKeyObject = crypto.createPrivateKey(privateKey);
    const signature = await asyncSign('sha256', Buffer.from(signingInput), privateKeyObject);
    const encodedSignature = signature.toString('base64url');

    // Construct the JWT
    const jwt = `${signingInput}.${encodedSignature}`;

    Logger.debug('JWT generated successfully');
    return jwt;
  } catch (error) {
    Logger.error('JWT generation failed:', error);
    throw handleError(
      'Failed to generate JWT',
      error,
      ErrorCode.API_AUTHENTICATION_FAILED,
      'Authentication token generation failed'
    );
  }
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
    Logger.debug(`Sheet ID: ${sheetId}`);
    Logger.debug(`Values to upload: ${JSON.stringify(values.slice(0, 5))}`); // Log first 5 rows

    const serviceAccountEmail = Config.google.serviceAccountEmail;
    const privateKey = Config.google.privateKey;
    
    if (!serviceAccountEmail || !privateKey) {
      Logger.error('Google API credentials missing');
      throw handleError(
        'Google Sheets upload failed',
        'Google API credentials missing. Check environment variables.',
        ErrorCode.CONFIG_MISSING_VALUE
      );
    }

    // Generate access token
    const token = await generateJWT(serviceAccountEmail, privateKey);

    // Prepare request body
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

    // Log response details
    Logger.debug(`API Response Status: ${response.status}`);
    
    if (!response.ok) {
      const errorBody = await response.text();
      Logger.error(`Google Sheets API Error: ${errorBody}`);
      
      throw handleError(
        'Google Sheets API error',
        errorBody,
        ErrorCode.API_REQUEST_FAILED
      );
    }

    return true;
  } catch (error) {
    Logger.error('Full error during Google Sheets upload:', error);
    
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
    Logger.debug(`Using Sheet ID: ${sheetId}`);

    const clan = Object.values(Config.clans).find(c => c.tag === clanTag);
    if (!clan) {
      Logger.error(`Clan ${clanTag} not found in configuration`);
      throw handleError(
        `Google Sheets upload failed`,
        `Clan with tag "${clanTag}" not found in configuration`,
        ErrorCode.CLAN_NOT_FOUND
      );
    }

    // Get player data with ships
    const playersData = await getPlayersWithShips(clan.id.toString());
    Logger.debug(`Found ${playersData.length} players with ships`);

    // Prepare data for player stats sheet
    const playerRows = preparePlayerData(playersData);
    Logger.debug(`Prepared ${playerRows.length} player rows`);
    
    // Prepare data for ship stats sheet
    const shipRows = prepareShipData(playersData);
    Logger.debug(`Prepared ${shipRows.length} ship rows`);

    // Upload player data
    await uploadToGoogleSheets(sheetId, `${clanTag}_PlayerStats`, playerRows);
    
    // Upload ship data
    await uploadToGoogleSheets(sheetId, `${clanTag}_ShipStats`, shipRows);
    
    Logger.info(`Google Sheets data updated successfully for clan ${clanTag}`);
    return true;
  } catch (error) {
    Logger.error(`Error updating Google Sheets for clan ${clanTag}:`, error);
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