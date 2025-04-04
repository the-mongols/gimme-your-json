// src/services/sheets/client.ts
import { db } from "../../database/db.js";
import { players, ships } from "../../database/drizzle/schema.js";
import { eq, and } from "drizzle-orm";
import { Config } from "../../utils/config.js";
import { Logger } from "../../utils/logger.js";
import { handleError, ErrorCode } from "../../utils/errors.js";
import crypto from "crypto";

// Interface for Google Sheets API response
interface GoogleSheetsResponse {
  spreadsheetId: string;
  updatedRange: string;
  updatedCells: number;
  updatedRows: number;
  updatedColumns: number;
}

/**
 * Generate a JWT token for Google Sheets API authentication
 * @param email Service account email
 * @param privateKey Private key for signing
 * @returns JWT token
 */
async function generateJWT(email: string, privateKey: string): Promise<string> {
  try {
    Logger.debug('Generating JWT for Google Sheets API');
    
    // Current timestamp
    const now = Math.floor(Date.now() / 1000);
    const expiry = now + 3600; // Token valid for 1 hour

    // JWT Header
    const header = {
      alg: "RS256",
      typ: "JWT"
    };

    // JWT Payload
    const payload = {
      iss: email,
      scope: "https://www.googleapis.com/auth/spreadsheets",
      aud: "https://oauth2.googleapis.com/token",
      exp: expiry,
      iat: now
    };

    // Encode header and payload
    const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');

    // Create signing input
    const signingInput = `${encodedHeader}.${encodedPayload}`;

    // Sign the input with the private key
    const sign = crypto.createSign('RSA-SHA256');
    sign.update(signingInput);
    sign.end();
    
    const signature = sign.sign(privateKey);
    const encodedSignature = signature.toString('base64url');

    // Construct and return the JWT
    return `${signingInput}.${encodedSignature}`;
  } catch (error) {
    Logger.error('Error generating JWT:', error);
    throw handleError(
      'Failed to generate authentication token',
      error,
      ErrorCode.API_AUTHENTICATION_FAILED
    );
  }
}

/**
 * Get an access token from Google OAuth service using JWT
 * @param jwt JWT token
 * @returns Access token
 */
