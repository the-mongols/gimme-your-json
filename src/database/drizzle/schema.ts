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