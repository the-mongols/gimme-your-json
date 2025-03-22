// src/database/drizzle/schema.ts
import { sqliteTable, text, real, integer, primaryKey } from "drizzle-orm/sqlite-core";

// Player table definition - now with clan_id
export const players = sqliteTable("players", {
  id: text("id").notNull(),               // WG account ID
  clanId: text("clan_id").notNull(),      // Clan ID for multi-clan support
  username: text("username").notNull(),   // In-game name
  discordId: text("discord_id").notNull(),// Discord user ID
  wgClanId: text("wg_clan_id"),           // Optional actual clan ID from WG
  clanTag: text("clan_tag"),              // Optional clan tag from WG
  tierAverages: text("tier_averages", { mode: "json" }), // JSON of tier averages
  lastUpdated: integer("last_updated"),   // Timestamp
}, (table) => ({
  // Composite primary key of player ID and clan ID
  pk: primaryKey({ columns: [table.id, table.clanId] })
}));

// Ship table definition - modified to include clan_id
export const ships = sqliteTable("ships", {
  id: text("id").notNull(),                  // Ship ID
  playerId: text("player_id").notNull(),     // Player ID
  clanId: text("clan_id").notNull(),         // Clan ID for multi-clan support
  name: text("name").notNull(),              // Ship name
  tier: integer("tier").notNull(),           // Ship tier
  type: text("type").notNull(),              // DD, CA, BB, CV
  nation: text("nation"),                    // Ship nation

  // Core stats
  battles: integer("battles").notNull(),
  wins: integer("wins").notNull(),
  survived: integer("survived").notNull(),
  
  // Performance metrics
  winRate: real("win_rate"),
  survivalRate: real("survival_rate"),
  damageAvg: real("damage_avg"),
  fragAvg: real("frag_avg"),
  xpAvg: real("xp_avg"),
  
  // Compound metrics
  shipScore: real("ship_score"),             // Primary WAR-like metric
  expectedDamage: real("expected_damage"),   // Expected damage for this ship
  damageRatio: real("damage_ratio"),         // Player damage / expected
  
  // Ship metadata
  lastPlayed: integer("last_played"),        // When ship was last played
  lastUpdated: integer("last_updated"),      // When stats were updated
}, (table) => ({
  // Composite primary key
  pk: primaryKey({ columns: [table.id, table.playerId, table.clanId] }),
  // Reference to players table with cascade delete
  playerRef: primaryKey({ 
    columns: [table.playerId, table.clanId],
    name: "fk_player_ref" 
  })
}));

// Track history for reports and trends - with clan_id
export const statHistory = sqliteTable(
  "stat_history", 
  {
    shipId: text("ship_id").notNull(),
    playerId: text("player_id").notNull(),
    clanId: text("clan_id").notNull(),       // Clan ID for multi-clan support
    date: integer("date").notNull(),         // Timestamp
    battles: integer("battles").notNull(),
    winRate: real("win_rate"),
    damageAvg: real("damage_avg"),
    shipScore: real("ship_score"),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.shipId, table.playerId, table.clanId, table.date] })
  })
);

// Store optimized lineup configurations - with clan_id
export const lineups = sqliteTable("lineups", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  clanId: text("clan_id").notNull(),         // Clan ID for multi-clan support
  name: text("name").notNull(),
  description: text("description"),
  createdAt: integer("created_at").notNull(),
  totalScore: real("total_score"),           // Calculated team score
  config: text("config", { mode: "json" }).notNull(), // Lineup configuration
});

// Track which ships are used in which lineups
export const lineupShips = sqliteTable(
  "lineup_ships", 
  {
    lineupId: integer("lineup_id").notNull()
      .references(() => lineups.id, { onDelete: "cascade" }),
    shipId: text("ship_id").notNull(),
    playerId: text("player_id").notNull(),
    clanId: text("clan_id").notNull(),        // Clan ID for multi-clan support
    position: text("position"),               // Position in lineup (e.g. "DD1")
  },
  (table) => ({
    pk: primaryKey({ columns: [table.lineupId, table.shipId, table.playerId, table.clanId] })
  })
);

// Movies table (from earlier migration)
export const movies = sqliteTable("movies", {
  id: integer("id").primaryKey(),
  title: text("title"),
  releaseYear: integer("release_year")
});

// Clan battles tables - already clan-specific by design
export const clanBattles = sqliteTable("clan_battles", {
  id: text("id").notNull(),
  clanId: text("clan_id").notNull(),          // Which clan this battle belongs to
  clusterId: integer("cluster_id"),
  finishedAt: text("finished_at"),
  realm: text("realm"),
  seasonNumber: integer("season_number"),
  mapId: integer("map_id"),
  mapName: text("map_name"),
  arenaId: integer("arena_id"),
  createdAt: integer("created_at"),
}, (table) => ({
  pk: primaryKey({ columns: [table.id, table.clanId] })
}));

// Team data for clan battles
export const clanBattleTeams = sqliteTable("clan_battle_teams", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  battleId: text("battle_id").notNull(),
  clanId: text("clan_id").notNull(),          // Which clan this team belongs to
  teamNumber: integer("team_number"),
  result: text("result"),
  league: integer("league"),
  division: integer("division"),
  divisionRating: integer("division_rating"),
  ratingDelta: integer("rating_delta"),
  wgClanId: integer("wg_clan_id"),            // Renamed from clanId to wgClanId for clarity
  clanTag: text("clan_tag"),
  clanName: text("clan_name"),
});

// Player data for clan battles
export const clanBattlePlayers = sqliteTable("clan_battle_players", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  battleId: text("battle_id").notNull(),
  clanId: text("clan_id").notNull(),           // Which clan this player entry belongs to
  teamId: integer("team_id", { mode: "number" }).notNull(),
  playerId: text("player_id"),
  playerName: text("player_name"),
  survived: integer("survived"),
  shipId: text("ship_id"),
  shipName: text("ship_name"),
  shipLevel: integer("ship_level"),
  isClanMember: integer("is_clan_member"),     // Renamed from isPN31 to be more generic
});

// Player statistics - with clan_id
export const playerStats = sqliteTable("player_stats", {
  playerId: text("player_id").notNull(),
  clanId: text("clan_id").notNull(),           // Clan ID for multi-clan support
  playerName: text("player_name").notNull(),
  totalBattles: integer("total_battles").notNull().default(0),
  victories: integer("victories").notNull().default(0),
  defeats: integer("defeats").notNull().default(0),
  survivalCount: integer("survival_count").notNull().default(0),
  shipsUsed: text("ships_used", { mode: "json" }),
  winRate: real("win_rate").default(0),
  survivalRate: real("survival_rate").default(0),
  lastUpdated: integer("last_updated").notNull().default(0),
}, (table) => ({
  pk: primaryKey({ columns: [table.playerId, table.clanId] })
}));