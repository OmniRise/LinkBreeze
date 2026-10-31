-- 0032: admin audit log (#124 follow-up). Append-only: one row per
-- security-relevant event (account/role lifecycle, logins, settings changes).
-- actor_user_id is SET NULL on user deletion; actor_username is snapshotted
-- so the log stays readable after the account is gone.

CREATE TABLE `audit_log` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `actor_user_id` integer REFERENCES users(id) ON DELETE SET NULL,
  `actor_username` text,
  `action` text NOT NULL,
  `target` text,
  `detail` text,
  `ip` text,
  `created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_log_created_at` ON `audit_log` (`created_at`);
--> statement-breakpoint
CREATE INDEX `audit_log_action` ON `audit_log` (`action`);
--> statement-breakpoint
CREATE INDEX `audit_log_actor` ON `audit_log` (`actor_user_id`);
