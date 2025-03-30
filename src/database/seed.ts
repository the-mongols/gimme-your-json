// src/database/seed.ts
import { db } from "./db.js";
import { movies, players } from "./drizzle/schema.js";
import { Logger } from "../utils/logger.js";
import { Config } from "../utils/config.js";

async function seedDatabase() {
  Logger.info("Starting database seeding...");
  
  try {
    // Seed the movies table for testing
    await db.insert(movies).values([
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
    
    // Demo player for each clan
    for (const clan of Object.values(Config.clans)) {
      // Add a test player for each clan
      await db.insert(players).values({
        id: `test_${clan.tag.toLowerCase()}`,
        clanId: clan.id.toString(),
        username: `Test Player (${clan.tag})`,
        discordId: "000000000000000000",
        clanTag: clan.tag,
        lastUpdated: Date.now()
      });
    }
    
    Logger.info("Database seeding complete!");
  } catch (error) {
    Logger.error("Error seeding database:", error);
    throw error;
  }
}

// Run the seed function if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  seedDatabase()
    .then(() => process.exit(0))
    .catch(error => {
      console.error("Seeding failed:", error);
      process.exit(1);
    });
}

export default seedDatabase;