async function getAccessToken(jwt: string): Promise<string> {
  try {
    Logger.debug('Getting access token from Google OAuth service');
    
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwt
      })
    });

    if (!response.ok) {
      const errorData = await response.text();
      throw new Error(`Failed to get access token: ${response.status} ${errorData}`);
    }

    const data = await response.json();
    return data.access_token;
  } catch (error) {
    Logger.error('Error getting access token:', error);
    throw handleError(
      'Failed to authenticate with Google',
      error, 
      ErrorCode.API_AUTHENTICATION_FAILED
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
export async function uploadToSheet(
  sheetId: string, 
  sheetName: string, 
  values: any[][]
): Promise<GoogleSheetsResponse> {
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

    // Generate JWT and get access token
    const jwt = await generateJWT(serviceAccountEmail, privateKey);
    const accessToken = await getAccessToken(jwt);

    // Prepare request body
    const body = {
      values: values
    };

    // Calculate range based on data dimensions
    const numRows = values.length;
    const numCols = values.reduce((max, row) => Math.max(max, row.length), 0);
    const range = `${sheetName}!A1:${String.fromCharCode(65 + numCols - 1)}${numRows}`;

    // Make the API request
    const response = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}?valueInputOption=USER_ENTERED`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      }
    );

    if (!response.ok) {
      const errorBody = await response.text();
      throw handleError(
        'Google Sheets API error',
        `${response.status} ${errorBody}`,
        ErrorCode.API_REQUEST_FAILED
      );
    }

    const result = await response.json();
    Logger.info(`Successfully updated ${result.updatedCells} cells in range ${result.updatedRange}`);
    
    return result;
  } catch (error) {
    if (!(error instanceof Error && error.name === 'BotError')) {
      throw handleError('Error uploading to Google Sheets', error, ErrorCode.API_REQUEST_FAILED);
    }
    throw error;
  }
}

/**
 * Upload data to a specific range within a sheet
 * @param sheetId Google Sheets ID
 * @param sheetName Sheet name within the spreadsheet
 * @param startRow Starting row for the data (1-based)
 * @param values Array of row values to upload
 * @returns Success status
 */
export async function uploadToRangeInSheet(
  sheetId: string,
  sheetName: string,
  startRow: number,
  values: any[][]
): Promise<GoogleSheetsResponse> {
  try {
    Logger.info(`Uploading data to Google Sheets: ${sheetName} starting at row ${startRow}`);
    
    const serviceAccountEmail = Config.google.serviceAccountEmail;
    const privateKey = Config.google.privateKey;
    
    if (!serviceAccountEmail || !privateKey) {
      throw handleError(
        'Google Sheets upload failed',
        'Google API credentials missing. Check environment variables.',
        ErrorCode.CONFIG_MISSING_VALUE
      );
    }

    // Generate JWT and get access token
    const jwt = await generateJWT(serviceAccountEmail, privateKey);
    const accessToken = await getAccessToken(jwt);

    // Prepare request body
    const body = {
      values: values
    };

    // Calculate range based on data dimensions
    const numRows = values.length;
    const numCols = values.reduce((max, row) => Math.max(max, row.length), 0);
    const endRow = startRow + numRows - 1;
    const range = `${sheetName}!A${startRow}:${String.fromCharCode(65 + numCols - 1)}${endRow}`;

    // Make the API request
    const response = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}?valueInputOption=USER_ENTERED`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      }
    );

    if (!response.ok) {
      const errorBody = await response.text();
      throw handleError(
        'Google Sheets API error',
        `${response.status} ${errorBody}`,
        ErrorCode.API_REQUEST_FAILED
      );
    }

    const result = await response.json();
    Logger.info(`Successfully updated ${result.updatedCells} cells in range ${result.updatedRange}`);
    
    return result;
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
    Logger.debug(`Found ${playersData.length} players with ships data`);

    // Prepare data for player stats sheet
    const playerRows = preparePlayerData(playersData);
    Logger.debug(`Prepared ${playerRows.length} player rows for sheet`);
    
    // Prepare data for ship stats sheet
    const shipRows = prepareShipData(playersData);
    Logger.debug(`Prepared ${shipRows.length} ship rows for sheet`);

    // Check if the clan's sheet exists, and use that instead of creating new ones
    // For the existing structure: Cover page, PN, PN32, PN31, PN30, PNEU
    // We'll write to the sheet named exactly after the clan tag
    
    // Upload player data to the clan's sheet
    await uploadToSheet(sheetId, clanTag, playerRows);
    
    // For ship data, we might want to write to a different range or tab
    // Let's add a "Ships" range/section to the same sheet
    // Determine the start row for ships data (after player data with some spacing)
    const shipDataStartRow = playerRows.length + 3; // 2 rows of space after player data
    
    // Upload ship data to the same sheet but at a different range
    await uploadToRangeInSheet(sheetId, clanTag, shipDataStartRow, shipRows);
    
    Logger.info(`Google Sheets data updated successfully for clan ${clanTag}`);
    return true;
  } catch (error) {
    Logger.error(`Error updating Google Sheets for clan ${clanTag}:`, error);
    if (!(error instanceof Error && error.name === 'BotError')) {
      throw handleError(`Failed to update Google Sheets for clan ${clanTag}`, error);
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
  // Add title and timestamp headers
  const timestamp = new Date().toLocaleString();
  const rows = [
    [`PLAYER STATISTICS - Updated: ${timestamp}`],
    [''] // Empty row for spacing
  ];
  
  // Add column headers
  rows.push(['AccountID', 'Username', 'Clan', 'ShipCount', 'AvgTier', 'AvgWinRate', 'TopShips', 'LastUpdated']);
  
  // Add player data
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
  // Add title and timestamp headers
  const timestamp = new Date().toLocaleString();
  const rows = [
    [`SHIP STATISTICS - Updated: ${timestamp}`],
    [''] // Empty row for spacing
  ];
  
  // Add column headers
  rows.push(['Player', 'Ship', 'Tier', 'Type', 'Nation', 'Battles', 'WinRate', 'SurvivalRate', 'AvgDamage', 'ShipScore', 'LastPlayed']);
  
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