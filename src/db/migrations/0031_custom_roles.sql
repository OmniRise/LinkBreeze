-- 0031: customizable roles (#124 phase 2B). A role row is the source of truth
-- for what an account may do; users.role ('admin'|'owner' text) stays as a
-- legacy fast-path hint. Two builtin roles seed every instance: Admin (full
-- control) and Member (own page only). Builtins are flagged is_builtin=1 and
-- must never be deleted (enforced in the actions). users.role_id NULL means
-- "map through the legacy text role" so pre-0031 rows are never demoted.

CREATE TABLE `roles` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `name` text NOT NULL UNIQUE,
  `is_builtin` integer DEFAULT 0 NOT NULL,
  `pages_limit` integer,
  `pages_visibility` text DEFAULT 'own' NOT NULL,
  `can_manage_accounts` integer DEFAULT 0 NOT NULL,
  `can_manage_instance` integer DEFAULT 0 NOT NULL,
  `created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
INSERT INTO `roles` (`name`, `is_builtin`, `pages_limit`, `pages_visibility`, `can_manage_accounts`, `can_manage_instance`) VALUES ('Admin', 1, NULL, 'manage_all', 1, 1);
--> statement-breakpoint
INSERT INTO `roles` (`name`, `is_builtin`, `pages_limit`, `pages_visibility`, `can_manage_accounts`, `can_manage_instance`) VALUES ('Member', 1, 1, 'own', 0, 0);
--> statement-breakpoint
ALTER TABLE `users` ADD `role_id` integer REFERENCES roles(id) ON DELETE SET NULL;
--> statement-breakpoint
-- Backfill: legacy text role maps onto the builtin rows. role_id stays NULL
-- for rows with an unknown/NULL text role - the resolver maps NULL through
-- the legacy text, never silently demoting the bootstrapped admin.
UPDATE `users` SET `role_id` = (SELECT `id` FROM `roles` WHERE `name` = 'Admin') WHERE `role` = 'admin';
--> statement-breakpoint
UPDATE `users` SET `role_id` = (SELECT `id` FROM `roles` WHERE `name` = 'Member') WHERE `role` IS NULL OR `role` <> 'admin';
