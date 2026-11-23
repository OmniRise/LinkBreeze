-- 0038: GHSA-5gx8-3hch-6m2f fix - bind OIDC state rows to the browser that
-- started the flow. flow_nonce holds a random nonce mirrored in an httpOnly
-- cookie (lb_oidc_flow); the callback requires cookie === row before linking
-- or logging in, killing account-linking CSRF (and login CSRF). '' rows
-- (pre-fix in-flight states) never match a cookie and simply expire.
ALTER TABLE `oidc_states` ADD `flow_nonce` text DEFAULT '' NOT NULL;
