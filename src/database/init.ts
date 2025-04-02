// src/database/init.ts
import { Logger } from '../utils/logger.js';
import { db } from './db.js';
import runMultiClanMigration from './drizzle/migrations/multi-clan-migration.js';
import initServerConfig from './drizzle/migrations/init-server-config.js';
import { Database } from 'bun:sqlite';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

// Get current file's directory for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Get project root (2 levels up from current file)
const projectRoot = resolve(__dirname, "../..");

// Database path
const dbPath = resolve(projectRoot, "sqlite.db");

/**
 * Initialize the database
 * - Run database migrations
 * - Verify database structure
 */
export async function initDatabase(): Promise<void> {
  try {
    Logger.info('Initializing database...');
    
    // Check if database has required tables
    const hasTables = await checkRequiredTables();
    
    if (!hasTables) {
      Logger.info('Database is empty or missing required tables, running migrations...');
      await runMigrations();
    } else {
      Logger.info('Database structure verified');
    }
    
    // Run init functions that are safe to run multiple times
    await initServerConfig();
    
    // Verify the database connection with a simple direct SQLite query
    try {
      // Create a direct SQLite connection for this test
      const sqlite = new Database(dbPath);
      const result = sqlite.query("SELECT 'connected' AS value").get() as { value: string } | null;
      if (result) {
        Logger.info(`Database connection verified: ${result.value}`);
      } else {
        Logger.warn('Database connection test returned no results');
      }
      sqlite.close();
    } catch (error) {
      Logger.error('Database connection test failed:', error);
      // Continue despite test failure - the database might still be usable
    }
    
    Logger.info('Database initialization complete');
    return;
  } catch (error) {
    Logger.error('Database initialization failed:', error);
    throw error;
  }
}

/**
 * Check if the database has the required tables
 */
async function checkRequiredTables(): Promise<boolean> {
  try {
    // Check for key tables from our schema using direct SQLite
    const requiredTables = ['players', 'ships', 'clan_battles'];
    
    // Create a direct SQLite connection for this query
    const sqlite = new Database(dbPath);
    
    // Get list of tables in the database
    const rows = sqlite.query("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all() as Array<{name: string}>;
    
    // Close the connection after use
    sqlite.close();
    
    if (!rows || rows.length === 0) {
      return false;
    }
    
    const tableNames = rows.map(row => row.name);
    
    // Check if all required tables exist
    return requiredTables.every(table => tableNames.includes(table));
  } catch (error) {
    Logger.error('Error checking database tables:', error);
    // If error, assume tables don't exist
    return false;
  }
}

/**
 * Run all database migrations
 */
async function runMigrations(): Promise<void> {
  try {
    Logger.info('Running database migrations...');
    
    // Import the migrate function using dynamic import
    const migrateModule = await import('./drizzle/migrations/migrate.js');
    
    if (migrateModule && typeof migrateModule.migrate === 'function') {
      await migrateModule.migrate();
    } else if (migrateModule && typeof migrateModule.default === 'function') {
      await migrateModule.default();
    } else {
      throw new Error('Migration module does not export a usable migration function');
    }
    
    // Ensure multi-clan support
    // This function doesn't return anything meaningful to check, so we'll just await it
    await runMultiClanMigration();
    Logger.info('Multi-clan migration completed');
    
    Logger.info('Database migrations completed successfully');
  } catch (error) {
    Logger.error('Database migrations failed:', error);
    throw error;
  }
}