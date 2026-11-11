# LinkBreeze Roadmap

A high-level view of where LinkBreeze is heading. This is a living document: items move between sections as work happens. Statuses, not dates - features land when they are ready.

**Now** = actively being built. **Next** = committed, comes after Now. **Later** = planned, no commitment yet.

Feature requests are welcome - open an issue or join the [Discord](https://discord.gg/bAJMW3bAJa).

## Now

- **Shared notification layer** (#13) - webhook notifications that any feature can plug into (analytics milestones today, more tomorrow), with Discord-style and Telegram-compatible payloads.

## Next

- **Link guardian** - scheduled broken-link checking (off / daily / weekly, owner's choice) with a manual "check now" button and per-link health status. Bot-wall responses are reported as unknown, never as broken. 

## Later

- **Export a page as static HTML** (#80).

- **Intake forms on public pages** (#125) - fully customizable forms built in the dashboard (text, email, phone, dropdowns, checkboxes, file upload with type and size limits), rendered on the public page, with submissions, CSV export, and email or webhook notifications built on #13.

- **Guided visitor flows** - optional multi-step "choose your path" screens on a public page, fully server-rendered, no JavaScript required.

## Shipped

Recent highlights - the full history lives in [CHANGELOG.md](CHANGELOG.md):

- **v1.6.0** - multi-user accounts with customizable roles and an audit log, generic OIDC/OAuth2 SSO, a public REST API v1 with OpenAPI docs, A/B testing for links, Add-link drafts, markdown popup cards, native vCard contact cards customizable per link, and the November Next.js security release.
