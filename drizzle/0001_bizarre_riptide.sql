ALTER TABLE `launches` ADD `creator` text;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_launches_creator` ON `launches` (`creator`);