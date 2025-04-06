// src/services/sheets/client.ts
import { db } from "../../database/db.js";
import { players, ships } from "../../database/drizzle/schema.js";
import { eq, and } from "drizzle-orm";
import { Config } from "../../utils/config.js";
import { Logger } from "../../utils/logger.js";
import { handleError, ErrorCode, BotError } from "../../utils/errors.js";
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
    Logger.debug(`Generating JWT for Google Sheets API`);
    
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
    
    try {
      const signature = sign.sign(privateKey);
      const encodedSignature = signature.toString('base64url');

      // Construct and return the JWT
      return `${signingInput}.${encodedSignature}`;
    } catch (signError) {
      // More detailed error for key format issues
      if (signError instanceof Error && 
          signError.message.includes('PEM')) {
        throw new BotError(
          "Invalid private key format",
          ErrorCode.CONFIG_INVALID,
          "Service account private key is not in valid PEM format. Check for proper line breaks and formatting."
        );
      }
      
      throw signError;
    }
  } catch (error) {
    if (error instanceof BotError) throw error;
    
    Logger.error('Error generating JWT:', error);
    throw handleError(
      'Failed to generate authentication token',
      error,
      ErrorCode.API_AUTHENTICATION_FAILED,
      "Authentication failed - could not generate security token."
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
      const errorBody = await response.text();
      let errorDetails;
      
      try {
        // Try to parse error JSON
        errorDetails = JSON.parse(errorBody);
      } catch {
        errorDetails = errorBody;
      }
      
      // Check for specific OAuth errors
      if (response.status === 400 && errorBody.includes("invalid_grant")) {
        throw new BotError(
          "Invalid service account credentials",
          ErrorCode.API_AUTHENTICATION_FAILED,
          "Authentication failed - service account credentials are invalid or expired."
        );
      }
      
      throw new BotError(
        `Failed to get access token: ${response.status}`,
        ErrorCode.API_AUTHENTICATION_FAILED,
        `Authentication failed with status ${response.status}. ${errorDetails?.error_description || ''}`
      );
    }

    const data = await response.json();
    return data.access_token;
  } catch (error) {
    if (error instanceof BotError) throw error;
    
    Logger.error('Error getting access token:', error);
    throw handleError(
      'Failed to authenticate with Google',
      error, 
      ErrorCode.API_AUTHENTICATION_FAILED,
      "Could not get access credentials from Google OAuth service."
    );
  }
}

/**
 * Check if we can access a spreadsheet by fetching its metadata
 * @param sheetId Google Sheets ID
 * @param accessToken Access token
 * @returns True if we can access the spreadsheet
 */
