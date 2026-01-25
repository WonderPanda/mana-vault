CREATE TABLE `card_price` (
	`id` text PRIMARY KEY NOT NULL,
	`scryfall_card_id` text NOT NULL,
	`price_source_id` text NOT NULL,
	`price_usd` real,
	`price_usd_foil` real,
	`price_usd_etched` real,
	`fetched_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`scryfall_card_id`) REFERENCES `scryfall_card`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`price_source_id`) REFERENCES `price_source`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `card_price_scryfall_card_id_idx` ON `card_price` (`scryfall_card_id`);--> statement-breakpoint
CREATE INDEX `card_price_price_source_id_idx` ON `card_price` (`price_source_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `card_price_card_source_unique` ON `card_price` (`scryfall_card_id`,`price_source_id`);--> statement-breakpoint
CREATE TABLE `collection_card` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`scryfall_card_id` text NOT NULL,
	`condition` text DEFAULT 'NM' NOT NULL,
	`is_foil` integer DEFAULT false NOT NULL,
	`language` text DEFAULT 'en' NOT NULL,
	`notes` text,
	`acquired_at` integer,
	`acquired_from` text,
	`status` text DEFAULT 'owned' NOT NULL,
	`removed_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`scryfall_card_id`) REFERENCES `scryfall_card`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `collection_card_user_id_idx` ON `collection_card` (`user_id`);--> statement-breakpoint
CREATE INDEX `collection_card_scryfall_card_id_idx` ON `collection_card` (`scryfall_card_id`);--> statement-breakpoint
CREATE INDEX `collection_card_user_scryfall_idx` ON `collection_card` (`user_id`,`scryfall_card_id`);--> statement-breakpoint
CREATE INDEX `collection_card_user_status_idx` ON `collection_card` (`user_id`,`status`);--> statement-breakpoint
CREATE TABLE `collection_card_location` (
	`id` text PRIMARY KEY NOT NULL,
	`collection_card_id` text NOT NULL,
	`storage_container_id` text,
	`deck_id` text,
	`assigned_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`collection_card_id`) REFERENCES `collection_card`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`storage_container_id`) REFERENCES `storage_container`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`deck_id`) REFERENCES `deck`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `collection_card_location_collection_card_id_unique` ON `collection_card_location` (`collection_card_id`);--> statement-breakpoint
CREATE INDEX `collection_card_location_card_idx` ON `collection_card_location` (`collection_card_id`);--> statement-breakpoint
CREATE INDEX `collection_card_location_storage_idx` ON `collection_card_location` (`storage_container_id`);--> statement-breakpoint
CREATE INDEX `collection_card_location_deck_idx` ON `collection_card_location` (`deck_id`);--> statement-breakpoint
CREATE TABLE `collection_card_location_history` (
	`id` text PRIMARY KEY NOT NULL,
	`collection_card_id` text NOT NULL,
	`storage_container_id` text,
	`deck_id` text,
	`virtual_list_id` text,
	`started_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`ended_at` integer,
	FOREIGN KEY (`collection_card_id`) REFERENCES `collection_card`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`storage_container_id`) REFERENCES `storage_container`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`deck_id`) REFERENCES `deck`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`virtual_list_id`) REFERENCES `virtual_list`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `collection_card_location_history_card_idx` ON `collection_card_location_history` (`collection_card_id`);--> statement-breakpoint
CREATE INDEX `collection_card_location_history_deck_idx` ON `collection_card_location_history` (`deck_id`);--> statement-breakpoint
CREATE INDEX `collection_card_location_history_list_idx` ON `collection_card_location_history` (`virtual_list_id`);--> statement-breakpoint
CREATE TABLE `collection_card_tag` (
	`collection_card_id` text NOT NULL,
	`tag_id` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`collection_card_id`) REFERENCES `collection_card`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tag`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `collection_card_tag_pk` ON `collection_card_tag` (`collection_card_id`,`tag_id`);--> statement-breakpoint
CREATE TABLE `deck` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`format` text DEFAULT 'commander' NOT NULL,
	`status` text DEFAULT 'in_progress' NOT NULL,
	`archetype` text,
	`color_identity` text,
	`description` text,
	`is_public` integer DEFAULT false NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `deck_user_id_idx` ON `deck` (`user_id`);--> statement-breakpoint
CREATE INDEX `deck_user_status_idx` ON `deck` (`user_id`,`status`);--> statement-breakpoint
CREATE INDEX `deck_user_format_idx` ON `deck` (`user_id`,`format`);--> statement-breakpoint
CREATE TABLE `deck_card` (
	`id` text PRIMARY KEY NOT NULL,
	`deck_id` text NOT NULL,
	`oracle_id` text NOT NULL,
	`preferred_scryfall_id` text,
	`quantity` integer DEFAULT 1 NOT NULL,
	`board` text DEFAULT 'main' NOT NULL,
	`is_commander` integer DEFAULT false NOT NULL,
	`is_companion` integer DEFAULT false NOT NULL,
	`collection_card_id` text,
	`is_proxy` integer DEFAULT false NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`deck_id`) REFERENCES `deck`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`preferred_scryfall_id`) REFERENCES `scryfall_card`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`collection_card_id`) REFERENCES `collection_card`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `deck_card_deck_id_idx` ON `deck_card` (`deck_id`);--> statement-breakpoint
