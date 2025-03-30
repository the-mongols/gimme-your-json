// src/database/db.ts
import { drizzle } from "drizzle-orm/bun-sqlite";
import { Database } from "bun:sqlite";
import { join } from "path";
import { Logger } from "../utils/logger.js";

// Get project root
const projectRoot = process.cwd();

// Database connection, config, and queries
const dbPath = join(projectRoot, "sqlite.db");
Logger.info(`Using database at: ${dbPath}`);

// Create SQLite connection
const sqlite = new Database(dbPath);

// Create and export Drizzle instance
export const db = drizzle(sqlite);

Logger.info("Database connection established successfully");