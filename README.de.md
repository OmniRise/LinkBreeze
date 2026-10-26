<div align="center">

<img src="public/Public-Page-iPhone-Dashboard-iMac.png" alt="Banner" width="100%" />

---

[English](README.md) · [العربية](README.ar.md) · [中文](README.zh.md) · [Français](README.fr.md) · **Deutsch** · [Italiano](README.it.md) · [日本語](README.ja.md) · [Português (Brasil)](README.pt-BR.md) · [Русский](README.ru.md) · [Español](README.es.md) · [Türkçe](README.tr.md)

[![License: MIT](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)](LICENSE)
[![Docker](https://img.shields.io/badge/omnirise%2Flinkbreeze-2496ED?style=for-the-badge&logo=docker&logoColor=white)](https://hub.docker.com/r/omnirise/linkbreeze)

[![Website](https://img.shields.io/badge/linkbreeze-533fd6?style=for-the-badge&logo=googlechrome&logoColor=white)](https://linkbreeze.omnirise.dev/)
[![OmniRise](https://img.shields.io/badge/omnirise-06B6D4?style=for-the-badge&logo=rocket&logoColor=white)](https://omnirise.dev)
[![YouTube](https://img.shields.io/badge/YouTube-red?style=for-the-badge&logo=youtube&logoColor=white)](https://www.youtube.com/watch?v=_Ipf-_1B4BY)

[![CI](https://img.shields.io/github/actions/workflow/status/OmniRise/LinkBreeze/ci.yml?style=for-the-badge&logo=githubactions&label=CI&logoColor=white)](https://github.com/OmniRise/LinkBreeze/actions/workflows/ci.yml)
[![Latest Release](https://img.shields.io/github/v/release/OmniRise/LinkBreeze?style=for-the-badge&logo=github&color=blue)](https://github.com/OmniRise/LinkBreeze/releases/latest)
[![Discord](https://img.shields.io/discord/1559020936253022209?style=for-the-badge&logo=discord&logoColor=white&label=Discord&color=5865F2)](https://discord.gg/bAJMW3bAJa)

</div>

---

> **Schluss mit 15 $/Monat für Linktree.** LinkBreeze ist ein kostenloses, selbst gehostetes Link-Hub: schnell, anpassbar, mit eingebauten Statistiken. **In einem Befehl installiert.**

<div align="center">

&nbsp;[**🔗 Live-Demo**](https://linkbreeze-demo.omnirise.dev/linkbreeze)&nbsp;&nbsp;·&nbsp;&nbsp;
[**🔐 Demo-Dashboard**](https://linkbreeze-demo.omnirise.dev/dashboard)

</div>

---

## ✨ Funktionen

<div align="center">
<table>
  <tr>
    <td width="50%" valign="top">🔗 <strong>Unterstützung für mehrere Seiten</strong><br/>Unbegrenzt viele Seiten, jede mit eigenem Slug, Theme, Links und Statistiken</td>
    <td valign="top">🎨 <strong>Themes + Customizer</strong><br/>11 Presets plus vollständiger Token-basierter Customizer mit Import/Export</td>
  </tr>
  <tr>
    <td valign="top">📊 <strong>Privatsphäre-first-Statistiken</strong><br/>Aufrufe, Klicks, Referrer, Geräte. Ohne Cookies, IPs gehasht, automatische Bereinigung</td>
    <td valign="top">🧭 <strong>Migrations-Assistent</strong><br/>Import aus Linktree, Bento, Hopp.bio, LittleLink oder jedem HTML/JSON-Export</td>
  </tr>
  <tr>
    <td valign="top">🔒 <strong>Selbst gehostet</strong><br/>Deine Daten, dein Server. Keine Tracker, keine Werbung, kein Abo</td>
    <td valign="top">🐳 <strong>Installation mit einem Befehl</strong><br/>Ein curl-Befehl. Erkennt Docker oder Podman automatisch und du bist online</td>
  </tr>
  <tr>
    <td valign="top">📱 <strong>Eingebettete Widgets</strong><br/>YouTube, Spotify, SoundCloud, Vimeo und Bandcamp auf deiner Seite</td>
    <td valign="top">🎯 <strong>QR-Codes</strong><br/>Automatisch generiert, eigene Farben, Avatar oder Favicon in der Mitte, SVG/PNG bis 1024 px</td>
  </tr>
  <tr>
    <td width="50%" valign="top">🌐 <strong>Eigene Domains</strong><br/>Verlinke eigene Domains auf Seiten - Besucher landen auf jane.com, ohne /slug</td>
    <td valign="top">⏰ <strong>Geplante Backups</strong><br/>Interne tägliche/wöchentliche/monatliche Backups mit Ein-Klick-Wiederherstellung, ohne Cron</td>
  </tr>
</table>


⚡ **Null clientseitiges JavaScript. Lädt in unter 300 ms. Rein serverseitig gerendertes HTML.**

</div>

<details>
<summary>✨ &nbsp;Alle Funktionen</summary>

- **🔗 Link-Verwaltung** - Unbegrenzt viele Links per Drag-and-Drop hinzufügen, sortieren und anpassen
- **🌐 Auto-Favicon-Links** - Links zeigen automatisch das Favicon der Zielwebsite, kein Icon-Upload nötig
- **🖼️ Link-Miniaturansichten** - Bilder zu deinen Links hinzufügen für visuelle Vorschaukarten
- **⏰ Link-Planung** - Plane, dass Links automatisch erscheinen oder verschwinden, mit Datum- und Uhrzeitsteuerung
- **🏷️ Eigene Weiterleitungs-Slugs** - Stabile, teilbare `/go/your-name`-Kurzlinks, die Löschen-und-Neu-Anlegen überstehen
- **📈 Externe Analysen** - Plausible, Umami, Matomo oder Google Analytics mit einem einzigen Einfügen einbinden
- **🖼️ Social-Vorschaubilder (OG)** - Sharecards werden automatisch aus dem Theme deiner Seite gerendert, oder lade ein eigenes Bild hoch mit Kontrolle über Zuschnitt, Position und Zoom
- **✏️ Eigenes CSS** - Feintune deine Seite mit direkter CSS-Injektion
- **📧 E-Mail-Sammlung** - Abonnenten-E-Mails auf deiner öffentlichen Seite sammeln, Export als CSV
- **🔔 Update-Benachrichtigungen** - Dashboard-Banner, wenn eine neue Version verfügbar ist. Kein Phone-Home, kein Auto-Update
- **🔑 Schnelles Admin-Panel** - Alles oben Genannte aus einem übersichtlichen, blitzschnellen Dashboard

- **🌐 Eigene Domains** - Eigene Domains auf Seiten binden; exklusiver oder Hub-Scope, automatische Canonical-Weiterleitungen, strikte Admin-Host-Sperre
- **⏰ Geplante Backups** - Interne tägliche/wöchentliche/monatliche Backups mit Aufbewahrung und Ein-Klick-Wiederherstellung, ohne Cron
</details>

## 🚀 Schnellstart

**Ein Befehl. Keine Konfiguration. In 30 Sekunden online:**

```bash
curl -fsSL https://linkbreeze.omnirise.dev/install.sh | bash
```

Das Skript erkennt Docker oder Podman, zieht das Image und startet den Container. Führe es mit `sudo bash` aus und antworte mit **y**, um auch den Autostart beim Booten zu aktivieren.

Öffne dann **http://localhost:3000** - der Einrichtungsassistent dauert keine 30 Sekunden.

<details>
<summary>🔍 &nbsp;Möchtest du das Skript vor dem Ausführen prüfen?</summary>

```bash
curl -fsSL https://linkbreeze.omnirise.dev/install.sh -o install.sh
less install.sh
bash install.sh
```

</details>

**Lieber eine andere Methode?** Klapp eine der folgenden auf.

<details>
<summary>🐳 &nbsp;Docker</summary>

Kein Node.js, kein npm, keine Config-Dateien. Multi-Arch-Images: `linux/amd64` und `linux/arm64` (Raspberry Pi 3/4/5, Apple Silicon, ARM-VPS).

**Linux / macOS / Windows CMD:**

```bash
docker run -d --name linkbreeze --restart unless-stopped -p 3000:3000 -v linkbreeze-data:/app/data docker.io/omnirise/linkbreeze:latest
```

**Windows PowerShell** - nutze Backticks für Zeilenumbrüche:

```powershell
docker run -d `
  --name linkbreeze `
  --restart unless-stopped `
  -p 3000:3000 `
  -v linkbreeze-data:/app/data `
  docker.io/omnirise/linkbreeze:latest
```

> Datenbank-Migrationen laufen beim Start des Containers automatisch.

</details>

<details>
<summary>🧩 &nbsp;Docker Compose</summary>

Erstelle eine `docker-compose.yml`:

```yaml
services:
  linkbreeze:
    image: docker.io/omnirise/linkbreeze:latest
    ports:
      - "3000:3000"
    volumes:
      - linkbreeze-data:/app/data
    restart: unless-stopped

volumes:
  linkbreeze-data:
```

```bash
docker compose up -d
```

Upgrade: `docker compose pull && docker compose up -d` · Logs: `docker compose logs -f linkbreeze`

Lieber aus dem Quellcode bauen? `git clone https://github.com/OmniRise/LinkBreeze.git && cd LinkBreeze && docker compose up -d --build`

</details>

<details>
<summary>☁️ &nbsp;Coolify</summary>

1. **+ New Resource** → **Docker Compose Empty**
2. Füge die Compose-Datei aus dem Abschnitt oben ein
3. Lege eine Domain fest (z. B. `links.deinedomain.de`) - Coolify kümmert sich automatisch um Let's Encrypt
4. Klicke auf **Deploy**

</details>

<details>
<summary>📦 &nbsp;Synology NAS</summary>

Container Manager (DSM 7.2+):

1. Ziehe das Image `docker.io/omnirise/linkbreeze:latest` (**Image** → **Add**, falls nicht gefunden)
2. **Erstelle** einen Container: Name `linkbreeze`, Port `3000 → 3000`, Volume `/docker/linkbreeze/data → /app/data`, Restart-Richtlinie `Unless stopped`
3. Klicke auf **Done** - live unter `http://<nas-ip>:3000`

Deine Daten bleiben bei Image-Updates im Volume erhalten.

</details>

<details>
<summary>🔧 &nbsp;Podman</summary>

```bash
podman run -d --name linkbreeze --restart unless-stopped -p 3000:3000 -v linkbreeze-data:/app/data docker.io/omnirise/linkbreeze:latest
```

Berechtigungsfehler auf dem Volume? Führe zuerst `podman volume create linkbreeze-data` aus. Das Installations-Skript oben erkennt Podman automatisch.

</details>

<details>
<summary>🖥️ &nbsp;Portainer</summary>

1. **Stacks** → **Add stack**, nenne ihn `linkbreeze`
2. Füge die Compose-Datei aus dem Docker-Compose-Abschnitt oben ein
3. Klicke auf **Deploy the stack**

Updates: **Stacks** → `linkbreeze` → **Editor** → **Pull and redeploy**.

</details>

<details>
<summary>🔨 &nbsp;Manuell (ohne Docker)</summary>

Benötigt Node.js 18+.

```bash
git clone https://github.com/OmniRise/LinkBreeze.git
cd LinkBreeze
npm install
cp .env.example .env
# Edit .env to set your SECRET_KEY and DATABASE_PATH if needed
npm run db:migrate
npm run dev
```

Für Produktion: `npm run build && npm start`

</details>

<details>
<summary>🌍 &nbsp;Auf deiner Domain live gehen</summary>

Nach dem Deployment ist deine Seite unter `https://your-domain.com/your-slug` erreichbar.

1. Lege den A-Record deiner Domain auf die IP deines Servers
2. Setze Port 3000 frei oder schalte einen Reverse Proxy davor
3. Fertig

**Fertige Compose-Dateien** liegen in [`examples/`](examples/) - eine in sich geschlossene Datei pro Szenario:

| Was du willst | Nutze diese Datei |
|---------------|-------------------|
| Automatisches TLS, keine manuelle Konfiguration | `docker-compose.caddy.yml` oder `docker-compose.https-portal.yml` |
| Automatisches TLS mit Dashboard (Traefik) | `docker-compose.traefik.yml` |
| Keine offenen Ports (Zero-Trust) | `docker-compose.cloudflare-tunnel.yml` |
| Du nutzt schon Nginx + Certbot | `docker-compose.nginx.yml` |
| Geplante Backups aus der Oberfläche (kein Sidecar) | Eingebaut - aktivieren unter Einstellungen -> Daten |
| Geplante SQLite-Backups (Raw-Dump-Sidecar, S3-Offsite) | `docker-compose.with-backup.yml` |
| Betrieb unter Kubernetes | `kubernetes.yaml` |

**Caddy** (empfohlen - automatisches HTTPS):

```
links.example.com {
    reverse_proxy localhost:3000
}
```

**Nginx:**

```nginx
server {
    server_name links.example.com;
    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

**Cloudflare Tunnel** (keine offenen Ports, kein Domain-Kauf nötig):

```bash
cloudflared tunnel --url http://localhost:3000
```

</details>

## 📸 Screenshots

<details>
    <summary>Zum Aufklappen klicken</summary>
    <br/>

<table>
    <tr>
    <td>Öffentliche Seite</td>
    <td>Admin-Dashboard</td>
    </tr>
    <tr>
    <td><img src="public/screenshots/Public-Page(Aurora).jpeg" alt="Öffentliche Seite [Theme Aurora]" /></td>
    <td><img src="public/screenshots/Admin-Dashboard.jpeg" alt="Admin-Dashboard" /></td>
    </tr>
    <tr>
    <td>Links</td>
    <td>Profil</td>
    </tr>
    <tr>
    <td><img src="public/screenshots/Links.jpeg" alt="Links-Seite" /></td>
    <td><img src="public/screenshots/Profile.jpeg" alt="Profilseite" /></td>
    </tr>
    <tr>
    <td>Theme</td>
    <td>Live-Vorschau-Panel</td>
    </tr>
    <tr>
    <td><img src="public/screenshots/Theme.jpeg" alt="Theme-Seite" /></td>
    <td><img src="public/screenshots/Preview.jpeg" alt="Live-Vorschau-Panel" /></td>
    </tr>
    <tr>
    <td>Einstellungen [Allgemein]</td>
    <td>Einstellungen [Erscheinungsbild]</td>
    </tr>
    <tr>
    <td><img src="public/screenshots/Settings(General).jpeg" alt="Einstellungen [Tab Allgemein]" /></td>
    <td><img src="public/screenshots/Settings(Appearance).jpeg" alt="Einstellungen [Tab Erscheinungsbild]" /></td>
    <tr>
    <td>Einstellungen [Sicherheit]</td>
    <td>Einstellungen [Daten]</td>
    </tr>
    <tr>
    <td><img src="public/screenshots/Settings(Security).jpeg" alt="Einstellungen [Tab Sicherheit]" /></td>
    <td><img src="public/screenshots/Settings(Data).jpeg" alt="Einstellungen [Tab Daten]" /></td>
    </tr>
</table>

</details>

## 🆚 Vergleich

<div align="center">

| Funktion | Linktree | LinkStack | LittleLink | Shako | **LinkBreeze** |
|---------|----------|-----------|------------|-------|----------------|
| **Preis** | Kostenlos - 35 $/Monat | Kostenlos | Kostenlos | Kostenlos | **Kostenlos** |
| **Admin-Panel** | ✅ | ✅ | ❌ | ❌ | **✅ Schnell** |
| **Mehrere Seiten** | ❌ | ❌ | ❌ | ❌ | **✅ Unbegrenzt** |
| **Auto-Favicon-Links** | ❌ | ❌ | ❌ | ❌ | **✅** |
| **Migrations-Assistent** | ❌ | ❌ | ❌ | ❌ | **✅** |
| **Eingebaute Statistiken** | Basis, Vollversion kostenpflichtig | Basis | ❌ | ❌ | **✅ Vollständig & privat** |
| **E-Mail-Sammlung** | Kostenpflichtig | ❌ | ❌ | ❌ | **✅** |
| **Eingebettete Widgets** | Teilweise | ❌ | ❌ | ❌ | **✅** |
| **Link-Planung** | Kostenpflichtig | ❌ | ❌ | ❌ | **✅** |
| **Themes** | Kostenpflichtig | Begrenzt | Nur CSS | Konfig-Datei | **✅ Vollständiges Token-System** |
| **QR-Codes** | ✅ | ✅ | ❌ | ❌ | **✅ Anpassbar** |
| **Selbst gehostet** | ❌ | ✅ | ✅ | ✅ | **✅** |
| **Seitenladung** | Gehostet | PHP-App | Schnell (statisch) | Schnell (statisch) | **<300 ms, null JS** |

</div>

## 💬 Community

<div align="center">

**Hol dir Hilfe, zeig deine Seite, stimme darüber ab, was als Nächstes gebaut wird.**

[![Discord](https://img.shields.io/discord/1559020936253022209?style=for-the-badge&logo=discord&logoColor=white&label=Tritt%20unserem%20Discord%20bei&color=5865F2)](https://discord.gg/bAJMW3bAJa)

</div>

## ⚙️ Konfiguration

Die gesamte Konfiguration erfolgt über Umgebungsvariablen. **[`.env.example`](.env.example) ist die maßgebliche Referenz** - kopiere sie, dann ist jede Variable inline dokumentiert, einschließlich der Wallet-Blöcke.

| Variable | Standard | Beschreibung |
|----------|---------|-------------|
| `PORT` | `3000` | Serverport |
| `DATABASE_PATH` | `./data/linkbreeze.db` | Pfad der SQLite-Datenbankdatei |
| `BACKUP_DIR` | `./data/backups` | Speicherverzeichnis für geplante Backups (innerhalb des dauerhaften `./data`-Volumes lassen) |
| `BACKUP_MIN_FREE_MB` | `50` | Keine Backups schreiben, wenn der freie Speicherplatz darunter fällt |
| `SECRET_KEY` | Automatisch generiert | HMAC-Signaturschlüssel für Sessions |
| `EXTRA_SCRIPT_SRC` | _(leer)_ | Durch Leerzeichen getrennte Analyse-Domains für die CSP (z. B. `plausible.io umami.is`) |
| `LINKBREEZE_PRIMARY_HOST` | _(leer)_ | Primärer Host der Verwaltung; die Admin-Host-Sperre eigener Domains liefert 404 auf allen anderen Hosts (Umgebungsvariable schlägt die Admin-Einstellung) |
| `LINKBREEZE_TRUST_X_FORWARDED_HOST` | `false` | `X-Forwarded-Host` für das Domain-Routing vertrauen - nur aktivieren, wenn ein Proxy die Kopfzeile ÜBERSCHREIBT (nginx, Caddy); der Standard-`Host`-Header lässt sich nicht fälschen |

<details>
<summary>💳 &nbsp;Wallet-Pass-Variablen (Google Wallet / Apple Wallet)</summary>

| Variable | Beschreibung |
|----------|-------------|
| `GOOGLE_WALLET_ISSUER_ID` | Numerische Issuer-ID aus der Google Pay & Wallet Console. Aktiviert „Zu Google Wallet hinzufügen“-Buttons |
| `GOOGLE_WALLET_SERVICE_ACCOUNT_JSON` | Service-Account-JSON (`client_email` + `private_key`), für die Wallet API autorisiert |
| `APPLE_WALLET_CERT_PEM` | Signaturzertifikat der Pass-Type-ID (PEM). Aktiviert „Zu Apple Wallet hinzufügen“-Buttons |
| `APPLE_WALLET_KEY_PEM` | Privater Schlüssel zum Signaturzertifikat (PEM) |
| `APPLE_WALLET_KEY_PASSPHRASE` | Passphrase für den Signaturschlüssel, falls verschlüsselt |
| `APPLE_WALLET_WWDR_PEM` | Apple-WWDR-Zwischenzertifikat (PEM) |
| `APPLE_WALLET_TEAM_ID` | Deine 10-stellige Apple Team ID |
| `APPLE_WALLET_PASS_TYPE_ID` | Deine Pass-Type-ID (muss mit `pass.` beginnen) |

Jede öffentliche Seite rendert einen Teilen-Block mit einem „Kontakt speichern“-Button (universelles vCard, immer aktiv). Die Wallet-Buttons aktivieren sich automatisch, sobald die Zugangsdaten oben konfiguriert sind. Google Wallet: kostenloses Issuer-Konto, aber Pässe lassen sich erst speichern, wenn Google den Produktionszugang freigibt (vorher nur für freigeschaltete Testnutzer). Apple Wallet: erfordert ein kostenpflichtiges Apple-Developer-Konto, Installation nur aus Safari. Pässe sind statische Schnappschüsse - der QR-Code auf dem Pass öffnet immer die Live-Seite. Einstellungen → Integration zeigt den Zugangsdaten-Status pro Wallet und warnt, wenn das Apple-Signaturzertifikat bald abläuft.

</details>

**Externe Analysen im Einsatz?** Füge dein Provider-Snippet unter Einstellungen → Integration → Analyse-Script ein und trage dann die Domain des Anbieters in `EXTRA_SCRIPT_SRC` ein, damit die CSP das Laden erlaubt (z. B. `EXTRA_SCRIPT_SRC=plausible.io umami.is`). Danach neu bauen - die CSP wird beim Build fixiert.

Laufzeiteinstellungen (Seiten-Slug, Titel, SEO, Theme) werden über das Admin-Dashboard verwaltet und in der Datenbank gespeichert - keine Codeänderungen nötig.

## 🌐 Eigene Domains

Leite eigene Domains auf Seiten weiter - eine Instanz, viele Identitäten. Besucher landen auf `https://jane.com/` und sehen Janes Seite direkt, mit automatischen Canonical-Weiterleitungen, SEO-tauglichen Sitemaps und strikter Admin-Host-Sperre. Bindungen werden beim ersten echten Besuch aktiv (selbstverifizierendes DNS), und der Seiten-Scope legt fest, ob eine Domain die Seite IST (exklusiv) oder ein Hub für alle Slugs.

Komplette Einrichtung - DNS, Wildcard-TLS und Copy-Paste-Reverse-Proxy-Konfigurationen für Caddy, nginx und Traefik - in **[docs/custom-domains.md](docs/custom-domains.md)**.

## 🔌 REST-API

Verwalte Links, Profil und Analysen aus Skripten, CI-Pipelines oder Drittanbieter-Tools. Erstelle einen API-Schlüssel unter **Settings → Security → API access** (der volle Schlüssel wird nur einmal angezeigt - sicher speichern) und sende ihn im `Authorization`-Header über das HTTP-Bearer-Schema. Limit: 120 Anfragen/Minute pro Schlüssel, dazu ein IP-Schutz. Schreibende Endpunkte sind im Demo-Modus gesperrt. Jede Instanz bietet ihre eigene OpenAPI-3.1-Referenz unter `/api/v1/docs` und `/api/v1/openapi.json`.

<details>
<summary>🔗 &nbsp;Endpunkte</summary>

| Methode | Pfad | Beschreibung |
|---------|------|--------------|
| GET | `/api/v1/links` | Alle Links auflisten |
| POST | `/api/v1/links` | Link erstellen |
| PUT | `/api/v1/links/:id` | Link aktualisieren (partiell - nur gesendete Felder ändern sich) |
| DELETE | `/api/v1/links/:id` | Link löschen |
| PUT | `/api/v1/links/reorder` | Links neu ordnen (`{ "ids": [3, 1, 2] }`) |
| GET | `/api/v1/profile` | Profil abrufen |
| PUT | `/api/v1/profile` | Profil aktualisieren (partiell) |
| GET | `/api/v1/analytics` | Aufrufe, Klicks und Top-Links (`?range=7d\|30d\|90d`) |

Erfolgreiche Antworten verpacken die Nutzlast in `data`; Fehler sind `{ "error": { "code", "message" } }` mit passenden HTTP-Statuscodes (401 fehlender oder ungültiger Schlüssel, 400 Validierung, 403 Demo-Modus, 429 Limit). Link-Schreibvorgänge durchlaufen dieselbe Validierung wie die Admin-Oberfläche - inklusive URL-Schema-Allowlist.

</details>

## 🎨 Theme-System

11 Presets sind ab Werk dabei: **Aurora** (animiertes Flaggschiff), **Glassmorphism**, **Neon Cyberpunk**, **Editorial Paper**, **Terminal Mono**, **Pastel Soft**, **Brutalist**, **Retro Sunset**, **Minimal Light**, **8-Bit Retro** und **Frutiger Aero**.

<details>
<summary>🎛️ &nbsp;Was der Customizer steuert</summary>

Die Theme-Engine ist ein Token-System auf Basis von CSS-Custom-Properties (`--lb-*`) - jede Farbe, jeder Radius, jeder Schatten und jede Schrift auf der öffentlichen Seite ist ein Token.

- **Hintergrund** - 8 Typen (Uni, Verlauf, radial, Mesh, Aurora, animierter Verlauf, Bild, Muster) mit Steuerung für Winkel, Overlay und Deckkraft
- **Farben** - Akzent, Sekundär, Text, gedämpfter Text, Kartenhintergrund, Kartenrand (Hex oder rgba)
- **Typografie** - 15 kuratierte Google Fonts, Schriftskalierung, Strichstärke, Laufweite - oder eigene woff2/woff hochladen (max. 2 MB). Hochgeladene Fonts werden same-origin ausgeliefert, in Theme-Exporte eingebettet und in Backups mitgeführt
- **Kartenstil** - 7 Link-Stile (Pill, abgerundet, kantig, Glas, Outline, Neon, Pixel), Hover-Effekte, Button-Größe, Eckenradius, Rahmenstärke, Schattenstärke
- **Layout** - Containerbreite, Ausrichtung (links/mitte/rechts), Dichte (kompakt/normal/locker)
- **Effekte** - Glow mit eigener Farbe, Glas-Blur, Noise-Textur, Reveal-Animation
- **Duplizieren / Import / Export** - jedes Theme als bearbeitbare Kopie klonen und als JSON teilen

</details>

## 📖 Dokumentation & Links

[Mitmachen](CONTRIBUTING.md) · [Sicherheitsrichtlinie](SECURITY.md) · [Changelog](CHANGELOG.md) · [Fehlerbehebung](TROUBLESHOOTING.md) · [Custom Domains](docs/custom-domains.md) · [Architekturentscheidungen](docs/adr/) · [Konfigurationsreferenz](.env.example)

Quelle: [GitHub](https://github.com/OmniRise/LinkBreeze) (kanonisch) · [GitLab](https://gitlab.com/omnirise00/linkbreeze) (öffentlicher Pull-Mirror, automatisch synchronisiert) · Image: [`docker.io/omnirise/linkbreeze`](https://hub.docker.com/r/omnirise/linkbreeze)

Issues und PRs sind auf beiden Forges willkommen.

## 🤝 Mitmachen

Beiträge sind willkommen! Siehe [CONTRIBUTING.md](CONTRIBUTING.md) für die Richtlinien.

## 📜 Lizenz

MIT - mach damit, was du willst. Siehe [LICENSE](LICENSE).

## 🏢 Über

Gebaut von [Manak-hash](https://github.com/Manak-hash) · Ein [OmniRise](https://omnirise.dev)-Projekt.