CREATE INDEX `deck_card_oracle_id_idx` ON `deck_card` (`oracle_id`);--> statement-breakpoint
CREATE INDEX `deck_card_collection_card_id_idx` ON `deck_card` (`collection_card_id`);--> statement-breakpoint
CREATE INDEX `deck_card_deck_commander_idx` ON `deck_card` (`deck_id`,`is_commander`);--> statement-breakpoint
CREATE TABLE `deck_card_tag` (
	`deck_card_id` text NOT NULL,
	`deck_tag_id` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`deck_card_id`) REFERENCES `deck_card`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`deck_tag_id`) REFERENCES `deck_tag`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `deck_card_tag_pk` ON `deck_card_tag` (`deck_card_id`,`deck_tag_id`);--> statement-breakpoint
CREATE TABLE `deck_tag` (
	`id` text PRIMARY KEY NOT NULL,
	`deck_id` text NOT NULL,
	`name` text NOT NULL,
	`color` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`deck_id`) REFERENCES `deck`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `deck_tag_deck_id_idx` ON `deck_tag` (`deck_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `deck_tag_deck_name_unique` ON `deck_tag` (`deck_id`,`name`);--> statement-breakpoint
CREATE TABLE `price_source` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`display_name` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`last_sync_at` integer,
	`sync_interval_hours` integer DEFAULT 24,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `price_source_name_unique` ON `price_source` (`name`);--> statement-breakpoint
CREATE TABLE `scryfall_card` (
	`id` text PRIMARY KEY NOT NULL,
	`oracle_id` text NOT NULL,
	`name` text NOT NULL,
	`set_code` text NOT NULL,
	`set_name` text NOT NULL,
	`collector_number` text NOT NULL,
	`rarity` text NOT NULL,
	`mana_cost` text,
	`cmc` real,
	`type_line` text,
	`oracle_text` text,
	`colors` text,
	`color_identity` text,
	`image_uri` text,
	`scryfall_uri` text,
	`data_json` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `scryfall_card_oracle_id_idx` ON `scryfall_card` (`oracle_id`);--> statement-breakpoint
CREATE INDEX `scryfall_card_name_idx` ON `scryfall_card` (`name`);--> statement-breakpoint
CREATE INDEX `scryfall_card_set_code_idx` ON `scryfall_card` (`set_code`);--> statement-breakpoint
CREATE TABLE `storage_container` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`type` text DEFAULT 'box' NOT NULL,
	`description` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `storage_container_user_id_idx` ON `storage_container` (`user_id`);--> statement-breakpoint
CREATE TABLE `tag` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`color` text,
	`is_system` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `tag_user_id_idx` ON `tag` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `tag_user_name_unique` ON `tag` (`user_id`,`name`);--> statement-breakpoint
CREATE TABLE `trade` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`trade_partner_id` text,
	`trade_date` integer,
	`notes` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`trade_partner_id`) REFERENCES `trade_partner`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `trade_user_id_idx` ON `trade` (`user_id`);--> statement-breakpoint
CREATE INDEX `trade_partner_idx` ON `trade` (`trade_partner_id`);--> statement-breakpoint
CREATE TABLE `trade_card` (
	`id` text PRIMARY KEY NOT NULL,
	`trade_id` text NOT NULL,
	`scryfall_card_id` text NOT NULL,
	`collection_card_id` text,
	`direction` text NOT NULL,
	`quantity` integer DEFAULT 1 NOT NULL,
	`value_at_trade` real,
	`condition` text,
	`is_foil` integer DEFAULT false NOT NULL,
	`notes` text,
	FOREIGN KEY (`trade_id`) REFERENCES `trade`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`scryfall_card_id`) REFERENCES `scryfall_card`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`collection_card_id`) REFERENCES `collection_card`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `trade_card_trade_id_idx` ON `trade_card` (`trade_id`);--> statement-breakpoint
CREATE INDEX `trade_card_collection_card_id_idx` ON `trade_card` (`collection_card_id`);--> statement-breakpoint
CREATE TABLE `trade_partner` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`contact_info` text,
	`notes` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `trade_partner_user_id_idx` ON `trade_partner` (`user_id`);--> statement-breakpoint
CREATE TABLE `virtual_list` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`source_type` text,
	`source_name` text,
	`snapshot_date` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `virtual_list_user_id_idx` ON `virtual_list` (`user_id`);--> statement-breakpoint
CREATE TABLE `virtual_list_card` (
	`id` text PRIMARY KEY NOT NULL,
	`virtual_list_id` text NOT NULL,
	`collection_card_id` text NOT NULL,
	`snapshot_price` real,
	`price_source_id` text,
	`notes` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`virtual_list_id`) REFERENCES `virtual_list`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`collection_card_id`) REFERENCES `collection_card`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`price_source_id`) REFERENCES `price_source`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `virtual_list_card_list_idx` ON `virtual_list_card` (`virtual_list_id`);--> statement-breakpoint
CREATE INDEX `virtual_list_card_collection_card_idx` ON `virtual_list_card` (`collection_card_id`);--> statement-breakpoint
CREATE TABLE `wishlist_item` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`scryfall_card_id` text NOT NULL,
	`deck_id` text,
	`quantity` integer DEFAULT 1 NOT NULL,
	`priority` integer DEFAULT 0 NOT NULL,
	`notes` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`scryfall_card_id`) REFERENCES `scryfall_card`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`deck_id`) REFERENCES `deck`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `wishlist_item_user_id_idx` ON `wishlist_item` (`user_id`);--> statement-breakpoint
CREATE INDEX `wishlist_item_deck_id_idx` ON `wishlist_item` (`deck_id`);--> statement-breakpoint
CREATE INDEX `wishlist_item_user_deck_idx` ON `wishlist_item` (`user_id`,`deck_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `wishlist_item_user_card_deck_unique` ON `wishlist_item` (`user_id`,`scryfall_card_id`,`deck_id`);