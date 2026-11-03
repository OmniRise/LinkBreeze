-- Per-page vCard contact overrides (#vcard-native).
-- NULL = the builder auto-fills from existing page data (title, bio, avatar,
-- social links). Set = override the auto value in /api/vcard output.
ALTER TABLE `pages` ADD `vcard_organization` text; --> statement-breakpoint
ALTER TABLE `pages` ADD `vcard_job_title` text; --> statement-breakpoint
ALTER TABLE `pages` ADD `vcard_email` text; --> statement-breakpoint
ALTER TABLE `pages` ADD `vcard_phone` text; --> statement-breakpoint
ALTER TABLE `pages` ADD `vcard_address` text;
