import { join } from "path";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { Database } from "bun:sqlite";

// Get the absolute path to your project root
const projectRoot = process.cwd();

// Create path to drizzle folder (which contains meta folder)
const drizzleFolderPath = join(projectRoot, "src", "database", "drizzle");

// Database connection
const sqlite = new Database("sqlite.db");
const db = drizzle(sqlite);

// Run migration with absolute path
migrate(db, { migrationsFolder: drizzleFolderPath });

console.log("Migration complete!");