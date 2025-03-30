CREATE TABLE `clan_battle_players` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`battle_id` text NOT NULL,
	`clan_id` text NOT NULL,
	`team_id` integer NOT NULL,
	`player_id` text,
	`player_name` text,
	`survived` integer,
	`ship_id` text,
	`ship_name` text,
	`ship_level` integer,
	`is_clan_member` integer
);
--> statement-breakpoint
CREATE TABLE `clan_battle_teams` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`battle_id` text NOT NULL,
	`clan_id` text NOT NULL,
	`team_number` integer,
	`result` text,
	`league` integer,
	`division` integer,
	`division_rating` integer,
	`rating_delta` integer,
	`wg_clan_id` integer,
	`clan_tag` text,
	`clan_name` text
);
--> statement-breakpoint
CREATE TABLE `clan_battles` (
	`id` text NOT NULL,
	`clan_id` text NOT NULL,
	`cluster_id` integer,
	`finished_at` text,
	`realm` text,
	`season_number` integer,
	`map_id` integer,
	`map_name` text,
	`arena_id` integer,
	`created_at` integer,
	PRIMARY KEY(`id`, `clan_id`)
);
--> statement-breakpoint
CREATE TABLE `lineup_ships` (
	`lineup_id` integer NOT NULL,
	`ship_id` text NOT NULL,
	`player_id` text NOT NULL,
	`clan_id` text NOT NULL,
	`position` text,
	PRIMARY KEY(`lineup_id`, `ship_id`, `player_id`, `clan_id`),
	FOREIGN KEY (`lineup_id`) REFERENCES `lineups`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `lineups` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`clan_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`created_at` integer NOT NULL,
	`total_score` real,
	`config` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `player_stats` (
	`player_id` text NOT NULL,
	`clan_id` text NOT NULL,
	`player_name` text NOT NULL,
	`total_battles` integer DEFAULT 0 NOT NULL,
	`victories` integer DEFAULT 0 NOT NULL,
	`defeats` integer DEFAULT 0 NOT NULL,
	`survival_count` integer DEFAULT 0 NOT NULL,
	`ships_used` text,
	`win_rate` real DEFAULT 0,
	`survival_rate` real DEFAULT 0,
	`last_updated` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`player_id`, `clan_id`)
);
--> statement-breakpoint
CREATE TABLE `players` (
	`id` text NOT NULL,
	`clan_id` text NOT NULL,
	`username` text NOT NULL,
	`discord_id` text NOT NULL,
	`wg_clan_id` text,
	`clan_tag` text,
	`tier_averages` text,
	`last_updated` integer,
	PRIMARY KEY(`id`, `clan_id`)
);
--> statement-breakpoint
CREATE TABLE `ships` (
	`id` text NOT NULL,
	`player_id` text NOT NULL,
	`clan_id` text NOT NULL,
	`name` text NOT NULL,
	`tier` integer NOT NULL,
	`type` text NOT NULL,
	`nation` text,
	`battles` integer NOT NULL,
	`wins` integer NOT NULL,
	`survived` integer NOT NULL,
	`win_rate` real,
	`survival_rate` real,
	`damage_avg` real,
	`frag_avg` real,
	`xp_avg` real,
	`ship_score` real,
	`expected_damage` real,
	`damage_ratio` real,
	`last_played` integer,
	`last_updated` integer,
	PRIMARY KEY(`id`, `player_id`, `clan_id`),
	PRIMARY KEY(`player_id`, `clan_id`)
);
--> statement-breakpoint
CREATE TABLE `stat_history` (
	`ship_id` text NOT NULL,
	`player_id` text NOT NULL,
	`clan_id` text NOT NULL,
	`date` integer NOT NULL,
	`battles` integer NOT NULL,
	`win_rate` real,
	`damage_avg` real,
	`ship_score` real,
	PRIMARY KEY(`ship_id`, `player_id`, `clan_id`, `date`)
);
--> statement-breakpoint
ALTER TABLE `movies` ADD `title` text;--> statement-breakpoint
ALTER TABLE `movies` DROP COLUMN `name`;