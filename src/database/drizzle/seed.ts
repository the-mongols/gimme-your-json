import { join } from "path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { Database } from "bun:sqlite";
// Import schema
import * as schema from "./schema.js";

// Get the absolute path to your project root
const projectRoot = process.cwd();

// Database connection (using absolute path for database file)
const dbPath = join(projectRoot, "sqlite.db");
const sqlite = new Database(dbPath);
const db = drizzle(sqlite);

async function seedDatabase() {
  console.log("Starting database seeding...");
  
  try {
    // Seed the database
    // Note: Using the correct property names from the schema
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
  } catch (error) {
    console.error("Error seeding database:", error);
  }
}

// Run the seed function
seedDatabase();