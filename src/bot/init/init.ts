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
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Collection } from 'discord.js';
import type { Client } from 'discord.js';
import type { Command } from '../bot.js';

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

/**
 * Load commands for the Discord bot
 * Improved command registration with auto-discovery
 * @param client Discord.js client instance
 */
export async function loadCommands(client: Client): Promise<number> {
  Logger.info('Loading commands...');
  
  // Initialize commands collection if not already done
  if (!client.commands) {
    client.commands = new Collection<string, Command>();
  }
  
  // Initialize cooldowns collection if not already done
  if (!client.cooldowns) {
    client.cooldowns = new Collection();
  }
  
  // Get current file and directory path for ESM
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  
  // Create path to commands directory
  const commandsPath = path.join(__dirname, '..', 'commands');
  
  // Track metrics
  let totalLoaded = 0;
  let skipped = 0;
  let errors = 0;
  
  // Helper function to load commands from a directory
  async function loadCommandsFromDirectory(dir: string, category?: string): Promise<void> {
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
      return;
    }
    
    // Get all command files (.js or .ts)
    const commandFiles = fs.readdirSync(dir).filter(file => 
      file.endsWith('.js') || file.endsWith('.ts')
    );
    
    // No commands in this directory
    if (commandFiles.length === 0) {
      return;
    }
    
    Logger.debug(`Loading ${commandFiles.length} commands from ${dir}`);
    
    // Load each command file
    for (const file of commandFiles) {
      const filePath = path.join(dir, file);
      
      try {
        // Skip if not a file
        if (!fs.statSync(filePath).isFile()) {
          continue;
        }
        
        // Use dynamic import for ESM
        const commandModule = await import(`file://${filePath}`);
        
        // Handle both default and named exports
        const command = commandModule.default || commandModule;
        
        // Validate command structure
        if (!command || !command.data || !command.execute) {
          Logger.warn(`Command at ${filePath} is missing required properties and will be skipped`);
          skipped++;
          continue;
        }
        
        // Add category from directory name if not specified in command
        if (category && !command.category) {
          command.category = category;
        }
        
        // Check for duplicate commands
        if (client.commands.has(command.data.name)) {
          Logger.warn(`Duplicate command name found: ${command.data.name}. The previous definition will be overwritten.`);
        }
        
        // Add command to collection
        client.commands.set(command.data.name, command);
        Logger.debug(`Loaded command: ${command.data.name} (${command.category || 'uncategorized'})`);
        totalLoaded++;
      } catch (error) {
        Logger.error(`Error loading command file ${filePath}:`, error);
        errors++;
      }
    }
  }
  
  // First, scan for category directories
  const categoryDirs = fs.readdirSync(commandsPath)
    .filter(item => {
      const itemPath = path.join(commandsPath, item);
      return fs.statSync(itemPath).isDirectory() && item !== 'registration';
    });
  
  // Load commands from each category directory
  for (const category of categoryDirs) {
    const categoryPath = path.join(commandsPath, category);
    await loadCommandsFromDirectory(categoryPath, category);
  }
  
  // Also check for legacy commands in working_former_commands
  const legacyPath = path.join(commandsPath, 'working_former_commands');
  if (fs.existsSync(legacyPath) && fs.statSync(legacyPath).isDirectory()) {
    // Get legacy categories
    const legacyCategories = fs.readdirSync(legacyPath)
      .filter(item => fs.statSync(path.join(legacyPath, item)).isDirectory());
    
    // Load legacy commands
    for (const category of legacyCategories) {
      const categoryPath = path.join(legacyPath, category);
      await loadCommandsFromDirectory(categoryPath, category);
    }
  }
  
  Logger.info(`Command loading complete: ${totalLoaded} loaded, ${skipped} skipped, ${errors} errors`);
  return totalLoaded;
}

// Export init function
export default initializeBot;