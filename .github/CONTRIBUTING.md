# Contributing to LinkBreeze

Thanks for your interest in contributing! This guide covers everything you need.

## 🚀 Quick Start (Development)

```bash
git clone https://github.com/OmniRise/LinkBreeze.git
cd LinkBreeze
npm install
cp .env.example .env
npx drizzle-kit migrate
npm run dev
```

Visit `http://localhost:3000` — you'll see the setup wizard on first run.

## 📋 Prerequisites

- Node.js 22+
- npm 10+
- No external database needed (SQLite is embedded)

## 🧑‍💻 Development Workflow

1. **Fork** the repo and create your branch:
   ```bash
   git checkout -b feat/your-feature-name
   ```

2. **Make changes.** Follow existing code patterns:
   - All database access goes through `src/server/queries/` — never call Drizzle directly from components
   - All inputs validated with Zod
   - Server Components for public-facing pages (zero client-side JS bundles — no React runtime ships to the public page)
   - Client Components only for admin dashboard (marked with `"use client"`)

3. **Test your changes:**
   ```bash
   npx tsc --noEmit --skipLibCheck  # Type check
   npm run test                      # Unit tests (Vitest)
   npm run build                     # Full build
   ```

4. **Commit** using conventional commits:
   ```bash
   git commit -m "feat: add new theme preset"
   git commit -m "fix: link reorder not persisting"
   git commit -m "docs: update README deployment section"
   ```

5. **Open a Pull Request** — fill out the PR template.

## 🎨 Contributing a Theme

Themes in LinkBreeze are stored in the database and managed through the admin
panel's theme customizer. There is no JSON file system — themes are live config.

### How to submit a theme

1. **Run LinkBreeze locally** (see Quick Start above)
2. **Open the theme customizer** at `http://localhost:3000/theme`
3. **Design your theme** — set colors, fonts, backgrounds, animations, link styles
4. **Take a screenshot** of the public page with your theme applied (mobile view preferred)
5. **Export the theme** — use the theme export button on the Theme page
   (`/theme` → Export), or use the backup export feature (`/settings` → Export)
   and extract the theme object
6. **Open a [Theme Submission issue](https://github.com/OmniRise/LinkBreeze/issues/new?template=theme_submission.md)** with the values and screenshot

### Theme Properties

Themes use a CSS custom property (`--lb-*`) token system. The full property set:

| Property | Type | Options |
|----------|------|---------|
| `name` | string | Display name |
| `backgroundType` | string | `solid`, `gradient`, `radial`, `mesh`, `aurora`, `animatedGradient`, `image`, `pattern` |
| `backgroundValue` | string | Comma-separated colors, or image URL for `image` type |
| `backgroundAngle` | string | `90deg`, `135deg`, `160deg`, `180deg`, `radial` |
| `overlayColor` | string | Hex color for image overlay |
| `overlayOpacity` | string | `0`–`100` (percentage) |
| `primaryColor` | string | Hex/rgba for accent |
| `secondaryColor` | string | Hex/rgba for secondary accent |
| `textColor` | string | Hex/rgba for primary text |
| `mutedTextColor` | string | Hex/rgba for muted text |
| `cardBackground` | string | Hex/rgba for card background |
| `cardBorderColor` | string | Hex/rgba for card border |
| `fontFamily` | string | `inter`, `poppins`, `playfair`, `jetbrains`, `space-grotesk`, `dm-sans`, `lora`, `bebas`, `sora`, `outfit` |
| `fontScale` | string | `80`–`150` (percentage) |
| `fontWeight` | string | `300`, `400`, `500`, `600`, `700` |
| `letterSpacing` | string | `-2` to `5` |
| `linkStyle` | string | `pill`, `rounded`, `sharp`, `glass`, `outline`, `neon` |
| `hoverEffect` | string | `lift`, `scale`, `glow`, `none` |
| `animationType` | string | `lift`, `scale`, `none` (reveal animation) |
| `radius` | string | `auto`, `0px`, `8px`, `12px`, `16px`, `9999px` |
| `buttonSize` | string | `sm`, `md`, `lg` |
| `borderWidth` | string | `0px`, `1px`, `2px`, `3px` |
| `shadowStrength` | string | `none`, `subtle`, `soft`, `medium`, `strong` |
| `containerWidth` | string | `480px`, `540px`, `640px` |
| `alignment` | string | `left`, `center`, `right` |
| `density` | string | `compact`, `normal`, `relaxed` |
| `glow` | string | `true`, `false` |
| `glowColor` | string | Hex color for glow effect |
| `blur` | string | `0px`, `8px`, `12px`, `20px` |
| `noise` | string | `true`, `false` |
| `mode` | string | `light`, `dark` |

## 📦 Packaging and Deploy Integrations

The official distribution of LinkBreeze is the published Docker image plus a
compose file.

**Maintained by the project:**

- Docker, Docker Compose, and the install script (documented in the README)
- CasaOS App Store listing: sources in `packaging/casaos/`
- Runtipi app store: sources in `packaging/runtipi/`
- Unraid Community Applications: sources in `packaging/unraid/`

**Welcome as community PRs (reviewed, not maintained by us):**

- Hosting-provider one-click deploy buttons
- Additional platform catalogs: TrueNAS, Umbrel, Synology, and similar

Community packaging PRs must pull the official published image (no source
builds), mount the data volume for `/app/data`, and stay limited to
documentation or packaging metadata changes.

## 🐛 Reporting Bugs

Use the [Bug Report template](https://github.com/OmniRise/LinkBreeze/issues/new?template=bug_report.md). Include:
- LinkBreeze version
- Deployment method (Docker, manual, Vercel)
- Steps to reproduce
- Expected vs actual behavior
- Screenshots if applicable

## 💡 Requesting Features

Use the [Feature Request template](https://github.com/OmniRise/LinkBreeze/issues/new?template=feature_request.md).

## 📏 Coding Standards

- **TypeScript strict mode** — no `any` types
- **ESLint** — must pass without errors
- **Zod validation** on every input boundary
- **Conventional commits** — `feat:`, `fix:`, `docs:`, `refactor:`, `chore:`
- **No direct DB access** from components — always use the queries layer
- **Tests** — add or update tests for any logic change. Run `npm run test` before submitting.

## 🏗️ Architecture Notes

See [`docs/adr/`](../docs/adr/) for detailed reasoning behind technology choices.
Key principle: **all database access is abstracted** through `src/server/queries/`
to enable future multi-tenant support without rewriting the app.

## ❓ Questions?

Open an [issue](https://github.com/OmniRise/LinkBreeze/issues) with the
`question` label.
