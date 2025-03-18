import { db } from "../../database/db.js";
import { players, ships, statHistory } from "../../database/drizzle/schema.js";
import { eq } from "drizzle-orm";
// Fixed import path to correctly point to the metrics calculator
import { calculateShipScore as calculateScore } from "../../services/metrics/calculator.js";

// API configuration
const WG_API_KEY = process.env.WG_API_KEY;
const WG_API_REGION = process.env.WG_API_REGION || 'na';

// API base URLs by region
const API_BASES = {
  na: "https://api.worldofwarships.com/wows",
  eu: "https://api.worldofwarships.eu/wows",
  asia: "https://api.worldofwarships.asia/wows",
  ru: "https://api.worldofwarships.ru/wows"
};

// Get the appropriate API base URL
const API_BASE = API_BASES[WG_API_REGION as keyof typeof API_BASES] || API_BASES.na;

// Interface for ship encyclopedia data
interface ShipInfo {
  name: string;
  tier: number;
  type: string;
  nation: string;
  // Add other relevant ship encyclopedia fields
}

// Fetch player by account name
export async function fetchPlayerByName(username: string) {
  try {
    const response = await fetch(
      `${API_BASE}/account/list/?application_id=${WG_API_KEY}&search=${encodeURIComponent(username)}`
    );
    
    if (!response.ok) {
      throw new Error(`API responded with status: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (!data || data.status !== "ok" || !data.data || data.data.length === 0) {
      throw new Error(`Player "${username}" not found`);
    }
    
    // Return first matching player
    return data.data[0];
  } catch (error) {
    console.error(`Error fetching player by name (${username}):`, error);
    throw error;
  }
}

// Fetch player by account ID
export async function fetchPlayerById(accountId: string) {
  try {
    const response = await fetch(
      `${API_BASE}/account/info/?application_id=${WG_API_KEY}&account_id=${accountId}`
    );
    
    if (!response.ok) {
      throw new Error(`API responded with status: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (!data || data.status !== "ok" || !data.data || !data.data[accountId]) {
      throw new Error(`Player with ID "${accountId}" not found`);
    }
    
    // Return player data
    return data.data[accountId];
  } catch (error) {
    console.error(`Error fetching player by ID (${accountId}):`, error);
    throw error;
  }
}

// Fetch player's ship statistics
export async function fetchPlayerShips(accountId: string) {
  try {
    const response = await fetch(
      `${API_BASE}/ships/stats/?application_id=${WG_API_KEY}&account_id=${accountId}`
    );
    
    if (!response.ok) {
      throw new Error(`API responded with status: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (!data || data.status !== "ok" || !data.data || !data.data[accountId]) {
      throw new Error(`No ship data found for player ID "${accountId}"`);
    }
    
    // Return ship stats
    return data.data[accountId];
  } catch (error) {
    console.error(`Error fetching player ships (${accountId}):`, error);
    throw error;
  }
}

// Fetch ship details from encyclopedia
export async function fetchShipInfo(shipId: string): Promise<ShipInfo> {
  try {
    const response = await fetch(
      `${API_BASE}/encyclopedia/ships/?application_id=${WG_API_KEY}&ship_id=${shipId}`
    );
    
    if (!response.ok) {
      throw new Error(`API responded with status: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (!data || data.status !== "ok" || !data.data || !data.data[shipId]) {
      throw new Error(`Ship with ID "${shipId}" not found in encyclopedia`);
    }
    
    const shipData = data.data[shipId];
    
    // Map API ship type codes to readable types
    const typeMap: Record<string, string> = {
      "Destroyer": "DD",
      "Cruiser": "CA",
      "Battleship": "BB",
      "AirCarrier": "CV",
      "Submarine": "SS"
    };
    
    return {
      name: shipData.name,
      tier: shipData.tier,
      type: typeMap[shipData.type] || shipData.type,
      nation: shipData.nation
    };
  } catch (error) {
    console.error(`Error fetching ship info (${shipId}):`, error);
    // Return a default object for error cases
    return {
      name: `Unknown Ship (${shipId})`,
      tier: 1,
      type: "Unknown",
      nation: "Unknown"
    };
  }
}

// Update player data in the database
export async function updatePlayerDataInDb(accountId: string) {
  try {
    // Validate and normalize account ID
    if (!accountId || isNaN(Number(accountId))) {
      throw new Error(`Invalid account ID: ${accountId}`);
    }
    
    console.log(`Updating data for player ${accountId}...`);
    
    // Fetch player account data
    const playerData = await fetchPlayerById(accountId);
    
    // Check if player already exists to get the discordId
    const existingPlayer = await db.select().from(players).where(eq(players.id, accountId)).get();
    
    if (existingPlayer) {
      // Update player record
      await db.update(players)
        .set({
          username: playerData.nickname,
          clanTag: playerData.clan?.tag || null,
          lastUpdated: Date.now()
        })
        .where(eq(players.id, accountId));
    } else {
      // Can't insert without discordId as it's required
      console.warn(`Player ${accountId} not found in database, can't update`);
      return;
    }
    
    console.log(`Player ${playerData.nickname} (${accountId}) info updated`);
    
    // Fetch player's ships data
    const shipsData = await fetchPlayerShips(accountId);
    
    // Process each ship
    let shipsUpdated = 0;
    
    for (const shipData of shipsData) {
      // Skip ships with no battles
      if (!shipData.pvp || !shipData.pvp.battles || shipData.pvp.battles === 0) {
        continue;
      }
      
      // Get additional ship info from encyclopedia
      const shipInfo = await fetchShipInfo(shipData.ship_id);
      
      // Calculate metrics
      const battles = shipData.pvp.battles;
      const wins = shipData.pvp.wins;
      const survived = shipData.pvp.survived_battles;
      
      const winRate = (wins / battles) * 100;
      const survivalRate = (survived / battles) * 100;
      const damageAvg = shipData.pvp.damage_dealt / battles;
      const fragAvg = shipData.pvp.frags / battles;
      
      // Calculate ship score
      const shipScore = calculateScore({
        shipType: shipInfo.type,
        tier: shipInfo.tier,
        winRate,
        survivalRate,
        damageAvg,
        fragAvg,
        battles
      });
      
      // Update ship in database
      await db.insert(ships)
        .values({
          id: shipData.ship_id,
          playerId: accountId,
          name: shipInfo.name,
          tier: shipInfo.tier,
          type: shipInfo.type,
          nation: shipInfo.nation,
          battles: battles,
          wins: wins,
          survived: survived,
          winRate: winRate,
          survivalRate: survivalRate,
          damageAvg: damageAvg,
          fragAvg: fragAvg,
          shipScore: shipScore,
          lastPlayed: shipData.last_battle_time,
          lastUpdated: Date.now()
        })
        .onConflictDoUpdate({
          target: ships.id,
          set: {
            battles: battles,
            wins: wins,
            survived: survived,
            winRate: winRate,
            survivalRate: survivalRate,
            damageAvg: damageAvg,
            fragAvg: fragAvg,
            shipScore: shipScore,
            lastPlayed: shipData.last_battle_time,
            lastUpdated: Date.now()
          }
        });
      
      // Update ship history if needed
      await updateShipHistory(shipData.ship_id, {
        battles: battles,
        winRate: winRate,
        damageAvg: damageAvg,
        shipScore: shipScore
      });
      
      shipsUpdated++;
    }
    
    console.log(`Updated ${shipsUpdated} ships for player ${playerData.nickname}`);
    
    return {
      playerId: accountId,
      playerName: playerData.nickname,
      shipsUpdated: shipsUpdated
    };
  } catch (error) {
    console.error(`Error updating player data (${accountId}):`, error);
    throw error;
  }
}

// Update ship history for tracking over time
async function updateShipHistory(shipId: string, stats: any) {
  try {
    // Get the current date (midnight)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const timestamp = today.getTime();
    
    // Insert or update history record for today
    await db.insert(statHistory)
      .values({
        shipId: shipId,
        date: timestamp,
        battles: stats.battles,
        winRate: stats.winRate,
        damageAvg: stats.damageAvg,
        shipScore: stats.shipScore
      })
      .onConflictDoUpdate({
        target: [statHistory.shipId, statHistory.date],
        set: {
          battles: stats.battles,
          winRate: stats.winRate,
          damageAvg: stats.damageAvg,
          shipScore: stats.shipScore
        }
      });
  } catch (error) {
    console.error(`Error updating ship history (${shipId}):`, error);
    // Don't throw - this is a non-critical operation
  }
}

// Update data for all players in the database
export async function updateAllPlayersData() {
  try {
    // Get all players from database
    const allPlayers = await db.select().from(players);
    
    console.log(`Starting update for ${allPlayers.length} players...`);
    
    const results = {
      total: allPlayers.length,
      success: 0,
      failed: 0,
      errors: [] as string[]
    };
    
    // Update each player
    for (const player of allPlayers) {
      try {
        await updatePlayerDataInDb(player.id);
        results.success++;
        
        // Add a small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (error) {
        results.failed++;
        results.errors.push(`${player.username} (${player.id}): ${(error as Error).message}`);
        console.error(`Error updating player ${player.username}:`, error);
      }
    }
    
    console.log(`Player update complete: ${results.success} succeeded, ${results.failed} failed`);
    return results;
  } catch (error) {
    console.error('Error updating all players:', error);
    throw error;
  }
}