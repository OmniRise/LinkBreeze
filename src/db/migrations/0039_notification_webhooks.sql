-- Webhook notification layer (#13). Per-page webhook configs plus a
-- delivery log. Tables start empty: the layer is opt-in and existing
-- installs boot unchanged (emit is a no-op until a config exists).
-- page_id is NULLABLE: NULL = an instance-wide config (subscribers, admin
-- security feed, update ping, weekly digest) instead of a page milestone
-- config. `events` is a CSV of subscribed event types; page configs default
-- to 'milestones', instance configs list their own set.
CREATE TABLE `notification_configs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`page_id` integer,
	`url` text NOT NULL,
	`provider` text DEFAULT 'discord' NOT NULL,
	`events` text DEFAULT 'milestones' NOT NULL,
	`enabled` integer DEFAULT 1 NOT NULL,
	`clicks_threshold` integer,
	`views_threshold` integer,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`page_id`) REFERENCES `pages`(`id`) ON UPDATE NO ACTION ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX `notification_configs_page_id_idx` ON `notification_configs` (`page_id`);
--> statement-breakpoint
CREATE TABLE `notification_deliveries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`config_id` integer NOT NULL,
	`dedupe_key` text NOT NULL,
	`provider` text NOT NULL,
	`status` text DEFAULT 'failed' NOT NULL,
	`http_status` integer,
	`attempt` integer DEFAULT 1 NOT NULL,
	`error` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`config_id`) REFERENCES `notification_configs`(`id`) ON UPDATE NO ACTION ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX `notification_deliveries_config_id_idx` ON `notification_deliveries` (`config_id`);
--> statement-breakpoint
CREATE INDEX `notification_deliveries_dedupe_idx` ON `notification_deliveries` (`config_id`, `dedupe_key`);
