-- Add new tables for clan battles tracking

-- Table for storing clan battle data
CREATE TABLE IF NOT EXISTS `clan_battles` (
  `id` integer PRIMARY KEY AUTOINCREMENT,
  `battle_id` integer NOT NULL UNIQUE,
  `map_name` text NOT NULL,
  `map_id` integer NOT NULL,
  `finished_at` text NOT NULL,
  `season_number` integer NOT NULL,
  `team_id` integer NOT NULL,
  `clan_id` integer NOT NULL,
  `clan_tag` text NOT NULL,
  `result` text NOT NULL,
  `league` integer NOT NULL,
  `division` integer NOT NULL,
  `division_rating` integer NOT NULL,
  `rating_delta` integer NOT NULL,
  `created_at` integer NOT NULL DEFAULT (unixepoch())
);

-- Table for storing player battle participation
CREATE TABLE IF NOT EXISTS `player_battles` (
  `id` integer PRIMARY KEY AUTOINCREMENT,
  `battle_id` integer NOT NULL,
  `player_id` integer NOT NULL,
  `player_name` text NOT NULL,
  `clan_id` integer NOT NULL,
  `ship_id` integer NOT NULL,
  `ship_name` text NOT NULL,
  `ship_tier` integer NOT NULL,
  `survived` integer NOT NULL, -- boolean (0 or 1)
  `team_result` text NOT NULL,
  `created_at` integer NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (`battle_id`, `player_id`)
);

-- Table for aggregated player statistics
CREATE TABLE IF NOT EXISTS `player_stats` (
  `player_id` integer PRIMARY KEY,
  `player_name` text NOT NULL,
  `total_battles` integer NOT NULL DEFAULT 0,
  `victories` integer NOT NULL DEFAULT 0,
  `defeats` integer NOT NULL DEFAULT 0,
  `survival_count` integer NOT NULL DEFAULT 0,
  `ships_used` text, -- JSON string
  `win_rate` real DEFAULT 0,
  `survival_rate` real DEFAULT 0,
  `last_updated` integer NOT NULL DEFAULT (unixepoch())
);

-- Indexes for improved query performance
CREATE INDEX IF NOT EXISTS `idx_clan_battles_season` ON `clan_battles` (`season_number`);
CREATE INDEX IF NOT EXISTS `idx_clan_battles_finished_at` ON `clan_battles` (`finished_at`);
CREATE INDEX IF NOT EXISTS `idx_player_battles_player_id` ON `player_battles` (`player_id`);
CREATE INDEX IF NOT EXISTS `idx_player_battles_ship_id` ON `player_battles` (`ship_id`);