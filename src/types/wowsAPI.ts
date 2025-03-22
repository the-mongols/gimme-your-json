// Types for World of Warships API responses
// Specifically for Clan Battle history data

export interface ShipInfo {
    icons: {
      dead: string;
      alive: string;
    };
    name: string;
    level: number;
  }
  
  export interface Player {
    spa_id: number;
    name: string;
    survived: boolean;
    ship: ShipInfo;
    vehicle_id: number;
    result_id: number;
    nickname: string;
    clan_id: number;
  }
  
  export interface ClanInfo {
    tag: string;
    color: string;
    name: string;
    id: number;
    disbanded: boolean;
    realm: string;
    members_count: number;
    hex_color: string;
  }
  
  export interface StageInfo {
    id: number;
    type: string;
    victories_required: number;
    battle_result_id: number;
    target_public_rating: number;
    progress: string[];
    target: string;
    battles: number;
    target_division: number;
    target_league: number;
    target_division_rating: number;
  }
  
  export interface Team {
    players: Player[];
    league: number;
    division: number;
    id: number;
    result: "victory" | "defeat" | "draw";
    claninfo: ClanInfo;
    team_number: number;
    rating_delta: number;
    clan_id: number;
    stage: StageInfo | null;
    division_rating: number;
  }
  
  export interface MapInfo {
    name: string;
  }
  
  export interface Battle {
    teams: Team[];
    map: MapInfo;
    map_id: number;
    id: number;
    finished_at: string;
    cluster_id: number;
    realm: string;
    season_number: number;
    arena_id: number;
  }
  
  // The complete API response is an array of Battle objects
  export type ClanBattlesResponse = Battle[];
  
  // Define the structure for parsed battle data to be stored in the database
  export interface ParsedBattleData {
    battle_id: number;
    map_name: string;
    map_id: number;
    finished_at: string;
    season_number: number;
    team_id: number;
    clan_id: number;
    clan_tag: string;
    result: string;
    league: number;
    division: number;
    division_rating: number;
    rating_delta: number;
  }
  
  // Define the structure for parsed player data to be stored in the database
  export interface ParsedPlayerData {
    battle_id: number;
    player_id: number; // spa_id
    player_name: string;
    clan_id: number;
    ship_id: number;
    ship_name: string;
    ship_tier: number;
    survived: boolean;
    team_result: string;
  }
  
  // Define a type for tracking player statistics
  export interface PlayerStats {
    spa_id: number;
    player_name: string;
    total_battles: number;
    victories: number;
    defeats: number;
    survival_rate: number;
    ships_used: {
      [ship_id: number]: {
        ship_name: string;
        battles: number;
        victories: number;
        survived: number;
      }
    };
  }