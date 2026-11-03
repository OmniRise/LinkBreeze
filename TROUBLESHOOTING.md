# Troubleshooting

Common issues and how to fix them. If your problem isn't listed here,
[open an issue](https://github.com/OmniRise/LinkBreeze/issues).

---

## Docker Desktop not running (Windows)

**Symptom:** `failed to connect to the docker API at npipe:////./pipe/dockerDesktopLinuxEngine`

Docker Desktop hasn't started yet. Open it from the Start menu, wait for the
whale icon in the system tray to turn green (30–60 seconds on first boot),
then retry your command.

If the whale never turns green: open Docker Desktop → Settings → ensure the
WSL2 backend is enabled.

---

## PowerShell command syntax errors

**Symptom:** `Missing expression after unary operator '--'`

PowerShell does not support `\` for line continuation (that's bash syntax).
Either run the `docker run` command as a single line (recommended):

```powershell
docker run -d --name linkbreeze --restart unless-stopped -p 3000:3000 -v linkbreeze-data:/app/data docker.io/omnirise/linkbreeze:latest
```

Or use backticks `` ` `` instead of backslashes for multi-line:

```powershell
docker run -d `
  --name linkbreeze `
  --restart unless-stopped `
  -p 3000:3000 `
  -v linkbreeze-data:/app/data `
  docker.io/omnirise/linkbreeze:latest
```

---

## Forgot admin password or username

LinkBreeze v1 is single-user and self-hosted — there is no self-service
password reset (no email server, no SMTP). Pick one of these methods.

First, find your container name (it isn't always `linkbreeze` — compose
projects and platforms like TrueNAS name it differently):

```bash
docker ps --format '{{.Names}}\t{{.Image}}' | grep -i linkbreeze
```

If you run it via docker compose, `docker compose ps` from the compose
folder works too. Replace `<container>` in the commands below with that name.

### Option A — Reset the password hash (keeps all data)

```bash
# Replace "newpassword" with your desired password
docker exec -it <container> node -e "
  const Database = require('better-sqlite3');
  const { hash } = require('@node-rs/argon2');
  const db = new Database('/app/data/linkbreeze.db');
  hash('newpassword', { memoryCost: 19456, timeCost: 2, parallelism: 1 }).then((h) => {
    db.prepare('UPDATE users SET password_hash = ?').run(h);
    console.log('Password updated successfully');
  });
"
```

Note: passwords are hashed with Argon2id. If you plant an old-style bcrypt
hash (e.g. from a pre-upgrade backup), it still verifies and is automatically
upgraded to Argon2id on the next successful login.

If you also forgot the username, list it first:

```bash
docker exec -it <container> node -e "
  const db = new (require('better-sqlite3'))('/app/data/linkbreeze.db');
  console.log(db.prepare('SELECT username FROM users').all());
"
```

### Option B — Delete the volume and re-setup (loses all data)

```bash
docker stop <container> && docker rm <container>
docker volume rm linkbreeze-data
# Re-run the docker run command — the setup wizard will appear
```

### Option C — Running without Docker

```bash
sqlite3 data/linkbreeze.db "DELETE FROM users;"
npm run dev   # Visit the app → setup wizard appears
```

---

## Port 3000 already in use

**Symptom:** `EADDRINUSE: address already in use 0.0.0.0:3000`

Either stop the other process or map to a different port:

```bash
docker run -d --name linkbreeze -p 8080:3000 -v linkbreeze-data:/app/data docker.io/omnirise/linkbreeze:latest
```

---

## Database is locked / corrupted

Stop the container, back up the database file, then restart:

```bash
docker stop linkbreeze
cp ./data/linkbreeze.db ./data/linkbreeze.db.bak
docker start linkbreeze
```

If it won't start after that, delete the database and re-run setup:

```bash
docker stop linkbreeze && docker rm linkbreeze
docker volume rm linkbreeze-data
# Re-run the docker run command
```

---

## Analytics not tracking

1. Check that the public page loads at `http://localhost:3000/your-slug`
2. Open browser DevTools → Network tab → look for a `POST /api/track` call
3. If it returns 429, you're being rate-limited (10 requests / 10 seconds per IP)
4. If retention is set to a low number, old data may have been pruned automatically

---

## Changes not showing on public page

The public page is cached. If you changed something in the admin panel and it
isn't reflected on the public page, hard-refresh: `Ctrl+Shift+R` (or
`Cmd+Shift+R` on Mac). In Docker, ensure the container was restarted after any
environment variable changes.

---

## Upgrading LinkBreeze

### Docker

```bash
docker compose pull && docker compose up -d
```

That's it. New versions pull automatically.

### What happens to my data on upgrade?

**Nothing destructive.** LinkBreeze uses Drizzle ORM migrations that run
**automatically on container startup**. When you pull a new image and restart:

1. The app checks for pending schema migrations
2. Applies them forward-only (no destructive operations without backup)
3. Your links, settings, analytics, and themes are preserved

You never need to run `drizzle-kit migrate` manually in Docker — it's handled
for you. If a migration ever fails, the old database is left untouched and the
container logs will show the error.

