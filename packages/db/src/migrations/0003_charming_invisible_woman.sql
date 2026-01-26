-- Clean up existing data since this is a breaking change (lists now reference scryfall cards directly)
DELETE FROM `virtual_list_card`;--> statement-breakpoint
DELETE FROM `virtual_list`;--> statement-breakpoint
DELETE FROM `collection_card`;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_virtual_list_card` (
	`id` text PRIMARY KEY NOT NULL,
	`virtual_list_id` text NOT NULL,
	`collection_card_id` text,
	`scryfall_card_id` text,
	`quantity` integer DEFAULT 1 NOT NULL,
	`condition` text,
	`is_foil` integer,
	`language` text,
	`snapshot_price` real,
	`price_source_id` text,
	`notes` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`virtual_list_id`) REFERENCES `virtual_list`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`collection_card_id`) REFERENCES `collection_card`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`scryfall_card_id`) REFERENCES `scryfall_card`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`price_source_id`) REFERENCES `price_source`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_virtual_list_card`("id", "virtual_list_id", "collection_card_id", "scryfall_card_id", "quantity", "condition", "is_foil", "language", "snapshot_price", "price_source_id", "notes", "created_at") SELECT "id", "virtual_list_id", "collection_card_id", "scryfall_card_id", "quantity", "condition", "is_foil", "language", "snapshot_price", "price_source_id", "notes", "created_at" FROM `virtual_list_card`;--> statement-breakpoint
DROP TABLE `virtual_list_card`;--> statement-breakpoint
ALTER TABLE `__new_virtual_list_card` RENAME TO `virtual_list_card`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `virtual_list_card_list_idx` ON `virtual_list_card` (`virtual_list_id`);--> statement-breakpoint
CREATE INDEX `virtual_list_card_collection_card_idx` ON `virtual_list_card` (`collection_card_id`);--> statement-breakpoint
CREATE INDEX `virtual_list_card_scryfall_idx` ON `virtual_list_card` (`scryfall_card_id`);--> statement-breakpoint
ALTER TABLE `virtual_list` ADD `list_type` text DEFAULT 'owned' NOT NULL;