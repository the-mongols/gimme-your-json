import { join } from "path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { Database } from "bun:sqlite";
// Import schema directly - make sure this path is correct relative to where seed.ts is located
import * as schema from "./schema";

// Get the absolute path to your project root
const projectRoot = process.cwd();

// Database connection (using absolute path for database file)
const dbPath = join(projectRoot, "sqlite.db");
const sqlite = new Database(dbPath);
const db = drizzle(sqlite);

// Seed the database
await db.insert(schema.movies).values([
  {
    title: "The Matrix",
    releaseYear: 1999,
  },
  {
    title: "The Matrix Reloaded",
    releaseYear: 2003,
  },
  {
    title: "The Matrix Revolutions",
    releaseYear: 2003,
  },
]);

console.log(`Seeding complete. Database at: ${dbPath}`);