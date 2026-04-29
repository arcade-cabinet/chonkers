CREATE TABLE `ai_states` (
	`match_id` text NOT NULL,
	`profile_key` text NOT NULL,
	`ply` integer NOT NULL,
	`dump_blob` blob NOT NULL,
	`dump_format_version` integer NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`match_id`, `profile_key`),
	FOREIGN KEY (`match_id`) REFERENCES `matches`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `analytics_aggregates` (
	`aggregate_key` text PRIMARY KEY NOT NULL,
	`value_json` text NOT NULL,
	`sample_count` integer NOT NULL,
	`last_match_id` text,
	`refreshed_at` integer NOT NULL,
	FOREIGN KEY (`last_match_id`) REFERENCES `matches`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `matches` (
	`id` text PRIMARY KEY NOT NULL,
	`started_at` integer NOT NULL,
	`finished_at` integer,
	`winner` text,
	`red_profile` text NOT NULL,
	`white_profile` text NOT NULL,
	`opening_position_hash` text NOT NULL,
	`coin_flip_seed` text NOT NULL,
	`chain_source_col` integer,
	`chain_source_row` integer,
	`chain_remaining_json` text,
	`ply_count` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_matches_finished_at` ON `matches` (`finished_at`);--> statement-breakpoint
CREATE INDEX `idx_matches_profiles` ON `matches` (`red_profile`,`white_profile`);--> statement-breakpoint
CREATE TABLE `moves` (
	`match_id` text NOT NULL,
	`ply` integer NOT NULL,
	`color` text NOT NULL,
	`from_col` integer NOT NULL,
	`from_row` integer NOT NULL,
	`to_col` integer NOT NULL,
	`to_row` integer NOT NULL,
	`slice_indices_json` text,
	`stack_height_after` integer NOT NULL,
	`position_hash_after` text NOT NULL,
	`move_duration_ms` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`match_id`, `ply`),
	FOREIGN KEY (`match_id`) REFERENCES `matches`(`id`) ON UPDATE no action ON DELETE cascade
);
