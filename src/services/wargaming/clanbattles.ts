import { db } from "../../database/db.js";
import { clan_battles, clan_battle_teams, clan_battle_players } from "../../database/drizzle/schema";

import { eq, and, inArray, gte, lte, desc } from "drizzle-orm";

// API URLs
const TEAM1_API_URL = "https://clans.worldofwarships.com/api/ladder/battles/?team=1";
const TEAM2_API_URL = "https://clans.worldofwarships.com/api/ladder/battles/?team=2";

// PN31 clan information - adjust as needed
const PN31_CLAN_TAG = "PN31"; // The clan tag to look for

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

// Function to fetch clan battles data
export async function fetchClanBattlesData(): Promise<{
  processed: number;
  newBattles: number;
  pn31Players: number;
}> {
  try {
    console.log("Fetching clan battles data...");
    
    // Get the authentication cookies from environment variables
    const wowsCookies = process.env.WOWS_COOKIES;
    
    if (!wowsCookies) {
      throw new Error("WOWS_COOKIES environment variable is not set");
    }
    
    // Prepare the headers
    const headers = {
      'Cookie': wowsCookies,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
    };
    
    // Fetch data for team 1
    const team1Response = await fetch(TEAM1_API_URL, { headers });
    if (!team1Response.ok) {
      throw new Error(`Team 1 API responded with status: ${team1Response.status}`);
    }
    
    // Fetch data for team 2
    const team2Response = await fetch(TEAM2_API_URL, { headers });
    if (!team2Response.ok) {
      throw new Error(`Team 2 API responded with status: ${team2Response.status}`);
    }
    
    // Parse the responses
    const team1Data = await team1Response.json();
    const team2Data = await team2Response.json();
    
    // Process the data
    const team1Battles = Object.values(team1Data) as Battle[];
    const team2Battles = Object.values(team2Data) as Battle[];
    
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
    
    console.log(`Found ${uniqueBattles.length} unique battles`);
    
    // Process and store battles
    let newBattlesCount = 0;
    let pn31PlayersCount = 0;
    
    for (const battle of uniqueBattles) {
      // Check if battle already exists in database
      const battleIdStr = battle.id.toString();
      const existingBattle = await db.select()
        .from(clan_battles)
        .where(eq(clan_battles.id, battleIdStr))
        .get();
        
      if (existingBattle) {
        continue; // Skip existing battles
      }
      
      newBattlesCount++;
      
      // Insert battle data
      await db.insert(clan_battles).values({
        id: battleIdStr,
        cluster_id: battle.cluster_id,
        finished_at: battle.finished_at,
        realm: battle.realm,
        season_number: battle.season_number,
        map_id: battle.map_id,
        map_name: battle.map.name,
        arena_id: battle.arena_id,
        created_at: Date.now()
      });
      
      // Process teams
      for (const team of battle.teams) {
        // Insert team data
        await db.insert(clan_battle_teams).values({
          battle_id: battleIdStr,
          team_number: team.team_number ?? 0,
          result: team.result,
          league: team.league ?? null,
          division: team.division ?? null,
          division_rating: team.division_rating ?? null,
          rating_delta: team.rating_delta ?? null,
          clan_id: team.claninfo?.id ?? null,
          clan_tag: team.claninfo?.tag ?? null,
          clan_name: team.claninfo?.name ?? null
        });
        
        // Get the last inserted team
        const teams = await db.select()
          .from(clan_battle_teams)
          .where(and(
            eq(clan_battle_teams.battle_id, battleIdStr),
            team.team_number !== undefined 
              ? eq(clan_battle_teams.team_number, team.team_number) 
              : undefined
          ))
          .orderBy(desc(clan_battle_teams.id))
          .limit(1)
          .all();
        
        if (teams.length === 0) {
          console.error("Failed to retrieve inserted team");
          continue;
        }
        
        const latestTeam = teams[0];
        
        // Process players
        for (const player of team.players) {
          // Check if player is from PN31
          const isPN31 = team.claninfo?.tag === PN31_CLAN_TAG ? 1 : 0;
          
          if (isPN31 === 1) {
            pn31PlayersCount++;
          }
          
          await db.insert(clan_battle_players).values({
            battle_id: battleIdStr,
            team_id: latestTeam.id,
            player_id: player.spa_id.toString(),
            player_name: player.nickname,
            survived: player.survived ? 1 : 0,
            ship_id: player.vehicle_id.toString(),
            ship_name: player.ship.name,
            ship_level: player.ship.level,
            is_pn31: isPN31
          });
        }
      }
    }
    
    console.log(`Processed ${uniqueBattles.length} battles, ${newBattlesCount} new battles, found ${pn31PlayersCount} PN31 player entries`);
    
    return {
      processed: uniqueBattles.length,
      newBattles: newBattlesCount,
      pn31Players: pn31PlayersCount
    };
  } catch (error) {
    console.error("Error fetching clan battles data:", error);
    throw error;
  }
}

// Get PN31 player stats for a given time period
export async function getPN31PlayerStats(startDate?: Date, endDate?: Date) {
  try {
    // Set default dates if not provided
    const end = endDate || new Date();
    const start = startDate || new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000); // Default to 30 days back
    
    // Convert dates to strings
    const startStr = start.toISOString();
    const endStr = end.toISOString();
    
    // Query battles in the date range
    const battles = await db.select()
      .from(clan_battles)
      .where(
        and(
          gte(clan_battles.finished_at, startStr),
          lte(clan_battles.finished_at, endStr)
        )
      )
      .all();
    
    const battleIds = battles.map(b => b.id);
    
    // Get PN31 player data
    const playerData = await db.select()
      .from(clan_battle_players)
      .where(
        and(
          inArray(clan_battle_players.battle_id, battleIds),
          eq(clan_battle_players.is_pn31, 1)
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
      if (!entry.player_id) continue;
      
      // Get team data to determine if it's a win
      const team = await db.select()
        .from(clan_battle_teams)
        .where(eq(clan_battle_teams.id, entry.team_id))
        .get();
      
      const isWin = team?.result === "win";
      
      if (!playerStats[entry.player_id]) {
        playerStats[entry.player_id] = {
          playerId: entry.player_id,
          playerName: entry.player_name || "Unknown",
          battles: 0,
          wins: 0,
          survived: 0,
          shipUsage: {},
          survivalRate: 0,
          winRate: 0
        };
      }
      
      const stats = playerStats[entry.player_id];
      stats.battles++;
      if (isWin) stats.wins++;
      if (entry.survived === 1) stats.survived++;
      
      // Track ship usage
      const shipName = entry.ship_name || "Unknown Ship";
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
    console.error("Error getting PN31 player stats:", error);
    throw error;
  }
}