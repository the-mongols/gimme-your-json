// src/services/dataupdater.ts
import { db } from "../database/db.js";
import { players, ships, statHistory } from "../database/drizzle/schema.js";
import { and, eq } from "drizzle-orm";
import { getApiClientForClan } from "./wargaming/client.js";
import { calculateShipScore } from "./metrics/calculator.js";
import { Logger } from "../utils/logger.js";
import { Config } from "../utils/config.js";
import type { ClanConfig } from "../config/clans.js";

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

/**
 * Update all players' stats for all clans
 * @returns Results for each clan
 */
export async function updateAllClansPlayerStats(): Promise<{
  results: Array<{
    clan: string;
    success: number;
    failed: number;
  }>;
  totalSuccess: number;
  totalFailed: number;
}> {
  const results = [];
  let totalSuccess = 0;
  let totalFailed = 0;
  
  Logger.info("Updating player stats for all clans...");
  
  for (const clan of Object.values(Config.clans)) {
    try {
      const result = await updateClanPlayersData(clan);
      results.push({
        clan: clan.tag,
        success: result.success,
        failed: result.failed
      });
      
      totalSuccess += result.success;
      totalFailed += result.failed;
    } catch (error) {
      Logger.error(`Error updating clan ${clan.tag} players:`, error);
      results.push({
        clan: clan.tag,
        success: 0,
        failed: 0
      });
    }
  }
  
  Logger.info(`Completed player stats update for all clans. Success: ${totalSuccess}, Failed: ${totalFailed}`);
  
  return {
    results,
    totalSuccess,
    totalFailed
  };
}

/**
 * Update player data for all players in a specific clan
 * @param clan Clan configuration
 * @returns Success and failure counts
 */
export async function updateClanPlayersData(clan: ClanConfig): Promise<{
  success: number;
  failed: number;
}> {
  Logger.info(`Updating player data for clan ${clan.tag}...`);
  
  // Get all player IDs for this clan
  const allPlayers = await db.select({ id: players.id })
    .from(players)
    .where(eq(players.clanId, clan.id.toString()));
  
  let successCount = 0;
  let failCount = 0;
  
  for (const player of allPlayers) {
    try {
      // Update the player's data
      await updatePlayerData(player.id, clan);
      successCount++;
    } catch (error) {
      Logger.error(`Error updating player ${player.id} in clan ${clan.tag}:`, error);
      failCount++;
    }
  }
  
  Logger.info(`Completed player data update for clan ${clan.tag}. Success: ${successCount}, Failed: ${failCount}`);
  
  return {
    success: successCount,
    failed: failCount
  };
}

/**
 * Update a single player's data for a specific clan
 * @param accountId WG Account ID
 * @param clan Clan configuration
 */
export async function updatePlayerData(accountId: string, clan: ClanConfig): Promise<void> {
  try {
    Logger.debug(`Updating player ${accountId} data for clan ${clan.tag}...`);
    
    // Get API client for this clan's region
    const apiClient = getApiClientForClan(clan.tag);
    
    // Fetch player info
    const playerData = await apiClient.getPlayerById(accountId);
    
    // Update player timestamp
    await db.update(players)
      .set({ lastUpdated: Date.now() })
      .where(
        and(
          eq(players.id, accountId),
          eq(players.clanId, clan.id.toString())
        )
      );
    
    // Fetch player's ships data
    const shipsData = await apiClient.getPlayerShips(accountId);
    
    // Process each ship
    for (const shipData of shipsData) {
      // Skip ships with no battles
      if (!shipData.pvp || !shipData.pvp.battles || shipData.pvp.battles === 0) {
        continue;
      }
      
      // Get additional ship info from encyclopedia
      const shipInfo = await apiClient.getShipInfo(shipData.ship_id);
      
      // Calculate metrics
      const battles = shipData.pvp.battles;
      const wins = shipData.pvp.wins;
      const survived = shipData.pvp.survived_battles;
      
      const winRate = (wins / battles) * 100;
      const survivalRate = (survived / battles) * 100;
      const damageAvg = shipData.pvp.damage_dealt / battles;
      
      // Calculate ship score
      const shipScore = calculateShipScore({
        shipType: shipInfo.type,
        tier: shipInfo.tier,
        winRate,
        survivalRate,
        damageAvg,
        battles,
        fragAvg: shipData.pvp.frags / battles
      });
      
      // Map API ship type codes to readable types
      const typeMap: Record<string, string> = {
        "Destroyer": "DD",
        "Cruiser": "CA",
        "Battleship": "BB",
        "AirCarrier": "CV",
        "Submarine": "SS"
      };
      
      // Update or insert ship data
      await db.insert(ships)
        .values({
          id: shipData.ship_id,
          playerId: accountId,
          clanId: clan.id.toString(),
          name: shipInfo.name,
          tier: shipInfo.tier,
          type: typeMap[shipInfo.type] || shipInfo.type,
          nation: shipInfo.nation,
          battles: battles,
          wins: wins,
          survived: survived,
          winRate: winRate,
          survivalRate: survivalRate,
          damageAvg: damageAvg,
          fragAvg: shipData.pvp.frags / battles,
          shipScore: shipScore,
          lastPlayed: shipData.last_battle_time,
          lastUpdated: Date.now()
        })
        .onConflictDoUpdate({
          target: [ships.id, ships.playerId, ships.clanId],
          set: {
            battles: battles,
            wins: wins,
            survived: survived,
            winRate: winRate,
            survivalRate: survivalRate,
            damageAvg: damageAvg,
            fragAvg: shipData.pvp.frags / battles,
            shipScore: shipScore,
            lastPlayed: shipData.last_battle_time,
            lastUpdated: Date.now()
          }
        });
      
      // Update ship history
      await updateShipHistory(
        shipData.ship_id, 
        accountId, 
        clan.id.toString(),
        {
          battles: battles,
          winRate: winRate,
          damageAvg: damageAvg,
          shipScore: shipScore
        }
      );
    }
    
    Logger.debug(`Updated data for player ${accountId} in clan ${clan.tag}`);
  } catch (error) {
    Logger.error(`Error updating player data (${accountId}) for clan ${clan.tag}:`, error);
    throw error;
  }
}