### Running without Docker

```bash
git pull
npm install
npx drizzle-kit migrate   # apply any new migrations
npm run build && npm start
```

---

## How slugs work

Your public page lives at `/<slug>`. The default slug is `u`.

- **Changing the slug**: Go to Settings → Page URL. The slug must be
  alphanumeric with hyphens/underscores, max 64 characters.
- **After changing**: The old slug immediately returns a 404. There are **no
  redirects** — update any links or QR codes pointing to the old URL.
- **Reserved words**: `/login`, `/setup`, `/dashboard`, `/links`, `/profile`,
  `/settings`, `/theme`, `/pages`, `/domains` are admin-reserved and cannot
  be used as slugs.
- **QR codes**: QR codes are generated for the current slug. If you change your
  slug, download a new QR code from the admin panel.

## Custom domains not working

Full setup guide: [docs/custom-domains.md](docs/custom-domains.md).

### Domain shows 404 or the wrong site

1. **DNS**: the domain needs an `A`/`AAAA` record (or `CNAME`) pointing at
   the machine running LinkBreeze. Check with `dig jane.com` or the
   **Check DNS** button in Admin → Domains.
2. **Reverse proxy**: every bound host must route to the LinkBreeze
   container, and the proxy must pass the original host through
   (`proxy_set_header Host $host;` in nginx). If the proxy sends its
   `server_name` instead of the visitor's host, host routing cannot match.
3. **Binding**: the domain must exist in Admin → Domains. A binding shows
   **Pending** until its first real request arrives — visit the domain once
   (or press **Activate now** to test before DNS propagates).

### TLS / certificate errors

LinkBreeze never terminates TLS — the reverse proxy does. You need a
wildcard certificate (e.g. `*.example.com`) or per-domain certificates.
Caddy automates this (see `docs/custom-domains.md` for a working config);
with nginx use certbot's DNS-01 challenge for wildcards.

### Admin, login, or setup returns 404 on my domain

That is the **admin host lock** working as designed. Admin surfaces only
answer on the primary host — the one configured in Admin → Domains →
Routing policy or the `LINKBREEZE_PRIMARY_HOST` environment variable (env
wins). Visit your primary host to log in. To disable the lock entirely, set
Admin host lock to **Off** — not recommended for public deployments.

### www.jane.com does not work

By default `www.<bound-domain>` redirects to the bound domain. If it
doesn't, either bind `www.jane.com` explicitly in Admin → Domains, or check
that your DNS record and reverse proxy cover the `www` subdomain. The
behavior is configurable in Routing policy → www handling.

### The same page is reachable at /slug and the domain

With the default canonical strategy (**301**), slug URLs on the primary
host redirect to the domain automatically. If your edge proxy makes 301s
impossible, switch the canonical strategy to **Canonical tag only** — the
page then emits `<link rel="canonical">` pointing at the domain root
instead.

## SSO (OIDC) sign-in not working

LinkBreeze's SSO (#124 multi-user) talks to any standard OpenID Connect
provider (Authentik, Keycloak, Authelia, Pocket ID...) via discovery - no
per-provider configuration.

**Setup checklist:**

1. In your identity provider, register a confidential client (authorization
   code flow + PKCE) with redirect URI `https://YOUR-LINKBREEZE-HOST/api/auth/oidc/callback`.
2. Set the client secret as the `OIDC_CLIENT_SECRET` environment variable on
   the LinkBreeze container and restart it. The secret is never entered in
   the admin UI - settings are exported verbatim into backup files.
3. In LinkBreeze, open **Settings → Security → Single sign-on** and fill in
   the issuer URL (e.g. `https://idp.example.com/application/o/linkbreeze`)
   and the client ID. LinkBreeze fetches
   `/.well-known/openid-configuration` from that issuer.

**Common failures:**

- The login page shows no SSO button → issuer or client ID is empty, or
  `OIDC_CLIENT_SECRET` is not set. All three are required.
- "Could not reach the discovery document" → wrong issuer URL, or the
  LinkBreeze container cannot reach the identity provider (check egress and
  DNS). In production the issuer must be **https** - `http://localhost`
  issuers only work for local development instances.
- Login redirects back with an error immediately → the redirect URI
  registered at the provider must match `https://YOUR-HOST/api/auth/oidc/callback`
  byte-for-byte (scheme, host, path). Behind a proxy that rewrites
  `Host`, set `LINKBREEZE_TRUST_X_FORWARDED_HOST=true` (only behind a proxy
  you control that OVERWRITES the header).
- "This SSO identity is already linked to another account" → the identity
  provider account is bound to a different LinkBreeze user. Unbind it there
  or use that account.
- JIT accounts don't appear → JIT provisioning is off (Settings → Security),
  or an admin disabled the account after creation (disabled accounts cannot
  sign in via SSO either).
- Locked out with SSO-only mode? Set the mode back to "SSO alongside
  password sign-in" - or clear the `oidcMode` key in the `settings` table of
  `data/linkbreeze.db` - then sign in with the local admin account.
