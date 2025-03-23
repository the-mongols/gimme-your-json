// Service for calculating and managing player statistics
import { db } from '../../database/db.js';
import { playerStats, clanBattlePlayers, clanBattleTeams } from '../../database/drizzle/schema.js';
import { eq, and, desc, asc } from 'drizzle-orm';
import type { PlayerStats } from '../../types/wowsAPI.js';

/**
 * Update player statistics based on battle data
 * This recalculates all player stats from the raw data
 */
export async function updatePlayerStats(): Promise<number> {
  console.log('Updating player statistics...');
  
  try {
    // Get all unique player IDs from clan_battle_players
    const playerIdsResult = await db.select({
      player_id: clanBattlePlayers.playerId,
      player_name: clanBattlePlayers.playerName
    })
    .from(clanBattlePlayers)
    .groupBy(clanBattlePlayers.playerId);
    
    const playerIds = playerIdsResult.map(result => ({
      id: result.player_id || '',
      name: result.player_name || 'Unknown'
    }));
    
    console.log(`Found ${playerIds.length} players to update stats for`);
    
    // Process each player
    let updatedCount = 0;
    
    for (const player of playerIds) {
      if (!player.id) continue;
      
      // Get all battles for this player
      const playerBattlesData = await db.select()
        .from(clanBattlePlayers)
        .where(eq(clanBattlePlayers.playerId, player.id))
        .orderBy(desc(clanBattlePlayers.battleId));
      
      if (playerBattlesData.length === 0) {
        console.log(`No battles found for player ${player.name} (${player.id})`);
        continue;
      }
      
      // Calculate statistics
      const totalBattles = playerBattlesData.length;
      const victories = playerBattlesData.filter(battle => battle.survived === 1).length;
      const defeats = playerBattlesData.filter(battle => battle.survived === 0).length;
      const survivalCount = playerBattlesData.filter(battle => battle.survived === 1).length;
      
      // Calculate rates
      const winRate = totalBattles > 0 ? (victories / totalBattles) * 100 : 0;
      const survivalRate = totalBattles > 0 ? (survivalCount / totalBattles) * 100 : 0;
      
      // Get the clan ID from the first battle (should be the same for all)
      const clanId = playerBattlesData[0]?.clanId || '';
      
      if (!clanId) {
        console.log(`No clan ID found for player ${player.name} (${player.id})`);
        continue;
      }
      
      // Calculate ship usage stats
      const shipsUsedMap: Record<string, {
        ship_name: string;
        battles: number;
        victories: number;
        survived: number;
      }> = {};
      
      for (const battle of playerBattlesData) {
        if (!battle.shipId) continue;
        
        if (!shipsUsedMap[battle.shipId]) {
          shipsUsedMap[battle.shipId] = {
            ship_name: battle.shipName || 'Unknown',
            battles: 0,
            victories: 0,
            survived: 0
          };
        }
        
        shipsUsedMap[battle.shipId].battles++;
        
        // Get team result to determine victory/defeat
        const team = await db.select()
          .from(clanBattleTeams)
          .where(eq(clanBattleTeams.id, battle.teamId))
          .get();
          
        if (team && team.result === 'win') {
          shipsUsedMap[battle.shipId].victories++;
        }
        
        if (battle.survived === 1) {
          shipsUsedMap[battle.shipId].survived++;
        }
      }
      
      const shipsUsed = JSON.stringify(shipsUsedMap);
      const playerName = player.name;
      
      // Check if stats already exist
      const existingStats = await db.select()
        .from(playerStats)
        .where(
          and(
            eq(playerStats.playerId, player.id),
            eq(playerStats.clanId, clanId)
          )
        )
        .get();
      
      if (existingStats) {
        // Update existing stats
        await db.update(playerStats)
          .set({
            playerName,
            totalBattles,
            victories,
            defeats,
            survivalCount,
            shipsUsed,
            winRate,
            survivalRate,
            lastUpdated: Date.now()
          })
          .where(
            and(
              eq(playerStats.playerId, player.id),
              eq(playerStats.clanId, clanId)
            )
          );
      } else {
        // Insert new stats
        await db.insert(playerStats).values({
          playerId: player.id,
          clanId,
          playerName,
          totalBattles,
          victories,
          defeats,
          survivalCount,
          shipsUsed,
          winRate,
          survivalRate,
          lastUpdated: Date.now()
        });
      }
      
      updatedCount++;
    }
    
    console.log(`Successfully updated statistics for ${updatedCount} players`);
    return updatedCount;
  } catch (error) {
    console.error('Error updating player statistics:', error);
    throw error;
  }
}

