CREATE TABLE `treasury_revenue` (
	`id` text PRIMARY KEY NOT NULL,
	`amount` text NOT NULL,
	`credited_mint` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_treasury_revenue_uncredited` ON `treasury_revenue` (`credited_mint`,`created_at`);