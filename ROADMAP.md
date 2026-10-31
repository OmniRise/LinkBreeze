# LinkBreeze Roadmap

A high-level view of where LinkBreeze is heading. This is a living document: items move between sections as work happens. Statuses, not dates - features land when they are ready.

**Now** = actively being built. **Next** = committed, comes after Now. **Later** = planned, no commitment yet.

Feature requests are welcome - open an issue or join the [Discord](https://discord.gg/bAJMW3bAJa).

## Now

- **Multi-user support with generic OIDC/OAuth2 SSO** (#124) - multiple accounts per instance, each with their own public page, plus sign-in through any standard identity provider (Authentik, Keycloak, Authelia, Pocket ID, ...) alongside local accounts.
- **A/B testing for links** (#81) - variant split, per-variant analytics, promote-to-winner.

## Next

- **Shared notification layer** (#13) - webhook notifications that any feature can plug into (analytics milestones today, more tomorrow), with Discord-style and Telegram-compatible payloads.
- **Public REST API** (#4) - programmatic link management for power users and integrations.
- **Link guardian** - scheduled broken-link checking (off / daily / weekly, owner's choice) with a manual "check now" button and per-link health status. Bot-wall responses are reported as unknown, never as broken. _(issue to be linked)_
- **Clickable hyperlinks in text cards** - write `[text](url)` in a text card and it renders as a clickable link, so any text can point to another page or site. _(issue to be linked)_

## Later

- **Export a page as static HTML** (#80).
- **Intake forms on public pages** (#125) - fully customizable forms built in the dashboard (text, email, phone, dropdowns, checkboxes, file upload with type and size limits), rendered on the public page, with submissions, CSV export, and email or webhook notifications built on #13.
- **Guided visitor flows** - optional multi-step "choose your path" screens on a public page, fully server-rendered, no JavaScript required.

## Shipped

Recent highlights - the full history lives in [CHANGELOG.md](CHANGELOG.md):

- **v1.5.1** - 11-language admin and READMEs, first-party CasaOS, Runtipi and Unraid app-store packaging, the Settings update status card, a Linktree import fix, and a demo-guard security fix.
- **v1.5.0** - custom domains for pages, automatic scheduled backups, custom `/go/` redirect slugs, `@` in page slugs, Poster Hero OG cards, official `omnirise/linkbreeze` Docker image, one-shot `update.sh`.
