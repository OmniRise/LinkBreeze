<div align="center">

<img src="public/Public-Page-iPhone-Dashboard-iMac.png" alt="Banner" width="100%" />

---

[English](README.md) · [العربية](README.ar.md) · [中文](README.zh.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · **Italiano** · [日本語](README.ja.md) · [Português (Brasil)](README.pt-BR.md) · [Русский](README.ru.md) · [Español](README.es.md) · [Türkçe](README.tr.md)

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

> **Smetti di pagare $15 al mese per Linktree.**  LinkBreeze è un hub di link gratuito e self-hosted: veloce, personalizzabile, con analytics integrati. **Installalo con un solo comando.**

<div align="center">

&nbsp;[**🔗 Demo Live**](https://linkbreeze-demo.omnirise.dev/linkbreeze)&nbsp;&nbsp;·&nbsp;&nbsp;
[**🔐 Dashboard Demo**](https://linkbreeze-demo.omnirise.dev/dashboard)

</div>

---

## ✨ Funzionalità

<div align="center">
<table>
  <tr>
    <td width="50%" valign="top">🔗 <strong>Supporto Multi-Pagina</strong><br/>Pagine illimitate, ognuna con il proprio slug, tema, link e analytics</td>
    <td valign="top">🎨 <strong>Temi + Personalizzatore</strong><br/>11 preset più un personalizzatore completo basato su token con import/export</td>
  </tr>
  <tr>
    <td valign="top">📊 <strong>Analytics Privacy-first</strong><br/>Visualizzazioni, click, referrer, dispositivi. Senza cookie, IP con hash, eliminati automaticamente</td>
    <td valign="top">🧭 <strong>Migrazione Guidata</strong><br/>Importa da Linktree, Bento, Hopp.bio, LittleLink o da qualsiasi esportazione HTML/JSON</td>
  </tr>
  <tr>
    <td valign="top">🔒 <strong>Self-Hosted</strong><br/>I tuoi dati, il tuo server. Niente tracker, niente pubblicità, niente abbonamento</td>
    <td valign="top">🐳 <strong>Installazione con un Comando</strong><br/>Un comando curl. Rileva automaticamente Docker o Podman e sei online</td>
  </tr>
  <tr>
    <td valign="top">📱 <strong>Widget Incorporati</strong><br/>YouTube, Spotify, SoundCloud, Vimeo e Bandcamp sulla tua pagina</td>
    <td valign="top">🎯 <strong>Codici QR</strong><br/>Generati automaticamente, colori personalizzati, avatar o favicon al centro, SVG/PNG fino a 1024px</td>
  </tr>
  <tr>
    <td width="50%" valign="top">🌐 <strong>Domini Personalizzati</strong><br/>Collega i tuoi domini alle pagine - i visitatori arrivano su jane.com, senza /slug</td>
    <td valign="top">⏰ <strong>Backup Pianificati</strong><br/>Backup giornalieri/settimanali/mensili interni all'app con ripristino con un click, senza cron</td>
  </tr>
</table>


⚡ **Zero JavaScript lato client. Caricamento in meno di 300ms. HTML puro renderizzato dal server.**

</div>

<details>
<summary>✨ &nbsp;Tutte le funzionalità</summary>

- **🔗 Gestione dei Link** - Aggiungi, riordina e personalizza link illimitati con drag-and-drop
- **🌐 Link con Favicon Automatica** - I link mostrano automaticamente la favicon del sito di destinazione, senza dover caricare icone
- **🖼️ Anteprime dei Link** - Aggiungi immagini ai tuoi link per schede di anteprima visive
- **⏰ Programmazione dei Link** - Pianifica l'apparizione o la scomparsa automatica dei link con controlli data/ora
- **🏷️ Slug di Reindirizzamento Personalizzati** - Short link stabili e condivisibili tipo `/go/tuo-nome` che sopravvivono a eliminazioni e ricreazioni
- **🧪 Test A/B** - Dividi il traffico di un link tra due destinazioni con assegnazione per visitatore stabile tra le visite, analitica per variante, percentuale di lift e promozione del vincitore con un clic
- **📈 Analytics Esterni** - Inietta Plausible, Umami, Matomo o Google Analytics con un semplice incolla
- **🖼️ Immagini di Anteprima Social (OG)** - Card di condivisione generate automaticamente dal tema della tua pagina, oppure carica le tue con controllo di adattamento, posizione e zoom
- **✏️ CSS Personalizzato** - Rifinisci la tua pagina con iniezione di CSS grezzo
- **📧 Raccolta Email** - Raccogli le email degli iscritti sulla tua pagina pubblica, esporta in CSV
- **🔔 Notifiche di Aggiornamento** - Banner nella dashboard quando è disponibile una nuova versione. Nessun phone-home, nessun aggiornamento automatico
- **🔑 Pannello Admin Veloce** - Tutto quanto sopra da una dashboard pulita e istantanea

- **🌐 Domini Personalizzati** - Collega i tuoi domini alle pagine; scope esclusivo o hub, reindirizzamenti canonici automatici, rigoroso blocco dell'host admin
- **⏰ Backup Pianificati** - Backup giornalieri/settimanali/mensili interni all'app con retention e ripristino con un click, senza cron richiesti
</details>

## 🚀 Avvio Rapido

**Un comando. Zero configurazione. Online in 30 secondi:**

```bash
curl -fsSL https://linkbreeze.omnirise.dev/install.sh | bash
```

Lo script rileva Docker o Podman, scarica l'immagine e avvia il container. Eseguilo con `sudo bash` e rispondi **y** per abilitare anche l'avvio automatico al boot.

Poi apri **http://localhost:3000** - la procedura guidata di configurazione richiede meno di 30 secondi.

<details>
<summary>🔍 &nbsp;Vuoi ispezionare lo script prima di eseguirlo?</summary>

```bash
curl -fsSL https://linkbreeze.omnirise.dev/install.sh -o install.sh
less install.sh
bash install.sh
```

</details>

**Preferisci un altro metodo?** Espandi quello che ti serve qui sotto.

<details>
<summary>🐳 &nbsp;Docker</summary>

Niente Node.js, niente npm, niente file di configurazione. Immagini multi-arch: `linux/amd64` e `linux/arm64` (Raspberry Pi 3/4/5, Apple Silicon, VPS ARM).

**Linux / macOS / CMD di Windows:**

```bash
docker run -d --name linkbreeze --restart unless-stopped -p 3000:3000 -v linkbreeze-data:/app/data docker.io/omnirise/linkbreeze:latest
```

**Windows PowerShell** - usa i backtick per andare a capo:

```powershell
docker run -d `
  --name linkbreeze `
  --restart unless-stopped `
  -p 3000:3000 `
  -v linkbreeze-data:/app/data `
  docker.io/omnirise/linkbreeze:latest
```

> Le migrazioni del database vengono eseguite automaticamente all'avvio del container.

</details>

<details>
<summary>🧩 &nbsp;Docker Compose</summary>

Crea un `docker-compose.yml`:

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

Aggiornamento: `docker compose pull && docker compose up -d` · Log: `docker compose logs -f linkbreeze`

Preferisci compilare dal sorgente? `git clone https://github.com/OmniRise/LinkBreeze.git && cd LinkBreeze && docker compose up -d --build`

</details>

<details>
<summary>☁️ &nbsp;Coolify</summary>

1. **+ New Resource** → **Docker Compose Empty**
2. Incolla il file compose dalla sezione qui sopra
3. Imposta un dominio (ad es. `links.yourdomain.com`) - Coolify gestisce automaticamente Let's Encrypt
4. Clicca **Deploy**

</details>

<details>
<summary>📦 &nbsp;Synology NAS</summary>

Container Manager (DSM 7.2+):

1. Scarica l'immagine `docker.io/omnirise/linkbreeze:latest` (**Image** → **Add**, se non la trovi)
2. **Create** un container: nome `linkbreeze`, porta `3000 → 3000`, volume `/docker/linkbreeze/data → /app/data`, policy di riavvio `Unless stopped`
3. Clicca **Done** - online su `http://<nas-ip>:3000`

I dati permangono nel volume durante gli aggiornamenti dell'immagine.

</details>

<details>
<summary>🔧 &nbsp;Podman</summary>

```bash
podman run -d --name linkbreeze --restart unless-stopped -p 3000:3000 -v linkbreeze-data:/app/data docker.io/omnirise/linkbreeze:latest
```

Errori di permessi sul volume? Esegui prima `podman volume create linkbreeze-data`. Lo script di installazione in cima rileva Podman automaticamente.

</details>

<details>
<summary>🖥️ &nbsp;Portainer</summary>

1. **Stacks** → **Add stack**, chiamalo `linkbreeze`
2. Incolla il file compose dalla sezione Docker Compose qui sopra
3. Clicca **Deploy the stack**

Aggiornamenti: **Stacks** → `linkbreeze` → **Editor** → **Pull and redeploy**.

</details>

<details>
<summary>🔨 &nbsp;Manuale (senza Docker)</summary>

Richiede Node.js 18+.

```bash
git clone https://github.com/OmniRise/LinkBreeze.git
cd LinkBreeze
npm install
cp .env.example .env
# Edit .env to set your SECRET_KEY and DATABASE_PATH if needed
npm run db:migrate
npm run dev
```

Per la produzione: `npm run build && npm start`

</details>

<details>
<summary>🌍 &nbsp;Metti online sul tuo dominio</summary>

Una volta fatto il deploy, la tua pagina è su `https://your-domain.com/your-slug`.

1. Punta il record A del tuo dominio all'IP del tuo server
2. Esponi la porta 3000 o metti davanti un reverse proxy
3. Fatto

**File compose pronti all'uso** si trovano in [`examples/`](examples/) - un file autonomo per ogni scenario:

| Cosa vuoi fare | Usa questo file |
|---------------|-----------------|
| TLS automatico, senza configurazione manuale | `docker-compose.caddy.yml` o `docker-compose.https-portal.yml` |
| TLS automatico con una dashboard (Traefik) | `docker-compose.traefik.yml` |
| Nessuna porta aperta (zero-trust) | `docker-compose.cloudflare-tunnel.yml` |
| Usi già Nginx + Certbot | `docker-compose.nginx.yml` |
| Backup pianificati dalla UI (senza sidecar) | Integrato - abilitalo in Impostazioni -> Dati |
| Backup SQLite pianificati (sidecar con dump grezzo, S3 offsite) | `docker-compose.with-backup.yml` |
| Esecuzione su Kubernetes | `kubernetes.yaml` |

**Caddy** (consigliato - HTTPS automatico):

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

**Cloudflare Tunnel** (nessuna porta aperta, nessun acquisto di dominio necessario):

```bash
cloudflared tunnel --url http://localhost:3000
```

</details>

## 📸 Screenshot

<details>
    <summary>Clicca per espandere</summary>
    <br/>

<table>
    <tr>
    <td>Pagina Pubblica</td>
    <td>Dashboard Admin</td>
    </tr>
    <tr>
    <td><img src="public/screenshots/Public-Page(Aurora).jpeg" alt="Pagina Pubblica [Tema Aurora]" /></td>
    <td><img src="public/screenshots/Admin-Dashboard.jpeg" alt="Dashboard Admin" /></td>
    </tr>
    <tr>
    <td>Link</td>
    <td>Profilo</td>
    </tr>
    <tr>
    <td><img src="public/screenshots/Links.jpeg" alt="Pagina Link" /></td>
    <td><img src="public/screenshots/Profile.jpeg" alt="Pagina Profilo" /></td>
    </tr>
    <tr>
    <td>Tema</td>
    <td>Riquadro Anteprima Live</td>
    </tr>
    <tr>
    <td><img src="public/screenshots/Theme.jpeg" alt="Pagina Tema" /></td>
    <td><img src="public/screenshots/Preview.jpeg" alt="Riquadro Anteprima Live" /></td>
    </tr>
    <tr>
    <td>Impostazioni [Generali]</td>
    <td>Impostazioni [Aspetto]</td>
    </tr>
    <tr>
    <td><img src="public/screenshots/Settings(General).jpeg" alt="Pagina Impostazioni [Scheda Generali]" /></td>
    <td><img src="public/screenshots/Settings(Appearance).jpeg" alt="Pagina Impostazioni [Scheda Aspetto]" />
    <tr>
    <td>Impostazioni [Sicurezza]</td>
    <td>Impostazioni [Dati]</td>
    </tr>
    <tr>
    <td><img src="public/screenshots/Settings(Security).jpeg" alt="Pagina Impostazioni [Scheda Sicurezza]" /></td>
    <td><img src="public/screenshots/Settings(Data).jpeg" alt="Pagina Impostazioni [Scheda Dati]" /></td>
    </tr>
</table>

</details>

## 🆚 Confronto

<div align="center">

| Funzionalità | Linktree | LinkStack | LittleLink | Shako | **LinkBreeze** |
|---------|----------|-----------|------------|-------|----------------|
| **Prezzo** | Gratis - $35/mese | Gratis | Gratis | Gratis | **Gratis** |
| **Pannello Admin** | ✅ | ✅ | ❌ | ❌ | **✅ Veloce** |
| **Multi-Pagina** | ❌ | ❌ | ❌ | ❌ | **✅ Illimitate** |
| **Link con Favicon Automatica** | ❌ | ❌ | ❌ | ❌ | **✅** |
| **Migrazione Guidata** | ❌ | ❌ | ❌ | ❌ | **✅** |
| **Analytics Integrati** | Base, quello completo è a pagamento | Base | ❌ | ❌ | **✅ Completo e privato** |
| **Raccolta Email** | A pagamento | ❌ | ❌ | ❌ | **✅** |
| **Widget Incorporati** | Parziale | ❌ | ❌ | ❌ | **✅** |
| **Programmazione Link** | A pagamento | ❌ | ❌ | ❌ | **✅** |
| **Temi** | A pagamento | Limitati | Solo CSS | File di configurazione | **✅ Sistema completo di token** |
| **Codici QR** | ✅ | ✅ | ❌ | ❌ | **✅ Personalizzabili** |
| **Self-Hosted** | ❌ | ✅ | ✅ | ✅ | **✅** |
| **Caricamento Pagina** | Hosted | App PHP | Veloce (statico) | Veloce (statico) | **<300ms, zero JS** |

</div>

## 💬 Comunità

<div align="center">

**Chiedi aiuto, mostra la tua pagina, vota cosa sviluppare dopo.**

[![Discord](https://img.shields.io/discord/1559020936253022209?style=for-the-badge&logo=discord&logoColor=white&label=Join%20us%20on%20Discord&color=5865F2)](https://discord.gg/bAJMW3bAJa)

</div>

## ⚙️ Configurazione

Tutta la configurazione avviene tramite variabili d'ambiente. **[`.env.example`](.env.example) è il riferimento ufficiale** - copialo e ogni variabile è documentata inline, inclusi i blocchi wallet.

| Variabile | Predefinito | Descrizione |
|----------|---------|-------------|
| `PORT` | `3000` | Porta del server |
| `DATABASE_PATH` | `./data/linkbreeze.db` | Percorso del file del database SQLite |
| `BACKUP_DIR` | `./data/backups` | Directory di archiviazione dei backup pianificati (tienila dentro il volume persistente `./data`) |
| `BACKUP_MIN_FREE_MB` | `50` | Salta la scrittura dei backup quando lo spazio libero scende sotto questo valore |
| `SECRET_KEY` | Auto-generata | Chiave di firma HMAC per le sessioni |
| `EXTRA_SCRIPT_SRC` | _(vuoto)_ | Domini di analytics separati da spazi per la CSP (ad es. `plausible.io umami.is`) |
| `LINKBREEZE_PRIMARY_HOST` | _(vuoto)_ | Host primario su cui vive l'admin; il blocco admin dei domini personalizzati restituisce 404 su ogni altro host (la variabile env ha la precedenza sull'impostazione admin) |
| `LINKBREEZE_TRUST_X_FORWARDED_HOST` | `false` | Considera affidabile `X-Forwarded-Host` per il routing dei domini - abilitalo solo dietro un proxy che lo SOVRASCRIVE (nginx, Caddy); l'header `Host` predefinito non può essere falsificato |

<details>
<summary>💳 &nbsp;Variabili wallet pass (Google Wallet / Apple Wallet)</summary>

| Variabile | Descrizione |
|----------|-------------|
| `GOOGLE_WALLET_ISSUER_ID` | ID numerico dell'issuer dalla Google Pay & Wallet Console. Abilita i pulsanti "Add to Google Wallet" |
| `GOOGLE_WALLET_SERVICE_ACCOUNT_JSON` | JSON del service account (`client_email` + `private_key`) autorizzato per la Wallet API |
| `APPLE_WALLET_CERT_PEM` | Certificato di firma del Pass Type ID (PEM). Abilita i pulsanti "Add to Apple Wallet" |
| `APPLE_WALLET_KEY_PEM` | Chiave privata corrispondente al certificato di firma (PEM) |
| `APPLE_WALLET_KEY_PASSPHRASE` | Passphrase della chiave di firma, se crittografata |
| `APPLE_WALLET_WWDR_PEM` | Certificato intermedio Apple WWDR (PEM) |
| `APPLE_WALLET_TEAM_ID` | Il tuo Apple Team ID di 10 caratteri |
| `APPLE_WALLET_PASS_TYPE_ID` | Il tuo Pass Type ID (deve iniziare con `pass.`) |

Ogni pagina pubblica mostra un blocco di condivisione con un pulsante "Salva contatto" (vCard universale, sempre attivo). I pulsanti wallet si attivano automaticamente quando le credenziali sopra sono configurate. Google Wallet: account issuer gratuito, ma i pass vengono salvati solo per gli utenti di test whitelisted finché Google non concede l'accesso alla produzione. Apple Wallet: richiede un account Apple Developer a pagamento e l'installazione solo da Safari. I pass sono istantanee statiche - il QR sul pass apre sempre la pagina live. Impostazioni → Integrazione mostra lo stato delle credenziali per ogni wallet e avvisa quando il certificato di firma Apple sta per scadere.

</details>

**Usi analytics esterni?** Incolla lo snippet del tuo provider in Impostazioni → Integrazione → Script analytics, poi aggiungi il dominio del provider a `EXTRA_SCRIPT_SRC` così la CSP lo consente (ad es. `EXTRA_SCRIPT_SRC=plausible.io umami.is`). Ricostruisci dopo la modifica - la CSP è incorporata nella build.

Le impostazioni runtime (slug della pagina, titolo, SEO, tema) si gestiscono dalla dashboard admin e sono salvate nel database - nessuna modifica al codice necessaria.

## 🌐 Domini Personalizzati

Punta i tuoi domini alle pagine - un'istanza, tante identità. I visitatori arrivano su `https://jane.com/` e vedono direttamente la pagina di Jane, con reindirizzamenti canonici automatici, sitemap pronti per la SEO e un rigoroso blocco dell'host admin. I binding si attivano alla prima visita reale (DNS auto-verificante), e lo scope per pagina decide se un dominio È la pagina (esclusivo) o un hub per tutti gli slug.

Setup completo - DNS, TLS wildcard e configurazioni reverse proxy copia-e-incolla per Caddy, nginx e Traefik - in **[docs/custom-domains.md](docs/custom-domains.md)**.

## 🎨 Sistema di Temi

Sono inclusi 11 preset pronti all'uso: **Aurora** (flagship animato), **Glassmorphism**, **Neon Cyberpunk**, **Editorial Paper**, **Terminal Mono**, **Pastel Soft**, **Brutalist**, **Retro Sunset**, **Minimal Light**, **8-Bit Retro** e **Frutiger Aero**.

<details>
<summary>🎛️ &nbsp;Cosa controlla il personalizzatore</summary>

Il motore dei temi è un sistema di token basato su custom property CSS (`--lb-*`) - ogni colore, raggio, ombra e font della pagina pubblica è un token.

- **Sfondo** - 8 tipi (solido, gradiente, radiale, mesh, aurora, gradiente animato, immagine, pattern) con controlli per angolo, overlay e opacità
- **Colori** - accento, secondario, testo, testo attenuato, sfondo card, bordo card (hex o rgba)
- **Tipografia** - 15 Google Fonts selezionate, scala del font, peso, spaziatura lettere - oppure carica il tuo woff2/woff (max 2 MB). I font caricati sono serviti same-origin, incorporati negli export dei temi e portati nei backup
- **Stile card** - 7 stili di link (pill, rounded, sharp, glass, outline, neon, pixel), effetti hover, dimensione pulsante, raggio degli angoli, spessore bordo, intensità ombra
- **Layout** - larghezza del contenitore, allineamento (sinistra/centro/destra), densità (compatta/normale/rilassata)
- **Effetti** - bagliore con colore personalizzato, blur glass, texture noise, animazione di reveal
- **Duplica / importa / esporta** - clona qualsiasi tema come copia modificabile e condividilo come JSON

</details>

## 📖 Documentazione e Link

[Contribuire](CONTRIBUTING.md) · [Politica di Sicurezza](SECURITY.md) · [Changelog](CHANGELOG.md) · [Risoluzione dei Problemi](TROUBLESHOOTING.md) · [Domini Personalizzati](docs/custom-domains.md) · [Decisioni Architetturali](docs/adr/) · [Riferimento Configurazione](.env.example)

Sorgente: [GitHub](https://github.com/OmniRise/LinkBreeze) (canonico) · [GitLab](https://gitlab.com/omnirise00/linkbreeze) (mirror pubblico, sincronizzato automaticamente) · Immagine: [`docker.io/omnirise/linkbreeze`](https://hub.docker.com/r/omnirise/linkbreeze)

Issue e PR sono benvenute su entrambe le forge.

## 🤝 Contribuire

I contributi sono benvenuti! Vedi [CONTRIBUTING.md](CONTRIBUTING.md) per le linee guida.

## 📜 Licenza

MIT - fai quello che vuoi. Vedi [LICENSE](LICENSE).

## 🏢 Informazioni

Realizzato da [Manak-hash](https://github.com/Manak-hash) · Un progetto [OmniRise](https://omnirise.dev).
