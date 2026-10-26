<div align="center">

<img src="public/Public-Page-iPhone-Dashboard-iMac.png" alt="Bannière" width="100%" />

---

[English](README.md) · [العربية](README.ar.md) · [中文](README.zh.md) · **Français** · [Deutsch](README.de.md) · [Italiano](README.it.md) · [日本語](README.ja.md) · [Português (Brasil)](README.pt-BR.md) · [Русский](README.ru.md) · [Español](README.es.md) · [Türkçe](README.tr.md)

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

> **Arrêtez de payer 15 $/mois pour Linktree.**  LinkBreeze est un hub de liens gratuit et auto-hébergé : rapide, personnalisable, avec des statistiques intégrées. **Installez en une commande.**

<div align="center">

&nbsp;[**🔗 Démo en ligne**](https://linkbreeze-demo.omnirise.dev/linkbreeze)&nbsp;&nbsp;·&nbsp;&nbsp;
[**🔐 Tableau de bord de démo**](https://linkbreeze-demo.omnirise.dev/dashboard)

</div>

---

## ✨ Fonctionnalités

<div align="center">
<table>
  <tr>
    <td width="50%" valign="top">🔗 <strong>Pages multiples</strong><br/>Des pages illimitées, chacune avec son propre slug, thème, liens et statistiques</td>
    <td valign="top">🎨 <strong>Thèmes + personnalisateur</strong><br/>11 préréglages plus un personnalisateur complet basé sur des tokens, avec import/export</td>
  </tr>
  <tr>
    <td valign="top">📊 <strong>Statistiques respectueuses de la vie privée</strong><br/>Vues, clics, référents, appareils. Sans cookies, IP hachées, purge automatique</td>
    <td valign="top">🧭 <strong>Assistant de migration</strong><br/>Importez depuis Linktree, Bento, Hopp.bio, LittleLink ou n'importe quel export HTML/JSON</td>
  </tr>
  <tr>
    <td valign="top">🔒 <strong>Auto-hébergé</strong><br/>Vos données, votre serveur. Aucun traceur, aucune pub, aucun abonnement</td>
    <td valign="top">🐳 <strong>Installation en une commande</strong><br/>Une seule commande curl. Détecte automatiquement Docker ou Podman et vous êtes en ligne</td>
  </tr>
  <tr>
    <td valign="top">📱 <strong>Widgets intégrés</strong><br/>YouTube, Spotify, SoundCloud, Vimeo et Bandcamp directement sur votre page</td>
    <td valign="top">🎯 <strong>QR codes</strong><br/>Générés automatiquement, couleurs personnalisables, avatar ou favicon au centre, SVG/PNG jusqu'à 1024 px</td>
  </tr>
  <tr>
    <td width="50%" valign="top">🌐 <strong>Domaines personnalisés</strong><br/>Associez vos propres domaines à vos pages - les visiteurs arrivent sur jane.com, sans /slug</td>
    <td valign="top">⏰ <strong>Sauvegardes programmées</strong><br/>Sauvegardes internes quotidiennes/hebdomadaires/mensuelles avec restauration en un clic, sans cron</td>
  </tr>
</table>


⚡ **Zéro JavaScript côté client. Chargement en moins de 300 ms. HTML pur rendu côté serveur.**

</div>

<details>
<summary>✨ &nbsp;Toutes les fonctionnalités</summary>

- **🔗 Gestion des liens** - Ajoutez, réorganisez et personnalisez des liens illimités en glisser-déposer
- **🌐 Favicons automatiques** - Les liens affichent automatiquement le favicon du site cible, aucun téléversement d'icône nécessaire
- **🖼️ Miniatures de liens** - Ajoutez des images à vos liens pour des cartes d'aperçu visuelles
- **⏰ Programmation des liens** - Programmez l'apparition ou la disparition automatique des liens avec des contrôles de date et d'heure
- **🏷️ Slugs de redirection personnalisés** - Des liens courts `/go/your-name` stables et partageables qui survivent à une suppression puis recréation
- **📈 Statistiques externes** - Injectez Plausible, Umami, Matomo ou Google Analytics d'un simple copier-coller
- **📦 Export HTML statique** - Téléchargez n'importe quelle page en un seul fichier .html autonome, à héberger où vous voulez
- **🖼️ Images d'aperçu social (OG)** - Cartes de partage générées automatiquement à partir du thème de votre page, ou téléversez la vôtre avec un contrôle du recadrage, de la position et du zoom
- **✏️ CSS personnalisé** - Ajustez votre page au pixel près avec une injection de CSS brut
- **📧 Collecte d'e-mails** - Recueillez les e-mails des abonnés sur votre page publique, export en CSV
- **🔔 Notifications de mise à jour** - Un bandeau du tableau de bord quand une nouvelle version est disponible. Pas de phone-home, pas de mise à jour automatique
- **🔑 Panneau d'administration rapide** - Tout ce qui précède depuis un tableau de bord propre et instantané

- **🌐 Domaines personnalisés** - Associez vos propres domaines à vos pages ; portée exclusive ou hub, redirections canoniques automatiques, verrou admin strict par hôte
- **⏰ Sauvegardes programmées** - Sauvegardes internes quotidiennes/hebdomadaires/mensuelles avec rétention et restauration en un clic, sans cron
</details>

## 🚀 Démarrage rapide

**Une commande. Zéro configuration. En ligne en 30 secondes :**

```bash
curl -fsSL https://linkbreeze.omnirise.dev/install.sh | bash
```

Le script détecte Docker ou Podman, récupère l'image et démarre le conteneur. Lancez-le avec `sudo bash` et répondez **y** pour activer également le démarrage automatique au boot.

Ouvrez ensuite **http://localhost:3000** - l'assistant de configuration prend moins de 30 secondes.

<details>
<summary>🔍 &nbsp;Vous voulez inspecter le script avant de l'exécuter ?</summary>

```bash
curl -fsSL https://linkbreeze.omnirise.dev/install.sh -o install.sh
less install.sh
bash install.sh
```

</details>

**Vous préférez une autre méthode ?** Dépliez l'une d'elles ci-dessous.

<details>
<summary>🐳 &nbsp;Docker</summary>

Pas besoin de Node.js, de npm, ni de fichiers de config. Images multi-architectures : `linux/amd64` et `linux/arm64` (Raspberry Pi 3/4/5, Apple Silicon, VPS ARM).

**Linux / macOS / Windows CMD :**

```bash
docker run -d --name linkbreeze --restart unless-stopped -p 3000:3000 -v linkbreeze-data:/app/data docker.io/omnirise/linkbreeze:latest
```

**Windows PowerShell** - utilisez des backticks pour les sauts de ligne :

```powershell
docker run -d `
  --name linkbreeze `
  --restart unless-stopped `
  -p 3000:3000 `
  -v linkbreeze-data:/app/data `
  docker.io/omnirise/linkbreeze:latest
```

> Les migrations de base de données s'exécutent automatiquement au démarrage du conteneur.

</details>

<details>
<summary>🧩 &nbsp;Docker Compose</summary>

Créez un `docker-compose.yml` :

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

Mise à niveau : `docker compose pull && docker compose up -d` · Logs : `docker compose logs -f linkbreeze`

Vous préférez construire depuis les sources ? `git clone https://github.com/OmniRise/LinkBreeze.git && cd LinkBreeze && docker compose up -d --build`

</details>

<details>
<summary>☁️ &nbsp;Coolify</summary>

1. **+ New Resource** → **Docker Compose Empty**
2. Collez le fichier compose de la section ci-dessus
3. Définissez un domaine (ex. `links.votredomaine.com`) - Coolify gère Let's Encrypt automatiquement
4. Cliquez sur **Deploy**

</details>

<details>
<summary>📦 &nbsp;Synology NAS</summary>

Container Manager (DSM 7.2+) :

1. Récupérez l'image `docker.io/omnirise/linkbreeze:latest` (**Image** → **Add**, si elle est introuvable)
2. **Créez** un conteneur : nom `linkbreeze`, port `3000 → 3000`, volume `/docker/linkbreeze/data → /app/data`, politique de redémarrage `Unless stopped`
3. Cliquez sur **Done** - en ligne sur `http://<ip-du-nas>:3000`

Les données persistent dans le volume d'une mise à jour d'image à l'autre.

</details>

<details>
<summary>🔧 &nbsp;Podman</summary>

```bash
podman run -d --name linkbreeze --restart unless-stopped -p 3000:3000 -v linkbreeze-data:/app/data docker.io/omnirise/linkbreeze:latest
```

Des erreurs de permission sur le volume ? Lancez d'abord `podman volume create linkbreeze-data`. Le script d'installation en haut de page détecte Podman automatiquement.

</details>

<details>
<summary>🖥️ &nbsp;Portainer</summary>

1. **Stacks** → **Add stack**, nommez-le `linkbreeze`
2. Collez le fichier compose de la section Docker Compose ci-dessus
3. Cliquez sur **Deploy the stack**

Mises à jour : **Stacks** → `linkbreeze` → **Editor** → **Pull and redeploy**.

</details>

<details>
<summary>🔨 &nbsp;Manuel (sans Docker)</summary>

Nécessite Node.js 18+.

```bash
git clone https://github.com/OmniRise/LinkBreeze.git
cd LinkBreeze
npm install
cp .env.example .env
# Edit .env to set your SECRET_KEY and DATABASE_PATH if needed
npm run db:migrate
npm run dev
```

En production : `npm run build && npm start`

</details>

<details>
<summary>🌍 &nbsp;Mettre votre page en ligne sur votre domaine</summary>

Une fois déployé, votre page est accessible à `https://your-domain.com/your-slug`.

1. Pointez l'enregistrement A de votre domaine vers l'IP de votre serveur
2. Exposez le port 3000 ou placez un reverse proxy devant
3. C'est fini

Des **fichiers compose prêts à l'emploi** se trouvent dans [`examples/`](examples/) - un fichier autonome par scénario :

| Ce que vous voulez | Utilisez ce fichier |
|---------------|---------------|
| TLS automatique, sans config manuelle | `docker-compose.caddy.yml` ou `docker-compose.https-portal.yml` |
| TLS automatique avec un dashboard (Traefik) | `docker-compose.traefik.yml` |
| Sans ports ouverts (zero-trust) | `docker-compose.cloudflare-tunnel.yml` |
| Vous utilisez déjà Nginx + Certbot | `docker-compose.nginx.yml` |
| Sauvegardes planifiées depuis l'interface (sans sidecar) | Intégré - à activer dans Réglages puis Données |
| Sauvegardes SQLite planifiées (sidecar de dump brut, hors site S3) | `docker-compose.with-backup.yml` |
| Déploiement sur Kubernetes | `kubernetes.yaml` |

**Caddy** (recommandé - HTTPS automatique) :

```
links.example.com {
    reverse_proxy localhost:3000
}
```

**Nginx :**

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

**Cloudflare Tunnel** (aucun port ouvert, aucun achat de domaine nécessaire) :

```bash
cloudflared tunnel --url http://localhost:3000
```

</details>

## 📸 Captures d'écran

<details>
    <summary>Cliquez pour déplier</summary>
    <br/>

<table>
    <tr>
    <td>Page publique</td>
    <td>Tableau de bord admin</td>
    </tr>
    <tr>
    <td><img src="public/screenshots/Public-Page(Aurora).jpeg" alt="Page publique [Thème Aurora]" /></td>
    <td><img src="public/screenshots/Admin-Dashboard.jpeg" alt="Tableau de bord admin" /></td>
    </tr>
    <tr>
    <td>Liens</td>
    <td>Profil</td>
    </tr>
    <tr>
    <td><img src="public/screenshots/Links.jpeg" alt="Page des liens" /></td>
    <td><img src="public/screenshots/Profile.jpeg" alt="Page de profil" /></td>
    </tr>
    <tr>
    <td>Thème</td>
    <td>Panneau d'aperçu en direct</td>
    </tr>
    <tr>
    <td><img src="public/screenshots/Theme.jpeg" alt="Page des thèmes" /></td>
    <td><img src="public/screenshots/Preview.jpeg" alt="Panneau d'aperçu en direct" /></td>
    </tr>
    <tr>
    <td>Paramètres [Général]</td>
    <td>Paramètres [Apparence]</td>
    </tr>
    <tr>
    <td><img src="public/screenshots/Settings(General).jpeg" alt="Page paramètres [onglet Général]" /></td>
    <td><img src="public/screenshots/Settings(Appearance).jpeg" alt="Page paramètres [onglet Apparence]" /></td>
    <tr>
    <td>Paramètres [Sécurité]</td>
    <td>Paramètres [Données]</td>
    </tr>
    <tr>
    <td><img src="public/screenshots/Settings(Security).jpeg" alt="Page paramètres [onglet Sécurité]" /></td>
    <td><img src="public/screenshots/Settings(Data).jpeg" alt="Page paramètres [onglet Données]" /></td>
    </tr>
</table>

</details>

## 🆚 Comparaison

<div align="center">

| Fonctionnalité | Linktree | LinkStack | LittleLink | Shako | **LinkBreeze** |
|---------|----------|-----------|------------|-------|----------------|
| **Prix** | Gratuit - 35 $/mois | Gratuit | Gratuit | Gratuit | **Gratuit** |
| **Panneau admin** | ✅ | ✅ | ❌ | ❌ | **✅ Rapide** |
| **Pages multiples** | ❌ | ❌ | ❌ | ❌ | **✅ Illimitées** |
| **Favicons automatiques** | ❌ | ❌ | ❌ | ❌ | **✅** |
| **Assistant de migration** | ❌ | ❌ | ❌ | ❌ | **✅** |
| **Statistiques intégrées** | Basiques, les complètes sont payantes | Basiques | ❌ | ❌ | **✅ Complètes et privées** |
| **Collecte d'e-mails** | Payant | ❌ | ❌ | ❌ | **✅** |
| **Widgets intégrés** | Partiel | ❌ | ❌ | ❌ | **✅** |
| **Programmation des liens** | Payant | ❌ | ❌ | ❌ | **✅** |
| **Thèmes** | Payant | Limités | CSS uniquement | Fichier de config | **✅ Système de tokens complet** |
| **QR codes** | ✅ | ✅ | ❌ | ❌ | **✅ Personnalisables** |
| **Auto-hébergé** | ❌ | ✅ | ✅ | ✅ | **✅** |
| **Chargement de page** | Hébergé | App PHP | Rapide (statique) | Rapide (statique) | **<300 ms, zéro JS** |

</div>

## 💬 Communauté

<div align="center">

**Obtenez de l'aide, montrez votre page, votez pour les prochaines fonctionnalités.**

[![Discord](https://img.shields.io/discord/1559020936253022209?style=for-the-badge&logo=discord&logoColor=white&label=Rejoignez-nous%20sur%20Discord&color=5865F2)](https://discord.gg/bAJMW3bAJa)

</div>

## ⚙️ Configuration

Toute la configuration passe par des variables d'environnement. **[`.env.example`](.env.example) est la référence canonique** - copiez-le et chaque variable est documentée en ligne, y compris les blocs wallet.

| Variable | Valeur par défaut | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Port du serveur |
| `DATABASE_PATH` | `./data/linkbreeze.db` | Chemin du fichier de base de données SQLite |
| `BACKUP_DIR` | `./data/backups` | Répertoire de stockage des sauvegardes planifiées (à garder dans le volume persistant `./data`) |
| `BACKUP_MIN_FREE_MB` | `50` | Ne pas écrire de sauvegarde quand l'espace libre passe sous cette valeur |
| `SECRET_KEY` | Générée automatiquement | Clé de signature HMAC des sessions |
| `EXTRA_SCRIPT_SRC` | _(vide)_ | Domaines d'analytique séparés par des espaces pour la CSP (ex. `plausible.io umami.is`) |
| `LINKBREEZE_PRIMARY_HOST` | _(vide)_ | Hôte principal où vit votre admin ; le verrou admin des domaines personnalisés renvoie 404 sur tous les autres hôtes (l'env a priorité sur le réglage admin) |
| `LINKBREEZE_TRUST_X_FORWARDED_HOST` | `false` | Faire confiance à `X-Forwarded-Host` pour le routage des domaines - à activer uniquement derrière un proxy qui ÉCRASE cet en-tête (nginx, Caddy) ; l'en-tête `Host` par défaut ne peut pas être falsifié |

<details>
<summary>💳 &nbsp;Variables de passes wallet (Google Wallet / Apple Wallet)</summary>

| Variable | Description |
|----------|-------------|
| `GOOGLE_WALLET_ISSUER_ID` | ID numérique d'émetteur de la Google Pay & Wallet Console. Active les boutons « Ajouter à Google Wallet » |
| `GOOGLE_WALLET_SERVICE_ACCOUNT_JSON` | JSON du compte de service (`client_email` + `private_key`) autorisé pour la Wallet API |
| `APPLE_WALLET_CERT_PEM` | Certificat de signature du Pass Type ID (PEM). Active les boutons « Ajouter à Apple Wallet » |
| `APPLE_WALLET_KEY_PEM` | Clé privée correspondant au certificat de signature (PEM) |
| `APPLE_WALLET_KEY_PASSPHRASE` | Phrase secrète de la clé de signature, si elle est chiffrée |
| `APPLE_WALLET_WWDR_PEM` | Certificat intermédiaire WWDR d'Apple (PEM) |
| `APPLE_WALLET_TEAM_ID` | Votre Team ID Apple de 10 caractères |
| `APPLE_WALLET_PASS_TYPE_ID` | Votre Pass Type ID (doit commencer par `pass.`) |

Chaque page publique affiche un bloc de partage avec un bouton « Enregistrer le contact » (vCard universel, toujours actif). Les boutons wallet s'activent automatiquement quand les identifiants ci-dessus sont configurés. Google Wallet : compte émetteur gratuit, mais les passes ne s'enregistrent que pour les utilisateurs de test autorisés tant que Google n'a pas accordé l'accès production. Apple Wallet : nécessite un compte Apple Developer payant et l'installation se fait uniquement depuis Safari. Les passes sont des instantanés statiques - le QR du passe ouvre toujours la page en direct. Paramètres → Intégration affiche l'état des identifiants par wallet et avertit quand le certificat de signature Apple arrive à expiration.

</details>

**Vous utilisez une analytique externe ?** Collez l'extrait de votre fournisseur dans Paramètres → Intégration → Script d'analytique, puis ajoutez le domaine du fournisseur à `EXTRA_SCRIPT_SRC` pour que la CSP l'autorise (ex. `EXTRA_SCRIPT_SRC=plausible.io umami.is`). Reconstruisez après modification - la CSP est intégrée au build.

Les réglages à l'exécution (slug de la page, titre, SEO, thème) se gèrent depuis le tableau de bord admin et se stockent en base de données - aucune modification de code nécessaire.

## 🌐 Domaines personnalisés

Pointez vos propres domaines vers vos pages - une instance, plusieurs identités. Les visiteurs arrivent sur `https://jane.com/` et voient directement la page de Jane, avec redirections canoniques automatiques, sitemaps optimisés SEO et verrou admin strict par hôte. Les liaisons s'activent lors de leur première vraie visite (DNS auto-vérifié), et la portée par page décide si un domaine EST la page (exclusive) ou un hub pour tous les slugs.

Configuration complète - DNS, TLS wildcard et configs reverse-proxy prêtes à coller pour Caddy, nginx et Traefik - dans **[docs/custom-domains.md](docs/custom-domains.md)**.

## 🎨 Système de thèmes

11 préréglages sont inclus d'office : **Aurora** (le thème phare animé), **Glassmorphism**, **Neon Cyberpunk**, **Editorial Paper**, **Terminal Mono**, **Pastel Soft**, **Brutalist**, **Retro Sunset**, **Minimal Light**, **8-Bit Retro** et **Frutiger Aero**.

<details>
<summary>🎛️ &nbsp;Ce que contrôle le personnalisateur</summary>

Le moteur de thèmes est un système de tokens basé sur des propriétés CSS personnalisées (`--lb-*`) - chaque couleur, rayon, ombre et police de la page publique est un token.

- **Arrière-plan** - 8 types (couleur unie, dégradé, radial, mesh, aurora, dégradé animé, image, motif) avec contrôles d'angle, de voile et d'opacité
- **Couleurs** - accent, secondaire, texte, texte atténué, fond de carte, bordure de carte (hex ou rgba)
- **Typographie** - 15 polices Google curatées, échelle de police, graisse, interlettrage - ou téléversez vos propres woff2/woff (max 2 Mo). Les polices téléversées sont servies same-origin, embarquées dans les exports de thème et conservées dans les sauvegardes
- **Style de carte** - 7 styles de liens (pill, arrondi, anguleux, verre, contour, néon, pixel), effets au survol, taille de bouton, rayon des coins, épaisseur de bordure, intensité de l'ombre
- **Mise en page** - largeur du conteneur, alignement (gauche/centre/droite), densité (compacte/normale/détendue)
- **Effets** - halo lumineux avec couleur personnalisée, flou de verre, texture de bruit, animation d'apparition
- **Duplication / import / export** - clonez n'importe quel thème en copie modifiable et partagez-le en JSON

</details>

## 📦 Export statique

Téléchargez n'importe quelle page depuis le sélecteur de pages en un seul fichier `.html` autonome - ou toutes les pages en archive zip - et hébergez-les où vous voulez, sans instance LinkBreeze en fonctionnement.

<details>
<summary>🌐 &nbsp;Héberger votre page exportée où vous voulez</summary>

- **Récupérer le fichier** - l'icône de téléchargement du sélecteur de pages exporte une page ; « Exporter toutes les pages en zip » regroupe toute l'instance. Ajoutez `?embed=1` (`/api/pages/export?id=1&embed=1`) pour inclure aussi le dossier `uploads/` et obtenir une copie entièrement hors ligne
- **Où héberger** - GitHub Pages, Netlify, Cloudflare Pages ou tout serveur de fichiers statiques ; `python3 -m http.server` suffit pour une vérification locale rapide
- **Ce qui voyage** - votre thème, votre CSS personnalisé et les extraits d'analytics tiers continuent de fonctionner, et chaque lien pointe directement vers sa destination
- **Ce qui reste** - les statistiques intégrées de vues/clics et la collecte d'e-mails ont besoin de votre instance ; sans `?embed=1`, les images se chargent depuis votre instance via des URLs absolues : gardez-la accessible ou exportez avec `?embed=1`
- **Taille** - une page de 50 liens s'exporte à ~107 Ko brut (~8 Ko gzippé), avec un plafond de 2 Mio (25 Mio avec `?embed=1`)

</details>

## 📖 Docs & liens

[Guide de contribution](CONTRIBUTING.md) · [Politique de sécurité](SECURITY.md) · [Journal des modifications](CHANGELOG.md) · [Dépannage](TROUBLESHOOTING.md) · [Custom Domains](docs/custom-domains.md) · [Décisions d'architecture](docs/adr/) · [Référence de configuration](.env.example)

Source : [GitHub](https://github.com/OmniRise/LinkBreeze) (canonique) · [GitLab](https://gitlab.com/omnirise00/linkbreeze) (miroir public de tirage, synchronisé automatiquement) · Image : [`docker.io/omnirise/linkbreeze`](https://hub.docker.com/r/omnirise/linkbreeze)

Les issues et PRs sont les bienvenues sur l'un ou l'autre forge.

## 🤝 Contribuer

Les contributions sont les bienvenues ! Consultez [CONTRIBUTING.md](CONTRIBUTING.md) pour les directives.

## 📜 Licence

MIT - faites-en ce que vous voulez. Voir [LICENSE](LICENSE).

## 🏢 À propos

Développé par [Manak-hash](https://github.com/Manak-hash) · Un projet [OmniRise](https://omnirise.dev).
