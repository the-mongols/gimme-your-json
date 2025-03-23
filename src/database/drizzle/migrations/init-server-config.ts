// src/database/drizzle/migrations/init-server-config.ts
import { db } from "../../db.js";
import { Logger } from "../../../utils/logger.js";
import { sql } from "drizzle-orm";
import { serverConfig, channelConfig, roleConfig } from "../schema-server-config.js";
import { Config } from "../../../utils/config.js";
import type { ClanConfig } from "../../../config/clans.js";

/**
 * Initialize server configuration tables
 * Creates tables if they don't exist
 */
async function initServerConfig(): Promise<void> {
  Logger.info("Initializing server configuration tables...");
  
  try {
    // Check if tables already exist
    const hasServerConfigTable = await checkTableExists('server_config');
    const hasChannelConfigTable = await checkTableExists('channel_config');
    const hasRoleConfigTable = await checkTableExists('role_config');
    
    // If all tables exist, we're done
    if (hasServerConfigTable && hasChannelConfigTable && hasRoleConfigTable) {
      Logger.info("Server configuration tables already exist. Skipping initialization.");
      return;
    }
    
    // Start a transaction to create all tables
    await db.transaction(async (tx) => {
      // Create server_config table if it doesn't exist
      if (!hasServerConfigTable) {
        Logger.info("Creating server_config table...");
        await tx.run(sql`
          CREATE TABLE IF NOT EXISTS server_config (
            server_id TEXT PRIMARY KEY,
            default_clan_tag TEXT,
            admin_role_id TEXT,
            moderator_role_id TEXT,
            log_channel_id TEXT,
            updated_at INTEGER NOT NULL,
            created_at INTEGER NOT NULL
          )
        `);
      }
      
      // Create channel_config table if it doesn't exist
      if (!hasChannelConfigTable) {
        Logger.info("Creating channel_config table...");
        await tx.run(sql`
          CREATE TABLE IF NOT EXISTS channel_config (
            channel_id TEXT PRIMARY KEY,
            server_id TEXT NOT NULL,
            clan_tag TEXT,
            type TEXT,
            settings TEXT,
            updated_at INTEGER NOT NULL,
            created_at INTEGER NOT NULL
          )
        `);
      }
      
      // Create role_config table if it doesn't exist
      if (!hasRoleConfigTable) {
        Logger.info("Creating role_config table...");
        await tx.run(sql`
          CREATE TABLE IF NOT EXISTS role_config (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            server_id TEXT NOT NULL,
            role_id TEXT NOT NULL,
            clan_tag TEXT,
            permissions TEXT,
            updated_at INTEGER NOT NULL,
            created_at INTEGER NOT NULL
          )
        `);
        
        // Create index for server_id in role_config
        await tx.run(sql`CREATE INDEX IF NOT EXISTS idx_role_config_server_id ON role_config(server_id)`);
      }
      
      Logger.info("Server configuration tables created successfully");
    });
    
    // Check if we need to create default configurations
    await createDefaultConfigurations();
  } catch (error) {
    Logger.error("Error initializing server configuration tables:", error);
    throw error;
  }
}

/**
 * Create default configurations for clans
 */
async function createDefaultConfigurations(): Promise<void> {
  Logger.info("Creating default server configurations...");
  
  try {
    // Get the clans from config
    const clans = Object.values(Config.clans) as ClanConfig[];
    
    if (clans.length === 0) {
      Logger.warn("No clans configured. Skipping default configurations.");
      return;
    }
    
    // Create a default server config for each clan
    for (const clan of clans) {
      // Use clan ID as the server ID for default configs
      const serverId = `default_${clan.tag.toLowerCase()}`;
      
      // Check if this default config already exists
      const existingConfig = await db.select()
        .from(serverConfig)
        .where(sql`server_id = ${serverId}`)
        .get();
      
      if (!existingConfig) {
        // Create default config
        await db.insert(serverConfig).values({
          serverId,
          defaultClanTag: clan.tag,
          adminRoleId: null,
          moderatorRoleId: null,
          logChannelId: null,
          updatedAt: Date.now(),
          createdAt: Date.now()
        });
        
        Logger.info(`Created default server configuration for clan ${clan.tag}`);
      }
    }
  } catch (error) {
    Logger.error("Error creating default configurations:", error);
    // Don't throw - this is a non-critical operation
  }
}

/**
 * Check if a table exists in the database
 * @param tableName Table name to check
 * @returns True if the table exists
 */
async function checkTableExists(tableName: string): Promise<boolean> {
  const result = await db.get(`
    SELECT name FROM sqlite_master 
    WHERE type='table' AND name='${tableName}'
  `);
  
  return !!result;
}

// Export the initialization function
export default initServerConfig;