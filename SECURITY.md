# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in LinkBreeze, please report it
responsibly.

**Do NOT open a public GitHub issue for security vulnerabilities.**

Instead, please email: **manak@omnirise.dev**

Include:
- Description of the vulnerability
- Steps to reproduce (proof of concept if possible)
- Potential impact (who's affected, what an attacker could do)
- Suggested fix (if any)

### Response timeline

- **Acknowledgement**: within 48 hours
- **Status update**: within 7 days (with severity assessment + fix plan)
- **Patch release**: within 30 days for high/critical, 90 days for moderate/low
- **Public disclosure**: after the patch is released, coordinated with reporter

### Safe harbor

We will not pursue legal action against researchers who:
- Make a good-faith effort to avoid privacy violations and service disruption
- Do not access or modify data that doesn't belong to them
- Report the vulnerability promptly and give us reasonable time to respond
- Do not publicly disclose the issue until a fix is available

## Security Measures

LinkBreeze implements the following security practices:

- **Auth**: Argon2id password hashing (OWASP parameters: m=19456 KiB, t=2, p=1) with transparent legacy-bcrypt upgrade on login, HMAC-signed session cookies
- **Sessions**: httpOnly, SameSite cookies, 30-day expiry, **session invalidation on password change** (stolen cookies become invalid when you change your password)
- **Two-factor authentication (#5)**: Optional TOTP (RFC 6238, 6 digits / 30s, SHA-1, ±1 window for clock drift) via any authenticator app. The TOTP secret is stored **encrypted at rest** (AES-256-GCM, key HKDF-derived from `SECRET_KEY` — never a key in the same database). Recovery codes are bcrypt-hashed, single-use (consumed on success), rejection-sampled to avoid modulo bias, and use a lookalike-free alphabet. "Trust this device" tokens bind user + secret + User-Agent (re-enrolling invalidates every trust by construction). Code entry reuses the login rate limiter (5/min per IP, 15/min global). Backup files **exclude** all 2FA state (the exporter never reads the `users` table) — restoring a backup de-facto disables 2FA rather than leaking the encrypted secret. `SECRET_KEY` dependency: rotating it without disabling/re-enabling 2FA makes the stored secret undecryptable and login requires a recovery code — see [Troubleshooting](#known-limitations-v127).
- **Input validation**: Zod schemas on every server action and API route
- **SQL injection prevention**: Drizzle ORM parameterized queries (no raw SQL)
- **Security headers**: HSTS, X-Content-Type-Options, Referrer-Policy, Permissions-Policy on all routes
- **X-Frame-Options**: SAMEORIGIN (prevents external clickjacking)
- **URL validation**: Rejects `javascript:`, `data:`, `blob:` schemes
- **File uploads**: Type whitelist (images only), size limit (2 MB), path-traversal-safe filename resolution
- **Docker**: Runs as non-root user (`node`), data volume is the only writable path
- **CSRF protection**: Next.js 16 Server Actions verify the `Origin` header
  against the `Host` header on every non-GET submission. Cross-site form posts
  are rejected automatically by the framework — no manual CSRF token needed.
- **Rate limiting**: Login endpoint (5 attempts/min per IP), analytics tracking endpoint (60 req/min per IP), click redirect endpoint `/go/:id` (60 req/min per IP), QR generation endpoint (30 req/min per IP)
- **SVG uploads blocked**: SVG files are no longer accepted as uploads. The uploads serving route also sends `Content-Security-Policy: default-src 'none'` and `X-Content-Type-Options: nosniff` headers as defense-in-depth.
- **Privacy-respecting analytics**: No raw IP storage — visitor hashes use SHA-256 (truncated to 64 bits) with a daily-rotating salt derived from the SECRET_KEY. The hash is one-way within the daily salt window. **Important**: hash reversal resistance depends on the SECRET_KEY remaining secret. Store the SECRET_KEY separately from the database (use an env var, not the auto-generated file in the data volume) for maximum protection. If an attacker obtains both the DB and SECRET_KEY, they could brute-force hashes for a specific day. The daily salt rotation means each day requires a separate brute-force pass. **k-anonymity trade-off**: the 64-bit truncation is deliberate — within a single day, multiple distinct IPs can map to the same hash, making it harder to isolate individual visitors at the cost of potential undercounting behind shared NATs with identical user-agents.
- **No third-party requests on public pages**: Favicons are fetched server-side and cached locally. Links without a cached favicon show a letter avatar instead of loading from a third-party domain. No visitor-facing request touches google.com or any analytics provider unless the operator explicitly configures external analytics.
- **Referrer privacy**: Only the origin of the Referer header is stored in analytics (e.g., `https://instagram.com` instead of the full path with query parameters).
- **Privacy policy pages**: Every public page auto-generates a privacy policy at `/{slug}/privacy` from the page's actual configuration. Operators can customize it in Settings. Footer link is always visible.

## Known Limitations (v1.2.7)

The following are NOT yet implemented. If you need these, track the corresponding
issue or contribute:

- **Password recovery**: No self-service reset flow. If you lose your password,
  see the [Troubleshooting guide](TROUBLESHOOTING.md#forgot-admin-password)
  for three recovery methods (hash reset, full reset, or database deletion).
- **2FA / MFA** (#5): **Available since the next release** (TOTP with recovery
  codes). Enable it in Settings → Security. Remaining limits: no WebAuthn /
  passkey support (TOTP only), no enforced-2FA policy (single-admin model),
  and recovery codes are only shown once at setup — if you lose both your
  authenticator and your recovery codes, use the password-hash reset in the
  Troubleshooting guide and then re-enroll.
- **Email capture consent** (#75): The subscriber form has no consent checkbox or
  privacy notice. Operators collecting emails from EU visitors should add their
  own consent mechanism until this is built in.
- **Analytics retention default**: Configurable via Settings -> Data, but defaults
  to infinite (0). Operators should set a retention window (#77).

## Scope

This policy covers the LinkBreeze application code in this repository.
Third-party dependencies should be reported to their respective maintainers.

## Data Protection & GDPR

### Who is the data controller?

LinkBreeze is self-hosted software. The **operator** (the person who deploys and
runs the Docker container) is the data controller under GDPR, CCPA, and similar
regulations. OmniRise (the developers of LinkBreeze) does **not** process, store,
or have access to any data from your deployment. This is the same legal posture
as WordPress, Ghost, or self-hosted Plausible.

### What data does LinkBreeze process?

**Visitor data (collected automatically on public pages):**

| Data point | Storage | Pseudonymized? | Retention |
|---|---|---|---|
| Page views + clicks | SQLite DB | Yes (visitor hash) | Configurable, default infinite |
| Visitor identifier | SHA-256 hash (64-bit, daily salt) | Yes | Rotates daily |
| Device type | mobile / desktop / tablet | Yes (categorized) | Same as analytics |
| Country | Derived from IP via local GeoIP DB | Yes (no city/region) | Same as analytics |
| Referrer origin | Origin only (no path/query) | N/A | Same as analytics |

The visitor hash is `SHA-256(ip | user-agent | daily-salt)`, truncated to 64
bits. Raw IPs are never stored. User-agents are categorized to device type and
not stored individually. Referrers are stripped to origin only.

**Operator data (collected during setup):**

| Data point | Storage | Encryption |
|---|---|---|
| Admin password | SQLite DB | Argon2id hash (m=19456, t=2, p=1); legacy bcrypt hashes are re-hashed on the next successful login |
| Admin email | SQLite DB | Plaintext (for notifications) |
| Page content (title, bio, links) | SQLite DB | N/A |
| Subscriber emails (if email capture enabled) | SQLite DB | Plaintext |

### Cookies

LinkBreeze uses **one cookie**: the admin session cookie (`lb_session`). It is
httpOnly, SameSite, and required for authentication. It is only set after login
and is never placed on public pages.

**Public pages use zero cookies.** The built-in analytics are cookieless. If an
operator enables external analytics (Google Analytics, Plausible, etc.) via the
analytics script injection feature, that provider may set its own cookies on
public pages. This is the operator's responsibility.

### Data subject rights (GDPR Articles 15-20)

Operators may receive requests from visitors exercising their GDPR rights. Here
is how LinkBreeze supports each:

- **Right of access (Art. 15)**: The visitor hash is derived from the visitor's
  IP and user-agent. The operator cannot look up a specific visitor's data
  without knowing their IP and user-agent at the time of visit. The admin
  dashboard shows aggregated analytics, not individual visitor records.
- **Right to erasure (Art. 17)**: Analytics data can be bulk-deleted via the
  Data settings (Settings -> Data -> Clear analytics). There is no per-visitor
  deletion mechanism because individual visitors cannot be reliably identified
  from the hash alone.
- **Right to portability (Art. 20)**: Subscriber emails can be exported to CSV.
  Analytics data is aggregated, not per-visitor, so portability does not apply
  in the traditional sense.

### Email capture compliance gap

The built-in email capture form does not currently include a consent checkbox,
privacy notice, or purpose disclosure (tracked in #75). Operators collecting
emails from EU visitors must ensure they have a lawful basis under GDPR Article
6 and meet the consent requirements of Article 7 until built-in consent tooling
ships.

### Privacy policy pages

Every public page has an auto-generated privacy policy at `/{slug}/privacy`.
The policy reflects the page's actual configuration (analytics, email capture,
embeds, external scripts, retention window) so it stays accurate without
manual maintenance. A "Privacy" link appears in the footer of every public
page.

Operators can override the auto-generated text with a custom privacy policy
via Settings -> General -> Privacy policy. When set, the custom text replaces
the generated template entirely. The privacy page inherits the page's theme
(colors, fonts, background) so it looks consistent.

The privacy policy route is `noindex` (not indexed by search engines).

### Third-party embeds

When an operator adds a YouTube, Spotify, Vimeo, SoundCloud, or Bandcamp embed
to their page, the embed provider loads its own scripts and may set cookies or
collect visitor data. YouTube uses `youtube-nocookie.com` which limits but does
not eliminate Google tracking. Operators should assess whether embeds require
consent under the ePrivacy Directive and provide appropriate notices.

### Data breach notification

LinkBreeze does not transmit data to any external server. If the operator's
deployment is compromised, the breach surface is limited to the operator's own
server and database. Breach notification obligations fall on the operator under
GDPR Article 33 (72 hours to the supervisory authority).

### Recommended hardening for operators

1. **Set SECRET_KEY as an env var** — do not rely on the auto-generated key in
   the data volume. If the database volume is compromised, the SECRET_KEY should
   not be on the same volume.
2. **Set an analytics retention window** — Settings -> Data -> Analytics
   retention. 90 days is a reasonable default. Infinite retention increases
   your compliance surface.
3. **Terminate TLS** — Use a reverse proxy (Caddy, Nginx, Cloudflare Tunnel)
   for HTTPS. Without TLS, session cookies and admin credentials transit in
   plaintext.
4. **Regular database backups** — Enable automatic backups in Settings ->
   Data (stored locally under `./data/backups`). In-app backups do not leave
   the machine — for offsite copies, add the
   `docker-compose.with-backup.yml` sidecar and follow the 3-2-1 rule.
5. **Restrict network access** — Do not expose the SQLite port. Only expose the
   LinkBreeze HTTP port through a reverse proxy.
6. **Treat webhook URLs as sensitive** — Webhook notification URLs
   (Settings -> Integration) embed an auth token for Discord/Slack and are
   stored in the database. The server POSTs milestone notifications to them
   (http/https only; the URL is owner-configured in an admin-only surface,
   so server-side fetching is trusted-by-owner configuration — revisit if a
   multi-user admin/user split ever lands). Do not paste webhook URLs into
   logs, screenshots, or issue reports; rotate a URL you have exposed.

## Accessibility

LinkBreeze is built on shadcn/ui (Radix Primitives), which provides WAI-ARIA
compliant components out of the box:

- Keyboard navigation (Tab, Enter, Escape) works on all interactive elements
- Focus indicators are visible on all form fields, buttons, and dialogs
- Drag-and-drop links are keyboard-accessible via alternative controls
- Color themes meet WCAG AA contrast ratios
- Screen-reader-friendly markup (aria-labels, semantic HTML, role attributes)

The public link page is designed to be fully accessible — it's a simple list of
links that works without JavaScript enabled.

If you encounter an accessibility issue, please
[open a bug report](https://github.com/OmniRise/LinkBreeze/issues/new?template=bug_report.md)
with the **Accessibility** label.
