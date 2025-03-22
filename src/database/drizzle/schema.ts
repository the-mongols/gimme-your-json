// src/database/drizzle/schema.ts
import { sqliteTable, text, real, integer, primaryKey } from "drizzle-orm/sqlite-core";

// Player table definition
export const players = sqliteTable("players", {
  id: text("id").primaryKey(),                  // WG account ID
  username: text("username").notNull(),         // In-game name
  discordId: text("discord_id").notNull(),      // Discord user ID
  clanId: text("clan_id"),                      // Optional clan ID
  clanTag: text("clan_tag"),                    // Optional clan tag
  tierAverages: text("tier_averages", { mode: "json" }), // JSON of tier averages
  lastUpdated: integer("last_updated"),         // Timestamp
});

// Ship table definition
export const ships = sqliteTable("ships", {
  id: text("id").primaryKey(),                  // Ship ID
  playerId: text("player_id").notNull()         // Player relationship
    .references(() => players.id, { onDelete: "cascade" }),
  name: text("name").notNull(),                 // Ship name
  tier: integer("tier").notNull(),              // Ship tier
  type: text("type").notNull(),                 // DD, CA, BB, CV
  nation: text("nation"),                       // Ship nation

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
  
  // Your compound metrics
  shipScore: real("ship_score"),                // Primary WAR-like metric
  expectedDamage: real("expected_damage"),      // Expected damage for this ship
  damageRatio: real("damage_ratio"),            // Player damage / expected
  
  // Ship metadata
  lastPlayed: integer("last_played"),           // When ship was last played
  lastUpdated: integer("last_updated"),         // When stats were updated
});

// Track history for reports and trends
export const statHistory = sqliteTable(
  "stat_history", 
  {
    shipId: text("ship_id").notNull()
      .references(() => ships.id, { onDelete: "cascade" }),
    date: integer("date").notNull(),            // Timestamp
    battles: integer("battles").notNull(),
    winRate: real("win_rate"),
    damageAvg: real("damage_avg"),
    shipScore: real("ship_score"),
  },
  (table) => ({
    // Properly define composite primary key using the table parameter
    pk: primaryKey({ columns: [table.shipId, table.date] })
  })
);

// Store optimized lineup configurations
export const lineups = sqliteTable("lineups", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: integer("created_at").notNull(),
  totalScore: real("total_score"),              // Calculated team score
  config: text("config", { mode: "json" }).notNull(),  // Lineup configuration
});

// Track which ships are used in which lineups
export const lineupShips = sqliteTable(
  "lineup_ships", 
  {
    lineupId: integer("lineup_id").notNull()
      .references(() => lineups.id, { onDelete: "cascade" }),
    shipId: text("ship_id").notNull()
      .references(() => ships.id, { onDelete: "cascade" }),
    position: text("position"),                 // Position in lineup (e.g. "DD1")
  },
  (table) => ({
    // Properly define composite primary key using the table parameter
    pk: primaryKey({ columns: [table.lineupId, table.shipId] })
  })
);

// Movies table (from earlier migration)
export const movies = sqliteTable("movies", {
  id: integer("id").primaryKey(),
  title: text("title"),
  releaseYear: integer("release_year")
});

// Clan battles data table
export const clan_battles = sqliteTable("clan_battles", {
  id: text("id").primaryKey(),                  // Battle ID
  cluster_id: integer("cluster_id"),            // Cluster ID
  finished_at: text("finished_at"),             // Timestamp
  realm: text("realm"),                         // Server region
  season_number: integer("season_number"),      // Season number
  map_id: integer("map_id"),                    // Map ID
  map_name: text("map_name"),                   // Map name
  arena_id: integer("arena_id"),                // Arena ID
  created_at: integer("created_at"),            // When this record was created
});

// Team data for clan battles
export const clan_battle_teams = sqliteTable("clan_battle_teams", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  battle_id: text("battle_id").notNull()
    .references(() => clan_battles.id, { onDelete: "cascade" }),
  team_number: integer("team_number"),          // 1 or 2
  result: text("result"),                       // win or lose
  league: integer("league"),                    // League number
  division: integer("division"),                // Division number
  division_rating: integer("division_rating"),  // Rating
  rating_delta: integer("rating_delta"),        // Rating change
  clan_id: integer("clan_id"),                  // Clan ID
  clan_tag: text("clan_tag"),                   // Clan tag
  clan_name: text("clan_name"),                 // Clan name
});

// Player data for clan battles
export const clan_battle_players = sqliteTable("clan_battle_players", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  battle_id: text("battle_id").notNull()
    .references(() => clan_battles.id, { onDelete: "cascade" }),
  team_id: integer("team_id", { mode: "number" }).notNull()
    .references(() => clan_battle_teams.id, { onDelete: "cascade" }),
  player_id: text("player_id"),                 // Player SPA ID
  player_name: text("player_name"),             // Player nickname
  survived: integer("survived"),                // 0 or 1
  ship_id: text("ship_id"),                     // Vehicle ID
  ship_name: text("ship_name"),                 // Ship name
  ship_level: integer("ship_level"),            // Ship tier
  is_pn31: integer("is_pn31"),                  // 0 or 1 flag to indicate PN31 players
});