/**
 * Get statistics for a specific player
 * @param playerId The player's WG account ID (spa_id)
 * @returns The player's statistics or null if not found
 */
export async function getPlayerStats(playerId: string): Promise<PlayerStats | null> {
  try {
    // Get the player's stats from the database
    const stats = await db.select()
      .from(playerStats)
      .where(eq(playerStats.playerId, playerId))
      .get();
    
    if (!stats) {
      return null;
    }
    
    // Parse ships_used JSON
    let shipsUsed = {};
    try {
      if (stats.shipsUsed) {
        shipsUsed = JSON.parse(stats.shipsUsed as string);
      }
    } catch (error) {
      console.error(`Error parsing ships JSON for player ${playerId}:`, error);
    }
    
    // Format as PlayerStats
    const playerStatsData: PlayerStats = {
      spa_id: Number(stats.playerId),
      player_name: stats.playerName,
      total_battles: stats.totalBattles,
      victories: stats.victories,
      defeats: stats.defeats,
      survival_rate: stats.survivalRate || 0,
      ships_used: shipsUsed
    };
    
    return playerStatsData;
  } catch (error) {
    console.error(`Error getting stats for player ${playerId}:`, error);
    throw error;
  }
}

/**
 * Get statistics for all players
 * @returns An array of player statistics
 */
export async function getAllPlayerStats(): Promise<PlayerStats[]> {
  try {
    // Get all player stats from the database
    const allStats = await db.select()
      .from(playerStats)
      .orderBy(desc(playerStats.totalBattles));
    
    // Format as PlayerStats array
    const playerStatsList: PlayerStats[] = allStats.map(stats => {
      // Parse ships_used JSON
      let shipsUsed = {};
      try {
        if (stats.shipsUsed) {
          shipsUsed = JSON.parse(stats.shipsUsed as string);
        }
      } catch (error) {
        console.error(`Error parsing ships JSON for player ${stats.playerId}:`, error);
      }
      
      return {
        spa_id: Number(stats.playerId),
        player_name: stats.playerName,
        total_battles: stats.totalBattles,
        victories: stats.victories,
        defeats: stats.defeats,
        survival_rate: stats.survivalRate || 0,
        ships_used: shipsUsed
      };
    });
    
    return playerStatsList;
  } catch (error) {
    console.error('Error getting all player stats:', error);
    throw error;
  }
}

/**
 * Get the most popular ships used in clan battles
 * @param limit The maximum number of ships to return
 * @returns An array of ships with usage statistics
 */
export async function getPopularShips(limit: number = 10): Promise<{
  ship_id: string;
  ship_name: string;
  total_battles: number;
  win_rate: number;
}[]> {
  try {
    // This would normally be a more complex query against the database
    // For now, we'll aggregate data from player stats
    const allStats = await db.select()
      .from(playerStats)
      .all();
    
    // Aggregate ship usage across all players
    const shipStats: Record<string, {
      ship_id: string;
      ship_name: string;
      total_battles: number;
      victories: number;
    }> = {};
    
    for (const player of allStats) {
      // Parse ships_used JSON
      let shipsUsed = {};
      try {
        if (player.shipsUsed) {
          shipsUsed = JSON.parse(player.shipsUsed as string);
        }
      } catch (error) {
        console.error(`Error parsing ships JSON for player ${player.playerId}:`, error);
        continue;
      }
      
      // Add each ship's stats to the aggregate
      Object.entries(shipsUsed).forEach(([shipId, data]: [string, any]) => {
        if (!shipStats[shipId]) {
          shipStats[shipId] = {
            ship_id: shipId,
            ship_name: data.ship_name || 'Unknown',
            total_battles: 0,
            victories: 0
          };
        }
        
        shipStats[shipId].total_battles += data.battles || 0;
        shipStats[shipId].victories += data.victories || 0;
      });
    }
    
    // Convert to array and sort by total battles
    const popularShips = Object.values(shipStats)
      .map(ship => ({
        ship_id: ship.ship_id,
        ship_name: ship.ship_name,
        total_battles: ship.total_battles,
        win_rate: ship.total_battles > 0 ? (ship.victories / ship.total_battles) * 100 : 0
      }))
      .sort((a, b) => b.total_battles - a.total_battles)
      .slice(0, limit);
    
    return popularShips;
  } catch (error) {
    console.error('Error getting popular ships:', error);
    throw error;
  }
}