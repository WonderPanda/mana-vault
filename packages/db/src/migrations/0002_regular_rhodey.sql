CREATE TABLE `scryfall_import_chunk` (
	`r2_key` text PRIMARY KEY NOT NULL,
	`cards_inserted` integer NOT NULL,
	`started_at` integer NOT NULL,
	`completed_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `scryfall_import_chunk_completed_at_idx` ON `scryfall_import_chunk` (`completed_at`);