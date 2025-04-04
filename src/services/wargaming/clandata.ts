// Service for fetching Clan Battles data from Wargaming API
import type { ClanBattlesResponse, ParsedBattleData, ParsedPlayerData } from '../../types/wowsAPI.js';
import { db } from '../../database/db.js';
import { clanBattles, clanBattleTeams, clanBattlePlayers } from '../../database/drizzle/schema.js';
import { eq } from 'drizzle-orm';
import { Logger } from '../../utils/logger.js';
import { Config } from '../../utils/config.js';

// These would normally be in environment variables
const WOWS_CLAN_ID = 1000072593; // PN31 clan ID
const WOWS_COOKIES = process.env.WOWS_COOKIES || '';
const WOWS_API_URL = 'https://clans.worldofwarships.com/api/ladder/battles/?team=1';

/**
 * Fetch clan battles data from the WG API
 * @returns The API response containing clan battles data
 */
export async function fetchClanBattles(): Promise<ClanBattlesResponse> {
  console.log('Fetching clan battles data from WG API...');
  
  try {
    // Prepare cookies for authentication
    let cookieString = '';
    
    if (WOWS_COOKIES) {
      cookieString = WOWS_COOKIES;
      console.log('Using WoWS cookies from environment variables');
    } else {
      console.warn('No WoWS cookies found in environment variables. Authentication may fail.');
    }
    
    // Make the API request
    const response = await fetch(WOWS_API_URL, {
      headers: {
        'Cookie': cookieString,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
      }
    });
    
    if (!response.ok) {
      throw new Error(`API responded with status: ${response.status}`);
    }
    
    // Parse the JSON response
    const data = await response.json() as ClanBattlesResponse;
    console.log(`Successfully fetched ${data.length} clan battles`);
    
    return data;
  } catch (error) {
    console.error('Error fetching clan battles data:', error);
    throw error;
  }
}

/**
 * Parse the clan battles data and extract relevant information
 * @param battles The clan battles data from the API
 * @returns An object containing parsed battle and player data
 */
export function parseClanBattlesData(battles: ClanBattlesResponse): {
  battleData: ParsedBattleData[],
  playerData: ParsedPlayerData[]
} {
  console.log(`Parsing ${battles.length} clan battles...`);
  
  const battleData: ParsedBattleData[] = [];
  const playerData: ParsedPlayerData[] = [];
  
  // Process each battle
  for (const battle of battles) {
    // Find our clan's team
    const ourTeam = battle.teams.find(team => team.clan_id === WOWS_CLAN_ID);
    const enemyTeam = battle.teams.find(team => team.clan_id !== WOWS_CLAN_ID);
    
    if (!ourTeam || !enemyTeam) {
      console.warn(`Skipping battle ${battle.id}: Cannot identify our team or enemy team`);
      continue;
    }
    
    // Extract battle data
    const parsedBattle: ParsedBattleData = {
      battle_id: battle.id,
      map_name: battle.map.name,
      map_id: battle.map_id,
      finished_at: battle.finished_at,
      season_number: battle.season_number,
      team_id: ourTeam.id || 0,
      clan_id: ourTeam.clan_id,
      clan_tag: ourTeam.claninfo.tag,
      result: ourTeam.result,
      league: ourTeam.league || 0,
      division: ourTeam.division || 0,
      division_rating: ourTeam.division_rating || 0,
      rating_delta: ourTeam.rating_delta || 0
    };
    
    battleData.push(parsedBattle);
    
    // Extract player data for our clan's players
    for (const player of ourTeam.players) {
      const parsedPlayer: ParsedPlayerData = {
        battle_id: battle.id,
        player_id: player.spa_id,
        player_name: player.nickname,
        clan_id: ourTeam.clan_id,
        ship_id: player.vehicle_id,
        ship_name: player.ship.name,
        ship_tier: player.ship.level,
        survived: player.survived,
        team_result: ourTeam.result
      };
      
      playerData.push(parsedPlayer);
    }
  }
  
  console.log(`Parsed ${battleData.length} battles with ${playerData.length} player entries`);
  
  return { battleData, playerData };
}

/**
 * Save the parsed data to the database
 * @param battleData The parsed battle data
 * @param playerData The parsed player data
 */
export async function saveClanBattlesData(
  battleData: ParsedBattleData[],
  playerData: ParsedPlayerData[]
): Promise<void> {
  console.log('Saving clan battles data to database...');
  
  try {
    // Begin a transaction for data consistency
    await db.transaction(async (tx) => {
      // Process battles
      for (const battle of battleData) {
        // Conform to database schema
        const battleRecord = {
          id: battle.battle_id.toString(),
          clanId: battle.clan_id.toString(),
          clusterId: 0, // Placeholder
          finishedAt: battle.finished_at,
          realm: "na", // Default
          seasonNumber: battle.season_number,
          mapId: battle.map_id,
          mapName: battle.map_name,
          arenaId: 0, // Placeholder
          createdAt: Date.now()
        };
        
        // Check if battle already exists
        const existingBattle = await tx.select()
          .from(clanBattles)
          .where(
            eq(clanBattles.id, battleRecord.id)
          )
          .get();
        
        if (existingBattle) {
          console.log(`Battle ${battle.battle_id} already exists, skipping...`);
          continue;
        }
        
        // Insert new battle
        await tx.insert(clanBattles).values(battleRecord);
        console.log(`Saved battle ${battle.battle_id}`);
        
        // Insert team data
        const teamRecord = {
          battleId: battle.battle_id.toString(),
          clanId: battle.clan_id.toString(),
          teamNumber: 1, // Default
          result: battle.result,
          league: battle.league,
          division: battle.division,
          divisionRating: battle.division_rating,
          ratingDelta: battle.rating_delta,
          wgClanId: battle.clan_id,
          clanTag: battle.clan_tag,
          clanName: "" // Placeholder
        };
        
        const teamInsert = await tx.insert(clanBattleTeams)
          .values(teamRecord)
          .returning();
        
        const teamId = teamInsert[0]?.id;
        
        if (!teamId) {
          console.error(`Failed to insert team for battle ${battle.battle_id}`);
          continue;
        }
        
        // Find the corresponding player data for this battle
        const battlePlayers = playerData.filter(p => p.battle_id === battle.battle_id);
        
        // Insert player data
        for (const player of battlePlayers) {
          const playerRecord = {
            battleId: player.battle_id.toString(),
            clanId: battle.clan_id.toString(),
            teamId: teamId,
            playerId: player.player_id.toString(),
            playerName: player.player_name,
            survived: player.survived ? 1 : 0,
            shipId: player.ship_id.toString(),
            shipName: player.ship_name,
            shipLevel: player.ship_tier,
            isClanMember: 1 // Default for our clan members
          };
          
          await tx.insert(clanBattlePlayers).values(playerRecord);
        }
      }
    });
    
    console.log('Successfully saved clan battles data to database');
  } catch (error) {
    console.error('Error saving clan battles data:', error);
    throw error;
  }
}

/**
 * Fetch, parse, and save clan battles data
 * @returns A summary of the operation
 */
export async function updateClanBattlesData(): Promise<{
  status: string;
  battles_processed: number;
  player_entries: number;
  timestamp: string;
}> {
  try {
    // Fetch data from API
    const battles = await fetchClanBattles();
    
    // Parse the data
    const { battleData, playerData } = parseClanBattlesData(battles);
    
    // Save the data to the database
    await saveClanBattlesData(battleData, playerData);
    
    // Return a summary
    return {
      status: 'success',
      battles_processed: battleData.length,
      player_entries: playerData.length,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('Error updating clan battles data:', error);
    throw error;
  }
}