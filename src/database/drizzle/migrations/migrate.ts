// src/database/drizzle/migrations/migrate.ts
import { join } from "path";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { Database } from "bun:sqlite";
import { Logger } from "../../../utils/logger.js";

// Get the absolute path to your project root
const projectRoot = process.cwd();

// Create path to drizzle folder (which contains meta folder)
const drizzleFolderPath = join(projectRoot, "src", "database", "drizzle");

// Database path
const dbPath = join(projectRoot, "sqlite.db");
Logger.info(`Running migrations on database: ${dbPath}`);

try {
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