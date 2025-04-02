// src/services/wargaming/clanbattles.ts
import { db } from "../../database/db.js";
import { clanBattles, clanBattleTeams, clanBattlePlayers } from "../../database/drizzle/schema.js";
import { eq, and, inArray, gte, lte, desc } from "drizzle-orm";
import { Logger } from "../../utils/logger.js";
import { Config } from "../../utils/config.js";
import { handleError, ErrorCode } from "../../utils/errors.js";
import { wgApi, getApiClientForClan } from "./client.js";
import type { ClanConfig } from "../../config/clans.js";
import type { ClanBattlesResponse, Battle, Team, Player } from "../../types/wowsAPI.js";

/**
 * Fetch clan battles data for a specific clan
 * @param clanTag The clan tag to fetch data for (e.g., "PN31")
 * @returns Statistics about the operation
 */
export async function fetchClanBattlesData(clanTag?: string): Promise<{
  clan: string;
  processed: number;
  newBattles: number;
  clanMemberPlayers: number;
}> {
  const clan = clanTag 
    ? Object.values(Config.clans).find(c => c.tag === clanTag) 
    : Config.defaultClan;
    
  if (!clan) {
    throw handleError(
      "Failed to fetch clan battles data",
      `Clan with tag "${clanTag}" not found in configuration`,
      ErrorCode.CLAN_NOT_FOUND
    );
  }
  
  try {
    Logger.info(`Fetching clan battles data for ${clan.tag}...`);
    
    // Get API client for this clan
    const apiClient = getApiClientForClan(clan.tag);
    
    // Fetch data for team 1 and team 2
    let team1Data: Battle[] = [];
    let team2Data: Battle[] = [];
    
    try {
      team1Data = Object.values(await apiClient.getClanBattles(1));
    } catch (error) {
      Logger.error(`Error fetching team 1 data for clan ${clan.tag}:`, error);
      // Continue to team 2 even if team 1 fails
    }
    
    try {
      team2Data = Object.values(await apiClient.getClanBattles(2));
    } catch (error) {
      Logger.error(`Error fetching team 2 data for clan ${clan.tag}:`, error);
      // Continue processing team 1 data even if team 2 fails
    }
    
    // Merge and deduplicate battles
    const allBattles = [...team1Data, ...team2Data];
    const uniqueBattleIds = new Set<number>();
    const uniqueBattles: Battle[] = [];
    
    for (const battle of allBattles) {
      if (!uniqueBattleIds.has(battle.id)) {
        uniqueBattleIds.add(battle.id);
        uniqueBattles.push(battle);
      }
    }
    
    Logger.info(`Found ${uniqueBattles.length} unique battles for ${clan.tag}`);
    
    // Process and store battles
    let newBattlesCount = 0;
    let clanMemberPlayersCount = 0;
    
    for (const battle of uniqueBattles) {
      // Check if battle already exists in database
      const battleIdStr = battle.id.toString();
      const existingBattle = await db.select()
        .from(clanBattles)
        .where(and(
          eq(clanBattles.id, battleIdStr),
          eq(clanBattles.clanId, clan.id.toString())
        ))
        .get();
        
      if (existingBattle) {
        continue; // Skip existing battles
      }
      
      newBattlesCount++;
      
      // Insert battle data
      await db.insert(clanBattles).values({
        id: battleIdStr,
        clanId: clan.id.toString(),
        clusterId: battle.cluster_id,
        finishedAt: battle.finished_at,
        realm: battle.realm,
        seasonNumber: battle.season_number,
        mapId: battle.map_id,
        mapName: battle.map.name,
        arenaId: battle.arena_id,
        createdAt: Date.now()
      });
      
      // Process teams
      for (const team of battle.teams) {
        // Skip teams without claninfo
        if (!team.claninfo) {
          Logger.warn(`Team without claninfo in battle ${battleIdStr}, skipping...`);
          continue;
        }
        
        // Insert team data
        const teamInsert = await db.insert(clanBattleTeams).values({
          battleId: battleIdStr,
          clanId: clan.id.toString(),
          teamNumber: team.team_number ?? 0,
          result: team.result,
          league: team.league ?? null,
          division: team.division ?? null,
          divisionRating: team.division_rating ?? null,
          ratingDelta: team.rating_delta ?? null,
          wgClanId: team.claninfo?.id ?? null,
          clanTag: team.claninfo?.tag ?? null,
          clanName: team.claninfo?.name ?? null
        }).returning();
        
        const insertedTeam = teamInsert[0];
        
        if (!insertedTeam || !insertedTeam.id) {
          Logger.error(`Failed to retrieve inserted team for battle ${battleIdStr}`);
          continue;
        }
        
        // Process players
        for (const player of team.players) {
          // Check if player is from this clan
          const isClanMember = (team.claninfo?.tag === clan.tag) ? 1 : 0;
          
          if (isClanMember === 1) {
            clanMemberPlayersCount++;
          }
          
          await db.insert(clanBattlePlayers).values({
            battleId: battleIdStr,
            clanId: clan.id.toString(),
            teamId: insertedTeam.id,
            playerId: player.spa_id.toString(),
            playerName: player.nickname,
            survived: player.survived ? 1 : 0,
            shipId: player.vehicle_id.toString(),
            shipName: player.ship.name,
            shipLevel: player.ship.level,
            isClanMember: isClanMember
          });
        }
      }
    }
    
    Logger.info(`Processed ${uniqueBattles.length} battles, ${newBattlesCount} new battles, found ${clanMemberPlayersCount} ${clan.tag} player entries`);
    
    return {
      clan: clan.tag,
      processed: uniqueBattles.length,
      newBattles: newBattlesCount,
      clanMemberPlayers: clanMemberPlayersCount
    };
  } catch (error) {
    throw handleError(`Error fetching clan battles data for ${clan?.tag}`, error, ErrorCode.API_REQUEST_FAILED);
  }
}

