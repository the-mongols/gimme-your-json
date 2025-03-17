import { db } from '../../database/db.js';
import { players, ships } from '../../database/drizzle/schema.js';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Direct Google API method to avoid dependencies
async function uploadToGoogleSheets(
  sheetId: string, 
  sheetName: string, 
  values: any[][]
): Promise<boolean> {
  try {
    const serviceAccountEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');
    
    if (!serviceAccountEmail || !privateKey) {
      throw new Error('Google API credentials missing. Check environment variables.');
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
      throw new Error(`Google Sheets API error: ${error.error.message}`);
    }
    
    return true;
  } catch (error) {
    console.error('Error uploading to Google Sheets:', error);
    throw error;
  }
}

// JWT token generation
async function generateJWT(email: string, privateKey: string): Promise<string> {
  // Simple implementation for JWT generation
  // In a production app, use a proper JWT library
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
  
  // For simplicity, we're using a placeholder
  // In a real implementation, you'd use a JWT library or the google-auth-library
  console.log('JWT would be generated with:', { header, payload });
  
  // Return a placeholder - replace with actual implementation
  return 'placeholder_jwt_token';
}

export async function uploadDataToSheet(): Promise<boolean> {
  try {
    const sheetId = process.env.GOOGLE_SHEET_ID;
    
    if (!sheetId) {
      throw new Error('Google Sheet ID missing. Check environment variables.');
    }
    
    // Get player data with ships
    const playersData = await getPlayersWithShips();
    
    // Prepare data for player stats sheet
    const playerRows = preparePlayerData(playersData);
    
    // Prepare data for ship stats sheet
    const shipRows = prepareShipData(playersData);
    
    // Upload player data
    await uploadToGoogleSheets(sheetId, 'PlayerStats', playerRows);
    
    // Upload ship data
    await uploadToGoogleSheets(sheetId, 'ShipStats', shipRows);
    
    console.log('Google Sheets data updated successfully');
    return true;
  } catch (error) {
    console.error('Error updating Google Sheets:', error);
    throw error;
  }
}

async function getPlayersWithShips() {
  // Get all players
  const allPlayers = await db.select().from(players);
  
  // For each player, get their ships
  const playersWithShips = [];
  
  for (const player of allPlayers) {
    // Query ships for this player
    const playerShips = await db.select()
      .from(ships)
      .where(ships.playerId == player.id);
    
    playersWithShips.push({
      ...player,
      ships: playerShips
    });
  }
  
  return playersWithShips;
}

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