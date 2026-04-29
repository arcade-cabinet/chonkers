PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_matches` (
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
	`ply_count` integer DEFAULT 0 NOT NULL,
	CONSTRAINT "matches_winner_chk" CHECK("__new_matches"."winner" IS NULL OR "__new_matches"."winner" IN ('red', 'white', 'forfeit-red', 'forfeit-white'))
);
--> statement-breakpoint
INSERT INTO `__new_matches`("id", "started_at", "finished_at", "winner", "red_profile", "white_profile", "opening_position_hash", "coin_flip_seed", "chain_source_col", "chain_source_row", "chain_remaining_json", "ply_count") SELECT "id", "started_at", "finished_at", "winner", "red_profile", "white_profile", "opening_position_hash", "coin_flip_seed", "chain_source_col", "chain_source_row", "chain_remaining_json", "ply_count" FROM `matches`;--> statement-breakpoint
DROP TABLE `matches`;--> statement-breakpoint
ALTER TABLE `__new_matches` RENAME TO `matches`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `idx_matches_finished_at` ON `matches` (`finished_at`);--> statement-breakpoint
CREATE INDEX `idx_matches_profiles` ON `matches` (`red_profile`,`white_profile`);--> statement-breakpoint
CREATE TABLE `__new_moves` (
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
	FOREIGN KEY (`match_id`) REFERENCES `matches`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "moves_color_chk" CHECK("__new_moves"."color" IN ('red', 'white'))
);
--> statement-breakpoint
INSERT INTO `__new_moves`("match_id", "ply", "color", "from_col", "from_row", "to_col", "to_row", "slice_indices_json", "stack_height_after", "position_hash_after", "move_duration_ms", "created_at") SELECT "match_id", "ply", "color", "from_col", "from_row", "to_col", "to_row", "slice_indices_json", "stack_height_after", "position_hash_after", "move_duration_ms", "created_at" FROM `moves`;--> statement-breakpoint
DROP TABLE `moves`;--> statement-breakpoint
ALTER TABLE `__new_moves` RENAME TO `moves`;