/**
 * Update ship history for tracking over time
 * @param shipId Ship ID
 * @param playerId Player ID
 * @param clanId Clan ID
 * @param stats Ship statistics
 */
async function updateShipHistory(
  shipId: string, 
  playerId: string,
  clanId: string,
  stats: { battles: number; winRate: number; damageAvg: number; shipScore: number; }
): Promise<void> {
  try {
    // Get the current date (midnight)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const timestamp = today.getTime();
    
    // Insert or update history record for today
    await db.insert(statHistory)
      .values({
        shipId: shipId,
        playerId: playerId,
        clanId: clanId,
        date: timestamp,
        battles: stats.battles,
        winRate: stats.winRate,
        damageAvg: stats.damageAvg,
        shipScore: stats.shipScore
      })
      .onConflictDoUpdate({
        target: [statHistory.shipId, statHistory.playerId, statHistory.clanId, statHistory.date],
        set: {
          battles: stats.battles,
          winRate: stats.winRate,
          damageAvg: stats.damageAvg,
          shipScore: stats.shipScore
        }
      });
  } catch (error) {
    Logger.error(`Error updating ship history (${shipId}, ${playerId}, ${clanId}):`, error);
    // Don't throw - this is a non-critical operation
  }
}

/**
 * Update data for a specific player in a specific clan
 * @param accountId Player's WG account ID
 * @param clanTag Clan tag (e.g., "PN31")
 */
export async function updatePlayerInClan(accountId: string, clanTag: string): Promise<void> {
  const clan = Object.values(Config.clans).find(c => c.tag === clanTag);
  
  if (!clan) {
    throw new Error(`Clan with tag "${clanTag}" not found in configuration`);
  }
  
  await updatePlayerData(accountId, clan);
}

/**
 * Add a new player to a clan's roster
 * @param accountId WG account ID
 * @param discordId Discord user ID
 * @param clanTag Clan tag to add player to
 * @param playerName Optional player name (will be fetched if not provided)
 * @param playerClanTag Optional in-game clan tag
 */
export async function addPlayerToClan(
  accountId: string,
  discordId: string,
  clanTag: string,
  playerName?: string | null,
  playerClanTag?: string | null
): Promise<void> {
  const clan = Object.values(Config.clans).find(c => c.tag === clanTag);
  
  if (!clan) {
    throw new Error(`Clan with tag "${clanTag}" not found in configuration`);
  }
  
  // Check if player is already in this clan's roster
  const existingPlayer = await db.select()
    .from(players)
    .where(
      and(
        eq(players.id, accountId),
        eq(players.clanId, clan.id.toString())
      )
    )
    .get();
  
  if (existingPlayer) {
    throw new Error(`Player with ID ${accountId} is already in clan ${clanTag}'s roster`);
  }
  
  // Get API client for this clan's region
  const apiClient = getApiClientForClan(clanTag);
  
  // If player name wasn't provided, fetch it from the API
  let finalPlayerName = playerName;
  let finalClanTag = playerClanTag;
  
  if (!finalPlayerName) {
    try {
      const playerData = await apiClient.getPlayerById(accountId);
      finalPlayerName = playerData.nickname;
      
      // If clan info is available and clan tag wasn't manually provided
      if (playerData.clan && !finalClanTag) {
        finalClanTag = playerData.clan.tag;
      }
    } catch (error) {
      Logger.error(`Error fetching player data from API: ${accountId}`, error);
      throw new Error(`Could not fetch player name from WG API. You'll need to provide it manually.`);
    }
  }
  
  if (!finalPlayerName) {
    throw new Error(`Player name is required. Either provide it manually or ensure the WG API is accessible.`);
  }
  
  // Insert the player into the database
  await db.insert(players).values({
    id: accountId,
    clanId: clan.id.toString(),
    username: finalPlayerName,
    discordId: discordId,
    clanTag: finalClanTag,
    lastUpdated: Date.now()
  });
  
  Logger.info(`Added player ${finalPlayerName} to clan ${clanTag}`);
  
  // Schedule an immediate data update for this player
  try {
    await updatePlayerData(accountId, clan);
    Logger.info(`Updated data for new player ${finalPlayerName} in clan ${clanTag}`);
  } catch (error) {
    // Log but don't throw - adding was successful, data update can be retried later
    Logger.error(`Initial data update failed for player ${finalPlayerName} in clan ${clanTag}:`, error);
  }
}