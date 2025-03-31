// src/database/drizzle/migrations/migrate.ts
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { Database } from "bun:sqlite";
import { Logger } from "../../../utils/logger.js";

// Get current file's directory for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Get project root (3 levels up from current file)
const projectRoot = resolve(__dirname, "../../..");

// Create path to drizzle folder (which contains meta folder)
const drizzleFolderPath = resolve(projectRoot, "src", "database", "drizzle");

// Database path
const dbPath = resolve(projectRoot, "sqlite.db");
Logger.info(`Running migrations on database: ${dbPath}`);

try {
  // Check if migrations folder exists using Bun's file API
  const migrationsExists = await Bun.file(drizzleFolderPath).exists();
  if (!migrationsExists) {
    throw new Error(`Migrations folder not found at: ${drizzleFolderPath}`);
  }
  
  // Database connection
  const sqlite = new Database(dbPath);
  const db = drizzle(sqlite);

  // Run migration with absolute path
  Logger.info(`Applying migrations from: ${drizzleFolderPath}`);
  migrate(db, { migrationsFolder: drizzleFolderPath });

  Logger.info("Migration complete!");
  
  // If this is run as a script, exit when done
  if (import.meta.url === `file://${process.argv[1]}`) {
    process.exit(0);
  }
} catch (error) {
  Logger.error("Migration failed:", error);
  
  // If this is run as a script, exit with error code
  if (import.meta.url === `file://${process.argv[1]}`) {
    process.exit(1);
  } else {
    throw error;
  }
}