/**
 * Fetch clan battles data for all configured clans
 * @returns Results for each clan
 */
export async function fetchAllClanBattlesData(): Promise<{
  results: Array<{
    clan: string;
    processed: number;
    newBattles: number;
    clanMemberPlayers: number;
  }>;
  totalProcessed: number;
  totalNew: number;
}> {
  const results = [];
  let totalProcessed = 0;
  let totalNew = 0;
  
  Logger.info("Fetching clan battles data for all configured clans...");
  
  for (const clan of Object.values(Config.clans)) {
    try {
      const result = await fetchClanBattlesData(clan.tag);
      results.push(result);
      totalProcessed += result.processed;
      totalNew += result.newBattles;
    } catch (error) {
      Logger.error(`Error fetching data for clan ${clan.tag}:`, error);
      results.push({
        clan: clan.tag,
        processed: 0,
        newBattles: 0,
        clanMemberPlayers: 0
      });
    }
  }
  
  Logger.info(`Completed fetching clan battles data for all clans. Processed ${totalProcessed} battles, ${totalNew} new battles.`);
  
  return {
    results,
    totalProcessed,
    totalNew
  };
}

/**
 * Get clan member player stats for a given time period
 * @param clanTag Clan tag (e.g., "PN31")
 * @param startDate Optional start date for filtering
 * @param endDate Optional end date for filtering
 * @returns Player statistics
 */
