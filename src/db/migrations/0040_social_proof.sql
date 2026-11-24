-- Social proof counters (roadmap: opt-in public badges, real numbers only).
-- social_proof_mode: 'off' | 'links' | 'page' | 'both' — what the public page
--   shows (per-link click chips and/or a page-level stats row). Default off.
-- social_proof_placement: 'header' (stats row under the bio) | 'footer'
--   (above the footer text) — where the page-level row renders.
-- social_proof_min: hide any badge whose count is below this value
--   (0 = always show), so fresh pages/links never display near-zero counts.
-- views_count: retention-proof all-time pageview counter. The raw
--   analytics_pageviews rows are pruned after the retention window, so
--   aggregates must not depend on them; this column is incremented on every
--   recorded pageview and backfilled once from the surviving rows.
ALTER TABLE `pages` ADD `social_proof_mode` text DEFAULT 'off' NOT NULL;
--> statement-breakpoint
ALTER TABLE `pages` ADD `social_proof_placement` text DEFAULT 'header' NOT NULL;
--> statement-breakpoint
ALTER TABLE `pages` ADD `social_proof_min` integer DEFAULT 100 NOT NULL;
--> statement-breakpoint
ALTER TABLE `pages` ADD `views_count` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
UPDATE `pages` SET `views_count` = (SELECT COUNT(*) FROM `analytics_pageviews` WHERE `analytics_pageviews`.`page_id` = `pages`.`id`);
