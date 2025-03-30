// drizzle.config.ts
import type { Config } from "drizzle-kit";
import { join } from "path";

// Get project root
const projectRoot = process.cwd();

export default {
  schema: "./src/database/drizzle/schema.ts",
  out: "./src/database/drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: join(projectRoot, "sqlite.db")
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