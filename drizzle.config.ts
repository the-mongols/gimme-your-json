// drizzle.config.ts
import type { Config } from "drizzle-kit";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

// Get current file's directory for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Get absolute path to project root
const projectRoot = resolve(__dirname);

// Use Bun.fileExists to validate the path if needed
const dbPath = resolve(projectRoot, "sqlite.db");

export default {
  schema: "./src/database/drizzle/schema.ts",
  out: "./src/database/drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: dbPath
  },
  // Tables to include in Studio (optional)
  tablesFilter: [
    "players",
    "ships",
    "stat_history",
    "lineups",
    "lineup_ships",
    "clan_battles",
    "clan_battle_teams", 
    "clan_battle_players",
    "server_config",
    "player_stats",
    "movies"
  ],
} satisfies Config;