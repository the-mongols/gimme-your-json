-- Add clan battles tables
CREATE TABLE `clan_battles` (
	`id` text PRIMARY KEY NOT NULL,
	`cluster_id` integer,
	`finished_at` text,
	`realm` text,
	`season_number` integer,
	`map_id` integer,
	`map_name` text,
	`arena_id` integer,
	`created_at` integer
);

CREATE TABLE `clan_battle_teams` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`battle_id` text NOT NULL,
	`team_number` integer,
	`result` text,
	`league` integer,
	`division` integer,
	`division_rating` integer,
	`rating_delta` integer,
	`clan_id` integer,
	`clan_tag` text,
	`clan_name` text,
	FOREIGN KEY (`battle_id`) REFERENCES `clan_battles`(`id`) ON DELETE cascade
);

CREATE TABLE `clan_battle_players` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`battle_id` text NOT NULL,
	`team_id` integer NOT NULL,
	`player_id` text,
	`player_name` text,
	`survived` integer,
	`ship_id` text,
	`ship_name` text,
	`ship_level` integer,
	`is_pn31` integer,
	FOREIGN KEY (`battle_id`) REFERENCES `clan_battles`(`id`) ON DELETE cascade,
	FOREIGN KEY (`team_id`) REFERENCES `clan_battle_teams`(`id`) ON DELETE cascade
);

-- Add indexes for performance
CREATE INDEX `clan_battles_finished_at_idx` ON `clan_battles` (`finished_at`);
CREATE INDEX `clan_battle_players_player_id_idx` ON `clan_battle_players` (`player_id`);
CREATE INDEX `clan_battle_players_is_pn31_idx` ON `clan_battle_players` (`is_pn31`);