async function checkSheetAccess(sheetId: string, accessToken: string): Promise<boolean> {
  try {
    Logger.debug(`Checking access to spreadsheet: ${sheetId}`);
    
    const response = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=properties`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      }
    );
    
    if (!response.ok) {
      const errorBody = await response.text();
      
      // Check for specific errors
      if (response.status === 404) {
        throw new BotError(
          `Spreadsheet not found: ${sheetId}`,
          ErrorCode.FILE_NOT_FOUND,
          "The requested Google Sheet could not be found. Check the spreadsheet ID."
        );
      }
      
      if (response.status === 403) {
        throw new BotError(
          `Permission denied for spreadsheet: ${sheetId}`,
          ErrorCode.COMMAND_PERMISSION_DENIED,
          "Access denied to the Google Sheet. Make sure you've shared it with the service account."
        );
      }
      
      return false;
    }
    
    const data = await response.json();
    Logger.debug(`Successfully accessed spreadsheet: ${data.properties?.title}`);
    return true;
  } catch (error) {
    if (error instanceof BotError) throw error;
    
    Logger.error('Error checking spreadsheet access:', error);
    // Don't throw here, just return false
    return false;
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
        ErrorCode.CONFIG_MISSING_VALUE,
        "Google Sheets integration is not fully configured. Contact the bot administrator."
      );
    }

    // Generate JWT and get access token
    const jwt = await generateJWT(serviceAccountEmail, privateKey);
    const accessToken = await getAccessToken(jwt);
    
    // Verify we can access the spreadsheet before attempting to write
    const hasAccess = await checkSheetAccess(sheetId, accessToken);
    
    if (!hasAccess) {
      throw new BotError(
        `Cannot access spreadsheet: ${sheetId}`,
        ErrorCode.COMMAND_PERMISSION_DENIED,
        "Could not access the Google Sheet. Make sure it exists and is shared with the service account."
      );
    }

    // Prepare request body
    const body = {
      values: values
    };

    // Calculate range based on data dimensions
    const numRows = values.length;
    const numCols = values.reduce((max, row) => Math.max(max, row.length), 0);
    const range = `${sheetName}!A1:${String.fromCharCode(65 + numCols - 1)}${numRows}`;
    
    Logger.debug(`Updating range: ${range} with ${numRows} rows x ${numCols} columns`);

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
      
      // Check for specific error cases
      if (response.status === 400 && errorBody.includes("Unable to parse range")) {
        throw new BotError(
          `Invalid sheet name: ${sheetName}`,
          ErrorCode.COMMAND_INVALID_ARGUMENTS,
          `The sheet tab "${sheetName}" does not exist in the spreadsheet.`
        );
      }
      
      throw handleError(
        'Google Sheets API error',
        `${response.status} ${errorBody}`,
        ErrorCode.API_REQUEST_FAILED,
        "Error updating Google Sheet. Please try again later."
      );
    }

    const result = await response.json();
    Logger.info(`Successfully updated ${result.updatedCells} cells in range ${result.updatedRange}`);
    
    return result;
  } catch (error) {
    if (error instanceof BotError) throw error;
    
    throw handleError('Error uploading to Google Sheets', error, ErrorCode.API_REQUEST_FAILED);
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
        ErrorCode.CONFIG_MISSING_VALUE,
        "Google Sheets integration is not fully configured. Contact the bot administrator."
      );
    }

    // Generate JWT and get access token
    const jwt = await generateJWT(serviceAccountEmail, privateKey);
    const accessToken = await getAccessToken(jwt);
    
    // Verify we can access the spreadsheet before attempting to write
    const hasAccess = await checkSheetAccess(sheetId, accessToken);
    
    if (!hasAccess) {
      throw new BotError(
        `Cannot access spreadsheet: ${sheetId}`,
        ErrorCode.COMMAND_PERMISSION_DENIED,
        "Could not access the Google Sheet. Make sure it exists and is shared with the service account."
      );
    }

    // Prepare request body
    const body = {
      values: values
    };

    // Calculate range based on data dimensions
    const numRows = values.length;
    const numCols = values.reduce((max, row) => Math.max(max, row.length), 0);
    const endRow = startRow + numRows - 1;
    const range = `${sheetName}!A${startRow}:${String.fromCharCode(65 + numCols - 1)}${endRow}`;
    
    Logger.debug(`Updating range: ${range} with ${numRows} rows x ${numCols} columns`);

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
      
      // Check for specific error cases
      if (response.status === 400 && errorBody.includes("Unable to parse range")) {
        throw new BotError(
          `Invalid sheet name: ${sheetName}`,
          ErrorCode.COMMAND_INVALID_ARGUMENTS,
          `The sheet tab "${sheetName}" does not exist in the spreadsheet.`
        );
      }
      
      throw handleError(
        'Google Sheets API error',
        `${response.status} ${errorBody}`,
        ErrorCode.API_REQUEST_FAILED,
        "Error updating Google Sheet. Please try again later."
      );
    }

    const result = await response.json();
    Logger.info(`Successfully updated ${result.updatedCells} cells in range ${result.updatedRange}`);
    
    return result;
  } catch (error) {
    if (error instanceof BotError) throw error;
    
    throw handleError('Error uploading to Google Sheets', error, ErrorCode.API_REQUEST_FAILED);
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

    // Try to use the clan tag as the sheet name since this is how the spreadsheet is structured
    try {
      // Upload player data to the clan's sheet
      await uploadToSheet(sheetId, clanTag, playerRows);
      
      // For ship data, use a different range in the same sheet
      const shipDataStartRow = playerRows.length + 3; // 2 rows of space after player data
      await uploadToRangeInSheet(sheetId, clanTag, shipDataStartRow, shipRows);
      
      Logger.info(`Google Sheets data updated successfully for clan ${clanTag}`);
      return true;
    } catch (error) {
      // If using the clan tag as sheet name fails, try a fallback approach
      if (error instanceof BotError && 
          error.code === ErrorCode.COMMAND_INVALID_ARGUMENTS &&
          error.message.includes('Invalid sheet name')) {
        
        Logger.warn(`Sheet tab "${clanTag}" not found, trying alternative sheet names...`);
        
        // Try each of the potential sheet names in our spreadsheet structure
        const potentialSheetNames = ["Cover Page", "PN", "PN30", "PN31", "PN32", "PNEU"];
        
        for (const sheetName of potentialSheetNames) {
          try {
            Logger.info(`Trying sheet name: ${sheetName}`);
            
            // Upload player data
            await uploadToSheet(sheetId, sheetName, playerRows);
            
            // Upload ship data
            const shipDataStartRow = playerRows.length + 3;
            await uploadToRangeInSheet(sheetId, sheetName, shipDataStartRow, shipRows);
            
            Logger.info(`Google Sheets data updated successfully using sheet tab "${sheetName}"`);
            return true;
          } catch (innerError) {
            // Continue to next sheet name if this one fails
            Logger.warn(`Failed with sheet name "${sheetName}": ${innerError instanceof Error ? innerError.message : String(innerError)}`);
          }
        }
        
        // If we get here, all fallbacks failed
        Logger.error(`All sheet name attempts failed for clan ${clanTag}`);
        return false;
      } else {
        // Rethrow original error
        throw error;
      }
    }
  } catch (error) {
    Logger.error(`Error updating Google Sheets for clan ${clanTag}:`, error);
    if (!(error instanceof BotError)) {
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