ALTER TABLE `virtual_list` ADD `is_public` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `virtual_list` ADD `slug` text;--> statement-breakpoint
CREATE UNIQUE INDEX `virtual_list_user_slug_unique` ON `virtual_list` (`user_id`,`slug`);