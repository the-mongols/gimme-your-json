import { db } from "../database/db.js";
import { players, ships, statHistory } from "../database/drizzle/schema.js";
import { eq } from "drizzle-orm";
import { fetchPlayerById, fetchPlayerShips, fetchShipInfo } from "./wargaming/api.js";

// Define the shape of ship data
interface ShipData {
  id: string;
  name: string;
  tier: number;
  type: string;
  nation?: string;
  battles: number;
  winRate: number;
  survivalRate: number;
  averageDamage: number;
  shipScore: number;
  lastBattleTime?: number;
}

// Run this function every midnight
export async function updatePlayerStats() {
  // Get all player IDs
  const allPlayers = await db.select({ id: players.id }).from(players);
  
  for (const player of allPlayers) {
    try {
      // Update the player's data
      await updatePlayerDataInDb(player.id);
    } catch (error) {
      console.error(`Error updating player ${player.id}:`, error);
    }
  }
}

// Function to update a single player's data
async function updatePlayerDataInDb(accountId: string) {
  try {
    // Fetch player info
    const playerData = await fetchPlayerById(accountId);
    
    // Update player timestamp
    await db.update(players)
      .set({ lastUpdated: Date.now() })
      .where(eq(players.id, accountId));
    
    // Fetch player's ships data
    const shipsData = await fetchPlayerShips(accountId);
    
    // Process each ship
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
      
      // Calculate ship score (implementation in metrics/calculator.js)
      const shipScore = calculateShipScore({
        shipType: shipInfo.type,
        tier: shipInfo.tier,
        winRate,
        survivalRate,
        damageAvg,
        battles
      });
      
      // Update or insert ship data
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
          damageAvg: damageAvg, // Fixed property name
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
            damageAvg: damageAvg, // Fixed property name
            shipScore: shipScore,
            lastPlayed: shipData.last_battle_time,
            lastUpdated: Date.now()
          }
        });
      
      // Update ship history
      await updateShipHistory(shipData.ship_id, accountId, {
        battles: battles,
        winRate: winRate,
        damageAvg: damageAvg,
        shipScore: shipScore
      });
    }
    
    console.log(`Updated data for player ${accountId}`);
  } catch (error) {
    console.error(`Error updating player data (${accountId}):`, error);
    throw error;
  }
}

// Update ship history for tracking over time
async function updateShipHistory(
  shipId: string, 
  playerId: string, 
  stats: { battles: number; winRate: number; damageAvg: number; shipScore: number; }
) {
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

// Your scoring algorithm
function calculateShipScore(shipData: { 
  shipType: string; 
  tier: number; 
  winRate: number; 
  survivalRate: number; 
  damageAvg: number; 
  battles: number;
}): number {
  // Complex calculation similar to WAR in baseball
  // Example formula - you'd develop your own
  return (
    (shipData.winRate - 0.50) * 100 * 0.4 +
    (shipData.survivalRate) * 0.2 + 
    (shipData.damageAvg / 10000) * 0.4
  );
}