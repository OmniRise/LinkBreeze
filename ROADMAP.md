# LinkBreeze Roadmap

A high-level view of where LinkBreeze is heading. This is a living document: items move between sections as work happens. Statuses, not dates - features land when they are ready.

**Now** = actively being built. **Next** = committed, comes after Now. **Later** = planned, no commitment yet.

Feature requests are welcome - open an issue or join the [Discord](https://discord.gg/bAJMW3bAJa).

## Now

- **Shared notification layer** (#13) - webhook notifications that any feature can plug into (analytics milestones today, more tomorrow), with Discord-style and Telegram-compatible payloads.

- **More embed providers** - grow the embed widget beyond YouTube, Spotify, Vimeo, SoundCloud and Bandcamp: TikTok, Twitch, Dailymotion, Odysee, Rumble, GitHub repo cards, Google Forms, Tally, Cal.com, Google Maps, and generic Open Graph previews for any other URL. Discord and Slack integrations ride the shared notification layer (#13).

- **Link tags and saved filters** - tag links by campaign, product, client or lifecycle stage, save filter queries to the dashboard, and use tags as the foundation for bulk operations, conversion goals and smart ordering.

- **Social proof counters** - optional aggregate counters next to public links. Real numbers only.

- **Structured analytics injection** - provider dropdown wrapping the existing script allowlist (EXTRA_SCRIPT_SRC).

- **Calendar links** - server-generated add-to-calendar (ICS) actions for events, launches and appointments. No client-side JavaScript.

## Next

- **Link guardian** - scheduled broken-link checking (off / daily / weekly, owner's choice) with a manual "check now" button and per-link health status. Bot-wall responses are reported as unknown, never as broken. Extensions: a safe fallback state for failed links (visitors see "temporarily unavailable" instead of a dead page), SSL certificate expiry indicators, and destination change detection (title, image, final URL).

- **Link-level conversion goals** - mark a link as primary, signup, purchase or newsletter and track click-through and conversion rate per goal. Built on link tags.

- **Smart ordering** - optional automatic page ordering by click-through rate or conversion, recomputed on a daily schedule rather than per visit. Manual drag-and-drop pins a link out of auto-ranking, active A/B tests are excluded from reordering, and new links keep their manual slot. Click-through mode ships first; conversion-weighted mode follows link tags.

- **Traffic-source intelligence** - classify referrers into search, social, direct, QR, email and custom campaign buckets on the analytics dashboard.

- **Aggregate analytics export** - JSON export and API v1 endpoints for aggregate statistics only. Visitor-level data never leaves the instance.

- **Bulk link operations** - multi-select links to pause, schedule, tag, move between pages or update UTM parameters in one action.

- **Standalone link shortener** - shorten any URL to a /go/ slug, independent of page links: per-short-link QR code (reusing the QR customizer), click analytics and channel tagging for social posts and ads.

- **Async messaging inbox** - optional message form element on public pages (progressive-enhancement server action, same pattern as email capture), with an inbox in the admin dashboard and replies sent by email. No client-side JavaScript, no realtime infrastructure.

- **Outbound email layer** (#130) - a shared SMTP sending primitive (admin-configured credentials, send-test button) that the shared notification layer (#13), async messaging inbox replies and email capture v2 forwarding all ride. No third-party email API by default; the instance owner brings their own SMTP server.

- **Email capture v2** - forward subscriptions to an external provider through a generic webhook or the Listmonk API, with double opt-in respected. The local SQLite copy always stays; CSV export remains the privacy-preserving default. MailerLite, Brevo and Buttondown follow on demand.

- **One-click update** - admin-panel update action on top of the existing update script, version notifications and backup-before-update flow, with confirmation and rollback surfaced in the UI.

## Later

- **Export a page as static HTML** (#80).

- **Component/block system** - formalize the existing page elements (links, embeds, email capture, dividers, section headers) into a token-aware block registry, with per-block scheduling, global blocks shared across pages and reusable page templates (creator, business, event, portfolio, link hub). A template gallery joins the onboarding wizard.

- **Page versioning** - automatic snapshots before major edits with one-click restore.

- **Funnel view** - page view to link click to destination conversion, measured through UTM parameters. No redirect interstitials - public links stay direct hrefs.

- **Cohort and comparison views** - this week vs last week, one page vs another, variant A vs variant B.

- **Benchmark insights** - actionable intelligence on the dashboard: top link vs page average, best-converting traffic source, best day of the week.

- **Click-to-load embeds** - privacy-first placeholders that only load the embed after a tap.

- **Audience targeting** - optional per-visitor personalization rules (referrer, language, device, time of day, URL parameters).

- **Real-time dashboard** - live visitor count and click activity, server-sent events or short polling.

- **Click heatmap** - visual attention overlay per public page. Opt-in per page only - it collects more than the default aggregate analytics.

- **RSS and social feed cards** - optional server-rendered cards for the latest post, video, release or product. No client-side JavaScript.

- **Intake forms on public pages** (#125) - fully customizable forms built in the dashboard (text, email, phone, dropdowns, checkboxes, file upload with type and size limits), rendered on the public page, with submissions, CSV export, and email or webhook notifications built on #13.

- **Product block and orders** - product block (image, price, description) pointing at Stripe payment links or Gumroad; orders ledger and earnings dashboard driven by Stripe webhooks. The instance owner brings their own Stripe keys; LinkBreeze never holds funds.

- **Social planner** - content calendar to plan and schedule your own posts, plus an opt-in auto-post layer where each user connects their own platform API credentials. Disabled by default; the core product works without it.

- **Instagram auto-reply** - opt-in keyword auto-reply with two paths: the user's own Instagram API credentials, or a guided ManyChat integration. Both live in the integrations menu and stay off unless enabled.

- **Modular dashboard** - fully configurable admin dashboard in the style of a widget grid: pick charts, place and resize them, per-user layouts. Built on the aggregate analytics endpoints. Admin-side only - public pages stay server-rendered without client JavaScript.

- **Guided visitor flows** - optional multi-step "choose your path" screens on a public page, fully server-rendered, no JavaScript required.

## Shipped

Recent highlights - the full history lives in [CHANGELOG.md](CHANGELOG.md):

- **v1.6.1** - security hardening (instance-admin gates on API keys, backups and exports; username-probing endpoints closed), Custom URI links for any non-web scheme like xmpp:, a live Rich-preview thumbnail in the link dialog, and markdown bold/italic that compose with links.

- **v1.6.0** - multi-user accounts with customizable roles and an audit log, generic OIDC/OAuth2 SSO, a public REST API v1 with OpenAPI docs, A/B testing for links, Add-link drafts, markdown popup cards, native vCard contact cards customizable per link, and the November Next.js security release.
