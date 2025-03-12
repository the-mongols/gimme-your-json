// ./src/database -> Database setup & queries (Drizzle ORM)

// Database connection, config, and queries

import { drizzle } from "drizzle-orm/bun-sqlite";
import { Database } from "bun:sqlite";

const sqlite = new Database("sqlite.db");
export const db = drizzle(sqlite);