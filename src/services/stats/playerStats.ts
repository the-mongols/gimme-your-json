// Service for calculating and managing player statistics
import { db } from '../../database/db';
import { playerBattles, playerStats } from '../../database/drizzle/schema';
import { eq, and, desc, asc } from 'drizzle-orm';
import { PlayerStats } from '../../types/wowsApi';

/**
 * Update player statistics based on battle data
 * This recalculates all player stats from the raw data
 */
export async function updatePlayerStats(): Promise<number> {
  console.log('Updating player statistics...');
  
  try {
    // Get all unique player IDs from player_battles
    const playerIdsResult = await db.select({
      player_id: playerBattles.player_id,
      player_name: playerBattles.player_name
    })
    .from(playerBattles)
    .groupBy(playerBattles.player_id);
    
    const playerIds = playerIdsResult.map(result => ({
      id: result.player_id,
      name: result.player_name
    }));
    
    console.log(`Found ${playerIds.length} players to update stats for`);
    
    // Process each player
    let updatedCount = 0;
    
    for (const player of playerIds) {
      // Get all battles for this player
      const playerBattlesData = await db.select()
        .from(playerBattles)
        .where(eq(playerBattles.player_id, player.id))
        .orderBy(desc(playerBattles.battle_id));
      
      if (playerBattlesData.length === 0) {
        console.log(`No battles found for player ${player.name} (${player.id})`);
        continue;
      }
      
      // Calculate statistics
      const totalBattles = playerBattlesData.length;
      const victories = playerBattlesData.filter(battle => battle.team_result === 'victory').length;
      const defeats = playerBattlesData.filter(battle => battle.team_result === 'defeat').length;
      const survivalCount = playerBattlesData.filter(battle => battle.survived).length;
      
      // Calculate rates
      const winRate = totalBattles > 0 ? (victories / totalBattles) * 100 : 0;
      const survivalRate = totalBattles > 0 ? (survivalCount / totalBattles) * 100 : 0;
      
      // Calculate ship usage stats
      const shipsUsed: Record<number, {
        ship_name: string;
        battles: number;
        victories: number;
        survived: number;
      }> = {};
      
      for (const battle of playerBattlesData) {
        if (!shipsUsed[battle.ship_id]) {
          shipsUsed[battle.ship_id] = {
            ship_name: battle.ship_name,
            battles: 0,
            victories: 0,
            survived: 0
          };
        }
        
        shipsUsed[battle.ship_id].battles++;
        if (battle.team_result === 'victory') {
          shipsUsed[battle.ship_id].victories++;
        }
        if (battle.survived) {
          shipsUsed[battle.ship_id].survived++;
        }
      }
      
      // Update or insert player stats
      await db.insert(playerStats)
        .values({
          player_id: player.id,
          player_name: player.name,
          total_battles: totalBattles,
          victories: victories,
          defeats: defeats,
          survival_count: survivalCount,
          ships_used: JSON.stringify(shipsUsed),
          win_rate: winRate,
          survival_rate: survivalRate,
          last_updated: Date.now()
        })
        .onConflictDoUpdate({
          target: playerStats.player_id,
          set: {
            player_name: player.name,
            total_battles: totalBattles,
            victories: victories,
            defeats: defeats,
            survival_count: survivalCount,
            ships_used: JSON.stringify(shipsUsed),
            win_rate: winRate,
            survival_rate: survivalRate,
            last_updated: Date.now()
          }
        });
      
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
 * @param player_id The player's WG account ID (spa_id)
 * @returns The player's statistics or null if not found
 */
export async function getPlayerStats(player_id: number): Promise<PlayerStats | null> {
  try {
    // Get the player's stats from the database
    const stats = await db.select()
      .from(playerStats)
      .where(eq(playerStats.player_id, player_id))
      .get();
    
    if (!stats) {
      return null;
    }
    
    // Parse ships_used JSON
    const shipsUsed = JSON.parse(stats.ships_used || '{}');
    
    // Format as PlayerStats
    const playerStats: PlayerStats = {
      spa_id: stats.player_id,
      player_name: stats.player_name,
      total_battles: stats.total_battles,
      victories: stats.victories,
      defeats: stats.defeats,
      survival_rate: stats.survival_rate,
      ships_used: shipsUsed
    };
    
    return playerStats;
  } catch (error) {
    console.error(`Error getting stats for player ${player_id}:`, error);
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
      .orderBy(desc(playerStats.total_battles));
    
    // Format as PlayerStats array
    const playerStatsList: PlayerStats[] = allStats.map(stats => {
      // Parse ships_used JSON
      const shipsUsed = JSON.parse(stats.ships_used || '{}');
      
      return {
        spa_id: stats.player_id,
        player_name: stats.player_name,
        total_battles: stats.total_battles,
        victories: stats.victories,
        defeats: stats.defeats,
        survival_rate: stats.survival_rate,
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
 * @returns An array of ships with