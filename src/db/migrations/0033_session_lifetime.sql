-- 0033: session lifetime controls (#124 follow-up). Global defaults live in
-- the settings KV; these columns are the per-role and per-user OVERRIDES
-- (NULL = inherit the next layer down).

ALTER TABLE `users` ADD `last_seen_at` text;
--> statement-breakpoint
ALTER TABLE `users` ADD `idle_minutes` integer;
--> statement-breakpoint
ALTER TABLE `users` ADD `max_hours` integer;
--> statement-breakpoint
ALTER TABLE `roles` ADD `idle_minutes` integer;
--> statement-breakpoint
ALTER TABLE `roles` ADD `max_hours` integer;
