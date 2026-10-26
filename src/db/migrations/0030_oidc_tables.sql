-- 0030: generic OIDC SSO (#124) - identity linking + server-side auth states.
-- oidc_identities links a local user to an external IdP identity. Separate table
-- (never columns on users) so one user may later link MULTIPLE identities.
-- UNIQUE(issuer, subject) guarantees an identity maps to exactly one user and
-- makes the login lookup an indexed hit.
-- oidc_states stores the PKCE code_verifier + site-relative redirect target for
-- an in-flight login. Single-use (row deleted on consume) and expiring.

CREATE TABLE `oidc_identities` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `user_id` integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  `issuer` text NOT NULL,
  `subject` text NOT NULL,
  `preferred_username` text,
  `created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `oidc_identities_issuer_subject` ON `oidc_identities` (`issuer`,`subject`);
--> statement-breakpoint
CREATE INDEX `oidc_identities_user_id` ON `oidc_identities` (`user_id`);
--> statement-breakpoint
CREATE TABLE `oidc_states` (
  `state` text PRIMARY KEY NOT NULL,
  `code_verifier` text NOT NULL,
  `redirect_to` text DEFAULT '/' NOT NULL,
  `created_at` text DEFAULT (datetime('now')) NOT NULL,
  `expires_at` text NOT NULL
);
