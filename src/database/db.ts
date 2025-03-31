// src/database/db.ts
import { drizzle } from "drizzle-orm/bun-sqlite";
import { Database } from "bun:sqlite";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import { Logger } from "../utils/logger.js";

// Get current file's directory for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Get project root (2 levels up from current file)
const projectRoot = resolve(__dirname, "../..");

// Database path
const dbPath = resolve(projectRoot, "sqlite.db");
Logger.info(`Using database at: ${dbPath}`);

// Check if database file exists
const dbExists = await Bun.file(dbPath).exists();
if (!dbExists) {
  Logger.info(`Database file doesn't exist yet at ${dbPath}, will be created on first use`);
}

// Create SQLite connection
const sqlite = new Database(dbPath);

// Create and export Drizzle instance
export const db = drizzle(sqlite);

Logger.info("Database connection established successfully");