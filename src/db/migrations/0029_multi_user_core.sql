-- 0029: multi-user core (#124) - user role/status/lifecycle + page ownership.
-- Purely additive: new users columns get defaults, existing rows inherit the
-- defaults via ALTER ADD ... DEFAULT (SQLite backfills the constant), then we
-- explicitly promote every pre-existing user to 'admin' so the bootstrapped
-- admin is never demoted. pages.user_id stays NULL for the legacy page (treated
-- as owned by the sole admin); new pages created in code set it explicitly.

ALTER TABLE "users" ADD "role" text NOT NULL DEFAULT 'owner';
--> statement-breakpoint
ALTER TABLE "users" ADD "status" text NOT NULL DEFAULT 'active';
--> statement-breakpoint
ALTER TABLE "users" ADD "last_login_at" text;
--> statement-breakpoint
ALTER TABLE "pages" ADD "user_id" integer REFERENCES users(id) ON DELETE SET NULL;
--> statement-breakpoint
-- Promote every account that existed before multi-user to admin (bootstrap admin).
UPDATE "users" SET "role" = 'admin';
--> statement-breakpoint
-- Attach the single pre-existing page to the sole pre-existing user (single-user
-- upgrade path). Guard with a subquery so a multi-user DB is left untouched.
UPDATE "pages" SET "user_id" = (SELECT "id" FROM "users" ORDER BY "id" LIMIT 1)
WHERE "user_id" IS NULL AND (SELECT COUNT(*) FROM "users") = 1;
