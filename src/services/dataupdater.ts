import { db } from "../database/db.js";
import { players, ships } from "../database/drizzle/schema.js";
import { eq } from "drizzle-orm";

// Run this function every midnight
export async function updatePlayerStats() {
  // Get all player IDs
  const allPlayers = await db.select({ id: players.id }).from(players);
  
  for (const player of allPlayers) {
    // Fetch latest data from WG API
    const playerData = await fetchPlayerDataFromAPI(player.id);
    
    // Update player timestamp
    await db.update(players)
      .set({ lastUpdated: Date.now() })
      .where(eq(players.id, player.id));
    
    // Process each ship
    for (const shipData of playerData.ships) {
      // Calculate your compound metric
      const shipScore = calculateShipScore(shipData);
      
      // Update or insert ship data
      await db.insert(ships)
        .values({
          id: shipData.id,
          playerId: player.id,
          name: shipData.name,
          tier: shipData.tier,
          type: shipData.type,
          battles: shipData.battles,
          winRate: shipData.winRate,
          survivalRate: shipData.survivalRate,
          damagePerBattle: shipData.averageDamage,
          shipScore,
          lastUpdated: Date.now()
        })
        .onConflictDoUpdate({
          target: ships.id,
          set: {
            battles: shipData.battles,
            winRate: shipData.winRate,
            survivalRate: shipData.survivalRate,
            damagePerBattle: shipData.averageDamage,
            shipScore,
            lastUpdated: Date.now()
          }
        });
    }
  }
}

// Your scoring algorithm
function calculateShipScore(shipData) {
  // Complex calculation similar to WAR in baseball
  // Example formula - you'd develop your own
  return (
    (shipData.winRate - 0.50) * 100 * 0.4 +
    (shipData.survivalRate * 100) * 0.2 + 
    (shipData.averageDamage / 10000) * 0.4
  );
}