// src/bot/init/init.ts
/**
 * Centralized initialization for the Discord bot
 * Runs all necessary database migrations and setup before starting the bot
 */

import { Logger } from '../../utils/logger.js';
import { db } from '../../database/db.js';
import runMultiClanMigration from '../../database/drizzle/migrations/multi-clan-migration.js';
import initServerConfig from '../../database/drizzle/migrations/init-server-config.js';
import { Config } from '../../utils/config.js';

/**
 * Initialize the bot
 * - Run database migrations
 * - Set up necessary tables
 * - Verify environment configuration
 */
export async function initializeBot(): Promise<void> {
  try {
    Logger.info('Starting bot initialization...');
    
    // 1. Verify essential environment variables
    verifyEnvironment();
    
    // 2. Run migrations
    await runDatabaseMigrations();
    
    // 3. Initialize server configuration
    await initServerConfig();
    
    // 4. Verify clan configurations
    verifyClanConfigurations();
    
    Logger.info('Bot initialization complete');
  } catch (error) {
    Logger.error('Bot initialization failed:', error);
    throw error;
  }
}

/**
 * Verify that essential environment variables are set
 */
function verifyEnvironment(): void {
  Logger.info('Verifying environment configuration...');
  
  const requiredVars = [
    'DISCORD_BOT_TOKEN',
    'DISCORD_CLIENT_ID',
    'WG_API_KEY'
  ];
  
  const missingVars = requiredVars.filter(varName => !process.env[varName]);
  
  if (missingVars.length > 0) {
    throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
  }
  
  Logger.info('Environment configuration verified');
}

/**
 * Run all necessary database migrations
 */
async function runDatabaseMigrations(): Promise<void> {
  Logger.info('Running database migrations...');
  
  // Check if database file exists and has tables
  try {
    const tablesExist = await db.get(/*sql*/`
      SELECT name FROM sqlite_master WHERE type='table' AND name='players'
    `);
    
    if (tablesExist) {
      // Run multi-clan migration to update existing database
      Logger.info('Database exists, running multi-clan migration...');
      await runMultiClanMigration();
    } else {
      // Database is new or empty, inform the user
      Logger.info('New database detected, migrations will create schema');
      // The other initialization functions will create the tables
    }
    
    Logger.info('Database migrations completed');
  } catch (error) {
    Logger.error('Database migration failed:', error);
    throw error;
  }
}

/**
 * Verify clan configurations
 */
function verifyClanConfigurations(): void {
  Logger.info('Verifying clan configurations...');
  
  const clans = Object.values(Config.clans);
  
  if (clans.length === 0) {
    throw new Error('No clans configured. At least one clan must be configured.');
  }
  
  // Log warning for any clans missing cookies (required for clan battles API)
  const clansWithoutCookies = clans.filter(clan => !clan.cookies);
  if (clansWithoutCookies.length > 0) {
    const clanTags = clansWithoutCookies.map(clan => clan.tag).join(', ');
    Logger.warn(`The following clans are missing cookies configuration and won't be able to fetch clan battles: ${clanTags}`);
  }
  
  // Verify default clan is in the configuration
  const defaultClanExists = clans.some(clan => clan.tag === Config.defaultClan.tag);
  if (!defaultClanExists) {
    throw new Error(`Default clan "${Config.defaultClan.tag}" is not in the clan configuration.`);
  }
  
  Logger.info(`Verified ${clans.length} clan configurations`);
}

// Export init function
export default initializeBot;