export async function getClanMemberPlayerStats(clanTag: string, startDate?: Date, endDate?: Date) {
  const clan = Object.values(Config.clans).find(c => c.tag === clanTag);
  
  if (!clan) {
    throw handleError(
      `Failed to get clan member player stats`,
      `Clan with tag "${clanTag}" not found in configuration`,
      ErrorCode.CLAN_NOT_FOUND
    );
  }
  
  try {
    Logger.info(`Getting player stats for ${clan.tag} members...`);
    
    // Set default dates if not provided
    const end = endDate || new Date();
    const start = startDate || new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000); // Default to 30 days back
    
    // Convert dates to strings
    const startStr = start.toISOString();
    const endStr = end.toISOString();
    
    // Query battles in the date range
    const battles = await db.select()
      .from(clanBattles)
      .where(
        and(
          eq(clanBattles.clanId, clan.id.toString()),
          gte(clanBattles.finishedAt, startStr),
          lte(clanBattles.finishedAt, endStr)
        )
      )
      .all();
    
    const battleIds = battles.map(b => b.id);
    
    if (battleIds.length === 0) {
      Logger.info(`No battles found for ${clan.tag} in the specified date range`);
      return [];
    }
    
    // Get clan member player data
    const playerData = await db.select()
      .from(clanBattlePlayers)
      .where(
        and(
          inArray(clanBattlePlayers.battleId, battleIds),
          eq(clanBattlePlayers.clanId, clan.id.toString()),
          eq(clanBattlePlayers.isClanMember, 1)
        )
      )
      .all();
    
    // Calculate statistics
    const playerStats: Record<string, {
      playerId: string,
      playerName: string,
      battles: number,
      wins: number,
      survived: number,
      shipUsage: Record<string, number>,
      survivalRate: number,
      winRate: number
    }> = {};
    
    for (const entry of playerData) {
      if (!entry.playerId) continue;
      
      // Get team data to determine if it's a win
      const team = await db.select()
        .from(clanBattleTeams)
        .where(
          and(
            eq(clanBattleTeams.id, entry.teamId),
            eq(clanBattleTeams.clanId, clan.id.toString())
          )
        )
        .get();
      
      const isWin = team?.result === "win";
      
      if (!playerStats[entry.playerId]) {
        playerStats[entry.playerId] = {
          playerId: entry.playerId,
          playerName: entry.playerName || "Unknown",
          battles: 0,
          wins: 0,
          survived: 0,
          shipUsage: {},
          survivalRate: 0,
          winRate: 0
        };
      }
      
      const stats = playerStats[entry.playerId];
      stats.battles++;
      if (isWin) stats.wins++;
      if (entry.survived === 1) stats.survived++;
      
      // Track ship usage
      const shipName = entry.shipName || "Unknown Ship";
      if (!stats.shipUsage[shipName]) {
        stats.shipUsage[shipName] = 0;
      }
      stats.shipUsage[shipName]++;
    }
    
    // Calculate rates
    for (const playerId in playerStats) {
      const stats = playerStats[playerId];
      stats.survivalRate = (stats.survived / stats.battles) * 100;
      stats.winRate = (stats.wins / stats.battles) * 100;
    }
    
    return Object.values(playerStats);
  } catch (error) {
    throw handleError(`Error getting ${clanTag} player stats`, error, ErrorCode.DB_QUERY_FAILED);
  }
}

/**
 * Export clan battles data to JSON
 * @param clanTag Clan tag to export data for
 * @param limit Number of battles to export (most recent first)
 * @returns JSON data of battles
 */
export async function exportClanBattlesAsJson(clanTag: string, limit: number = 50): Promise<string> {
  const clan = Object.values(Config.clans).find(c => c.tag === clanTag);
  
  if (!clan) {
    throw handleError(
      `Failed to export clan battles data`,
      `Clan with tag "${clanTag}" not found in configuration`,
      ErrorCode.CLAN_NOT_FOUND
    );
  }
  
  try {
    Logger.info(`Exporting clan battles data for ${clan.tag} (limit: ${limit})...`);
    
    // Get the most recent battles
    const battles = await db.select()
      .from(clanBattles)
      .where(eq(clanBattles.clanId, clan.id.toString()))
      .orderBy(desc(clanBattles.finishedAt))
      .limit(limit)
      .all();
      
    if (battles.length === 0) {
      return JSON.stringify({ battles: [], teams: [], players: [] });
    }
    
    const battleIds = battles.map(b => b.id);
    
    // Get teams for these battles
    const teams = await db.select()
      .from(clanBattleTeams)
      .where(
        and(
          inArray(clanBattleTeams.battleId, battleIds),
          eq(clanBattleTeams.clanId, clan.id.toString())
        )
      )
      .all();
      
    const teamIds = teams.map(t => t.id).filter(id => id !== undefined) as number[];
    
    // Get players for these teams
    const players = await db.select()
      .from(clanBattlePlayers)
      .where(
        and(
          inArray(clanBattlePlayers.teamId, teamIds),
          eq(clanBattlePlayers.clanId, clan.id.toString())
        )
      )
      .all();
      
    // Create data structure for export
    const exportData = {
      clan: {
        tag: clan.tag,
        id: clan.id,
        name: clan.name
      },
      battles,
      teams,
      players,
      metadata: {
        exportDate: new Date().toISOString(),
        recordCount: {
          battles: battles.length,
          teams: teams.length,
          players: players.length
        }
      }
    };
    
    return JSON.stringify(exportData, null, 2);
  } catch (error) {
    throw handleError(`Error exporting clan battles data for ${clanTag}`, error, ErrorCode.DB_QUERY_FAILED);
  }
}