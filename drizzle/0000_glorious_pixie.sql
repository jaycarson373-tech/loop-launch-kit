CREATE TABLE `assets` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`mime` text NOT NULL,
	`size` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `launches` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`wallet` text NOT NULL,
	`plan` text NOT NULL,
	`mint` text,
	`metadata_uri` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`engine` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`lock_token` text,
	`lock_until` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`last_error` text
);
--> statement-breakpoint
CREATE INDEX `idx_launches_owner` ON `launches` (`owner`);--> statement-breakpoint
CREATE INDEX `idx_launches_status` ON `launches` (`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_launches_mint` ON `launches` (`mint`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`launch_id` text NOT NULL,
	`kind` text NOT NULL,
	`status` text DEFAULT 'prepared' NOT NULL,
	`unsigned` text NOT NULL,
	`signed` text,
	`signature` text,
	`block_height` integer NOT NULL,
	`details` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`error` text,
	FOREIGN KEY (`launch_id`) REFERENCES `launches`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_transactions_launch_status` ON `transactions` (`launch_id`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_transactions_signature` ON `transactions` (`signature`);