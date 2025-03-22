// src/services/wargaming/clanbattles.ts
import { db } from "../../database/db.js";
import { clanBattles, clanBattleTeams, clanBattlePlayers } from "../../database/drizzle/schema.js";
import { eq, and, inArray, gte, lte, desc } from "drizzle-orm";
import { Logger } from "../../utils/logger.js";
import { Config } from "../../utils/config.js";
import { wgApi, getApiClientForClan } from "./client.js";
import type { ClanConfig } from "../../config/clans.js";

// Interface for the battle data structure
interface Battle {
  cluster_id: number;
  finished_at: string;
  realm: string;
  season_number: number;
  map_id: number;
  map: {
    name: string;
  };
  arena_id: number;
  id: number;
  teams: Team[];
}

interface Team {
  result: string;
  stage: any;
  players: Player[];
  division?: number;
  league?: number;
  division_rating?: number;
  team_number?: number;
  rating_delta?: number;
  id?: number;
  clan_id?: number;
  claninfo?: {
    members_count: number;
    realm: string;
    disbanded: boolean;
    hex_color: string;
    tag: string;
    name: string;
    id: number;
    color: string;
  };
}

interface Player {
  survived: boolean;
  nickname: string;
  result_id: number;
  name: string;
  ship: {
    level: number;
    name: string;
    icons: {
      dead: string;
      alive: string;
    };
  };
  vehicle_id: number;
  spa_id: number;
  clan_id: number;
}

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
    throw new Error(`Clan with tag "${clanTag}" not found in configuration`);
  }
  
  try {
    Logger.info(`Fetching clan battles data for ${clan.tag}...`);
    
    // Get API client for this clan
    const apiClient = getApiClientForClan(clan.tag);
    
    // Fetch data for team 1 and team 2
    const team1Data = await apiClient.getClanBattles(1) as Record<string, Battle>;
    const team2Data = await apiClient.getClanBattles(2) as Record<string, Battle>;
    
    // Process the data
    const team1Battles = Object.values(team1Data);
    const team2Battles = Object.values(team2Data);
    
    // Merge and deduplicate battles
    const allBattles = [...team1Battles, ...team2Battles];
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
    Logger.error(`Error fetching clan battles data for ${clan.tag}:`, error);
    throw error;
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
    throw new Error(`Clan with tag "${clanTag}" not found in configuration`);
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
    
    // Calculate stats
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
        .where(eq(clanBattleTeams.id, entry.teamId))
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
    Logger.error(`Error getting ${clanTag} player stats:`, error);
    throw error;
  }
}