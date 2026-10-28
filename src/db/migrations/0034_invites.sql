-- 0034: member invitations, stage 1 (#124 follow-up). Single-use tokens;
-- only the SHA-256 hash is stored, so a DB leak cannot mint invitations.
-- stage 2 (SMTP delivery) rides the outbound-email layer issue.

CREATE TABLE `invites` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `token_hash` text NOT NULL UNIQUE,
  `role_id` integer REFERENCES roles(id) ON DELETE SET NULL,
  `created_by` integer REFERENCES users(id) ON DELETE SET NULL,
  `created_at` text DEFAULT (datetime('now')) NOT NULL,
  `expires_at` text NOT NULL,
  `used_at` text,
  `used_by` integer REFERENCES users(id) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE INDEX `invites_expires_at` ON `invites` (`expires_at`);
