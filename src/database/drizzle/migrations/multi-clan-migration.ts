// src/database/drizzle/migrations/multi-clan-migration.ts
/**
 * Migration script to update database structure for multi-clan support
 * This adds clan_id to all relevant tables and updates primary keys
 */

import { db } from "../../db.js";
import { defaultClan } from "../../../config/clans.js";
import { Logger } from "../../../utils/logger.js";
import { sql } from "drizzle-orm";

async function runMultiClanMigration() {
  Logger.info("Starting multi-clan support migration...");
  
  try {
    // Start a transaction for data consistency
    await db.transaction(async (tx) => {
      // Check if we already have the new structure
      const hasMultiClanSupport = await checkMultiClanSupport();
      if (hasMultiClanSupport) {
        Logger.info("Multi-clan support is already enabled. Skipping migration.");
        return;
      }
      
      // 1. Create backups of each table
      Logger.info("Creating table backups...");
      await tx.run(sql`CREATE TABLE IF NOT EXISTS players_backup AS SELECT * FROM players`);
      await tx.run(sql`CREATE TABLE IF NOT EXISTS ships_backup AS SELECT * FROM ships`);
      await tx.run(sql`CREATE TABLE IF NOT EXISTS stat_history_backup AS SELECT * FROM stat_history`);
      await tx.run(sql`CREATE TABLE IF NOT EXISTS lineups_backup AS SELECT * FROM lineups`);
      await tx.run(sql`CREATE TABLE IF NOT EXISTS lineup_ships_backup AS SELECT * FROM lineup_ships`);
      await tx.run(sql`CREATE TABLE IF NOT EXISTS player_stats_backup AS SELECT * FROM player_stats`);
      await tx.run(sql`CREATE TABLE IF NOT EXISTS clan_battles_backup AS SELECT * FROM clan_battles`);
      await tx.run(sql`CREATE TABLE IF NOT EXISTS clan_battle_teams_backup AS SELECT * FROM clan_battle_teams`);
      await tx.run(sql`CREATE TABLE IF NOT EXISTS clan_battle_players_backup AS SELECT * FROM clan_battle_players`);
      
      // 2. Drop existing tables
      Logger.info("Dropping existing tables...");
      await tx.run(sql`DROP TABLE IF EXISTS lineup_ships`);
      await tx.run(sql`DROP TABLE IF EXISTS lineups`);
      await tx.run(sql`DROP TABLE IF EXISTS stat_history`);
      await tx.run(sql`DROP TABLE IF EXISTS ships`);
      await tx.run(sql`DROP TABLE IF EXISTS player_stats`);
      await tx.run(sql`DROP TABLE IF EXISTS clan_battle_players`);
      await tx.run(sql`DROP TABLE IF EXISTS clan_battle_teams`);
      await tx.run(sql`DROP TABLE IF EXISTS clan_battles`);
      await tx.run(sql`DROP TABLE IF EXISTS players`);
      
      // 3. Create new tables with updated structure
      Logger.info("Creating new table structure...");
      
      // Players table with clan_id
      await tx.run(sql`
        CREATE TABLE players (
          id TEXT NOT NULL,
          clan_id TEXT NOT NULL,
          username TEXT NOT NULL,
          discord_id TEXT NOT NULL,
          wg_clan_id TEXT,
          clan_tag TEXT,
          tier_averages TEXT,
          last_updated INTEGER,
          PRIMARY KEY (id, clan_id)
        )
      `);
      
      // Ships table with clan_id
      await tx.run(sql`
        CREATE TABLE ships (
          id TEXT NOT NULL,
          player_id TEXT NOT NULL,
          clan_id TEXT NOT NULL,
          name TEXT NOT NULL,
          tier INTEGER NOT NULL,
          type TEXT NOT NULL,
          nation TEXT,
          battles INTEGER NOT NULL,
          wins INTEGER NOT NULL,
          survived INTEGER NOT NULL,
          win_rate REAL,
          survival_rate REAL,
          damage_avg REAL,
          frag_avg REAL,
          xp_avg REAL,
          ship_score REAL,
          expected_damage REAL,
          damage_ratio REAL,
          last_played INTEGER,
          last_updated INTEGER,
          PRIMARY KEY (id, player_id, clan_id),
          FOREIGN KEY (player_id, clan_id) REFERENCES players(id, clan_id) ON DELETE CASCADE
        )
      `);
      
      // Stat history with clan_id
      await tx.run(sql`
        CREATE TABLE stat_history (
          ship_id TEXT NOT NULL,
          player_id TEXT NOT NULL,
          clan_id TEXT NOT NULL,
          date INTEGER NOT NULL,
          battles INTEGER NOT NULL,
          win_rate REAL,
          damage_avg REAL,
          ship_score REAL,
          PRIMARY KEY (ship_id, player_id, clan_id, date)
        )
      `);
      
      // Lineups with clan_id
      await tx.run(sql`
        CREATE TABLE lineups (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          clan_id TEXT NOT NULL,
          name TEXT NOT NULL,
          description TEXT,
          created_at INTEGER NOT NULL,
          total_score REAL,
          config TEXT NOT NULL
        )
      `);
      
      // Lineup ships with clan_id
      await tx.run(sql`
        CREATE TABLE lineup_ships (
          lineup_id INTEGER NOT NULL,
          ship_id TEXT NOT NULL,
          player_id TEXT NOT NULL,
          clan_id TEXT NOT NULL,
          position TEXT,
          PRIMARY KEY (lineup_id, ship_id, player_id, clan_id),
          FOREIGN KEY (lineup_id) REFERENCES lineups(id) ON DELETE CASCADE
        )
      `);
      
      // Clan battles with clan_id
      await tx.run(sql`
        CREATE TABLE clan_battles (
          id TEXT NOT NULL,
          clan_id TEXT NOT NULL,
          cluster_id INTEGER,
          finished_at TEXT,
          realm TEXT,
          season_number INTEGER,
          map_id INTEGER,
          map_name TEXT,
          arena_id INTEGER,
          created_at INTEGER,
          PRIMARY KEY (id, clan_id)
        )
      `);
      
      // Clan battle teams with clan_id
      await tx.run(sql`
        CREATE TABLE clan_battle_teams (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          battle_id TEXT NOT NULL,
          clan_id TEXT NOT NULL,
          team_number INTEGER,
          result TEXT,
          league INTEGER,
          division INTEGER,
          division_rating INTEGER,
          rating_delta INTEGER,
          wg_clan_id INTEGER,
          clan_tag TEXT,
          clan_name TEXT
        )
      `);
      
      // Clan battle players with clan_id
      await tx.run(sql`
        CREATE TABLE clan_battle_players (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          battle_id TEXT NOT NULL,
          clan_id TEXT NOT NULL,
          team_id INTEGER NOT NULL,
          player_id TEXT,
          player_name TEXT,
          survived INTEGER,
          ship_id TEXT,
          ship_name TEXT,
          ship_level INTEGER,
          is_clan_member INTEGER
        )
      `);
      
      // Player stats with clan_id
      await tx.run(sql`
        CREATE TABLE player_stats (
          player_id TEXT NOT NULL,
          clan_id TEXT NOT NULL,
          player_name TEXT NOT NULL,
          total_battles INTEGER NOT NULL DEFAULT 0,
          victories INTEGER NOT NULL DEFAULT 0,
          defeats INTEGER NOT NULL DEFAULT 0,
          survival_count INTEGER NOT NULL DEFAULT 0,
          ships_used TEXT,
          win_rate REAL DEFAULT 0,
          survival_rate REAL DEFAULT 0,
          last_updated INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY (player_id, clan_id)
        )
      `);
      
      // 4. Create indexes for performance
      Logger.info("Creating indexes...");
      await tx.run(sql`CREATE INDEX idx_players_discord_id ON players(discord_id)`);
      await tx.run(sql`CREATE INDEX idx_ships_player_clan ON ships(player_id, clan_id)`);
      await tx.run(sql`CREATE INDEX idx_ships_type ON ships(type)`);
      await tx.run(sql`CREATE INDEX idx_clan_battles_season ON clan_battles(season_number)`);
      await tx.run(sql`CREATE INDEX idx_clan_battles_finished ON clan_battles(finished_at)`);
      await tx.run(sql`CREATE INDEX idx_clan_battles_clan ON clan_battles(clan_id)`);
      await tx.run(sql`CREATE INDEX idx_clan_battle_players_player ON clan_battle_players(player_id)`);
      await tx.run(sql`CREATE INDEX idx_clan_battle_players_clan ON clan_battle_players(clan_id)`);
      
      // 5. Transfer data from backup tables with default clan ID
      Logger.info("Transferring data with default clan ID...");
      const defaultClanId = defaultClan.id.toString();
      
      // Transfer players
      await tx.run(sql`
        INSERT INTO players (id, clan_id, username, discord_id, wg_clan_id, clan_tag, tier_averages, last_updated)
        SELECT id, ${defaultClanId}, username, discord_id, clan_id, clan_tag, tier_averages, last_updated FROM players_backup
      `);
      
      // Transfer ships
      await tx.run(sql`
        INSERT INTO ships (id, player_id, clan_id, name, tier, type, nation, battles, wins, survived, 
                         win_rate, survival_rate, damage_avg, frag_avg, xp_avg, ship_score, 
                         expected_damage, damage_ratio, last_played, last_updated)
        SELECT id, player_id, ${defaultClanId}, name, tier, type, nation, battles, wins, survived, 
              win_rate, survival_rate, damage_avg, frag_avg, xp_avg, ship_score, 
              expected_damage, damage_ratio, last_played, last_updated FROM ships_backup
      `);
      
      // Transfer stat history (if table exists)
      const statHistoryExists = await checkTableExists('stat_history_backup');
      if (statHistoryExists) {
        await tx.run(sql`
          INSERT INTO stat_history (ship_id, player_id, clan_id, date, battles, win_rate, damage_avg, ship_score)
          SELECT ship_id, player_id, ${defaultClanId}, date, battles, win_rate, damage_avg, ship_score FROM stat_history_backup
        `);
      }
      
      // Transfer lineups (if table exists)
      const lineupsExists = await checkTableExists('lineups_backup');
      if (lineupsExists) {
        await tx.run(sql`
          INSERT INTO lineups (id, clan_id, name, description, created_at, total_score, config)
          SELECT id, ${defaultClanId}, name, description, created_at, total_score, config FROM lineups_backup
        `);
      }
      
      // Transfer lineup ships (if table exists)
      const lineupShipsExists = await checkTableExists('lineup_ships_backup');
      if (lineupShipsExists) {
        await tx.run(sql`
          INSERT INTO lineup_ships (lineup_id, ship_id, player_id, clan_id, position)
          SELECT lineup_id, ship_id, player_id, ${defaultClanId}, position FROM lineup_ships_backup
        `);
      }
      
      // Transfer clan battles (if table exists)
      const clanBattlesExists = await checkTableExists('clan_battles_backup');
      if (clanBattlesExists) {
        await tx.run(sql`
          INSERT INTO clan_battles (id, clan_id, cluster_id, finished_at, realm, season_number, map_id, map_name, arena_id, created_at)
          SELECT id, ${defaultClanId}, cluster_id, finished_at, realm, season_number, map_id, map_name, arena_id, created_at FROM clan_battles_backup
        `);
      }
      
      // Transfer clan battle teams (if table exists)
      const clanBattleTeamsExists = await checkTableExists('clan_battle_teams_backup');
      if (clanBattleTeamsExists) {
        await tx.run(sql`
          INSERT INTO clan_battle_teams (id, battle_id, clan_id, team_number, result, league, division, division_rating, 
                                        rating_delta, wg_clan_id, clan_tag, clan_name)
          SELECT id, battle_id, ${defaultClanId}, team_number, result, league, division, division_rating, 
                rating_delta, clan_id, clan_tag, clan_name FROM clan_battle_teams_backup
        `);
      }
      
      // Transfer clan battle players (if table exists)
      const clanBattlePlayersExists = await checkTableExists('clan_battle_players_backup');
      if (clanBattlePlayersExists) {
        await tx.run(sql`
          INSERT INTO clan_battle_players (id, battle_id, clan_id, team_id, player_id, player_name, survived, 
                                          ship_id, ship_name, ship_level, is_clan_member)
          SELECT id, battle_id, ${defaultClanId}, team_id, player_id, player_name, survived, 
                ship_id, ship_name, ship_level, is_pn31 FROM clan_battle_players_backup
        `);
      }
      
      // Transfer player stats (if table exists)
      const playerStatsExists = await checkTableExists('player_stats_backup');
      if (playerStatsExists) {
        await tx.run(sql`
          INSERT INTO player_stats (player_id, clan_id, player_name, total_battles, victories, defeats, 
                                   survival_count, ships_used, win_rate, survival_rate, last_updated)
          SELECT player_id, ${defaultClanId}, player_name, total_battles, victories, defeats, 
                survival_count, ships_used, win_rate, survival_rate, last_updated FROM player_stats_backup
        `);
      }
      
      Logger.info("Migration completed successfully!");
    });
  } catch (error) {
    Logger.error("Migration failed", error);
    throw error;
  }
}

// Check if a table exists
async function checkTableExists(tableName: string): Promise<boolean> {
  // Use prepared statement instead of sql template literal
  const result = await db.get(`
    SELECT name FROM sqlite_master 
    WHERE type='table' AND name='${tableName}'
  `);
  
  return !!result;
}

// Check if we already have multi-clan support (by checking for clan_id in players table)
async function checkMultiClanSupport(): Promise<boolean> {
  try {
    // Use prepared statement instead of sql template literal
    const result = await db.get(`
      SELECT sql FROM sqlite_master 
      WHERE type='table' AND name='players'
    `) as { sql?: string };
    
    if (!result || !result.sql) {
      return false;
    }
    
    return result.sql.toLowerCase().includes('clan_id');
  } catch (error) {
    return false;
  }
}

// Execute migration if this file is run directly
if (import.meta.url === import.meta.url) {
  runMultiClanMigration()
    .then(() => {
      Logger.info("Migration script completed successfully");
      process.exit(0);
    })
    .catch(error => {
      Logger.error("Migration script failed", error);
      process.exit(1);
    });
}

export default runMultiClanMigration;