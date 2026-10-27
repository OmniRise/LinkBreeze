<div align="center">

<img src="public/Public-Page-iPhone-Dashboard-iMac.png" alt="Banner" width="100%" />

---

[English](README.md) · [العربية](README.ar.md) · [中文](README.zh.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Italiano](README.it.md) · [日本語](README.ja.md) · [Português (Brasil)](README.pt-BR.md) · [Русский](README.ru.md) · **Español** · [Türkçe](README.tr.md)

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

> **Deja de pagar 15 USD al mes por Linktree.** LinkBreeze es un hub de enlaces gratuito y autoalojado: rápido, personalizable y con estadísticas integradas. **Instálalo con un solo comando.**

<div align="center">

&nbsp;[**🔗 Demo en línea**](https://linkbreeze-demo.omnirise.dev/linkbreeze)&nbsp;&nbsp;·&nbsp;&nbsp;
[**🔐 Panel de demostración**](https://linkbreeze-demo.omnirise.dev/dashboard)

</div>

---

## ✨ Funcionalidades

<div align="center">
<table>
  <tr>
    <td width="50%" valign="top">🔗 <strong>Soporte multipágina</strong><br/>Páginas ilimitadas, cada una con su propio slug, tema, enlaces y estadísticas</td>
    <td valign="top">🎨 <strong>Temas + Personalizador</strong><br/>11 preajustes además de un personalizador completo basado en tokens con importación/exportación</td>
  </tr>
  <tr>
    <td valign="top">📊 <strong>Estadísticas que priorizan la privacidad</strong><br/>Visualizaciones, clics, referentes y dispositivos. Sin cookies, IP cifradas con hash, purgado automático</td>
    <td valign="top">🧭 <strong>Asistente de migración</strong><br/>Importa desde Linktree, Bento, Hopp.bio, LittleLink o cualquier exportación HTML/JSON</td>
  </tr>
  <tr>
    <td valign="top">🔒 <strong>Autoalojado</strong><br/>Tus datos, tu servidor. Sin rastreadores, sin anuncios, sin suscripción</td>
    <td valign="top">🐳 <strong>Instalación con un solo comando</strong><br/>Un comando curl. Detecta Docker o Podman automáticamente y ya estás en línea</td>
  </tr>
  <tr>
    <td valign="top">📱 <strong>Widgets integrados</strong><br/>YouTube, Spotify, SoundCloud, Vimeo y Bandcamp en tu página</td>
    <td valign="top">🎯 <strong>Códigos QR</strong><br/>Generados automáticamente, colores personalizados, avatar o favicon en el centro, SVG/PNG hasta 1024px</td>
  </tr>
  <tr>
    <td width="50%" valign="top">🌐 <strong>Dominios personalizados</strong><br/>Apunta tus propios dominios a páginas - los visitantes llegan a jane.com, sin /slug</td>
    <td valign="top">⏰ <strong>Copias programadas</strong><br/>Copias internas diarias/semanales/mensuales con restauración en un clic, sin cron</td>
  </tr>
</table>


⚡ **Cero JavaScript en el cliente. Carga en menos de 300 ms. HTML puro renderizado en el servidor.**

</div>

<details>
<summary>✨ &nbsp;Todas las funcionalidades</summary>

- **🔗 Gestión de enlaces** - Añade, reordena y personaliza enlaces ilimitados con arrastrar y soltar
- **🌐 Enlaces con favicon automático** - Los enlaces muestran automáticamente el favicon del sitio de destino, sin necesidad de subir iconos
- **🖼️ Miniaturas de enlaces** - Añade imágenes a tus enlaces para crear tarjetas de vista previa visuales
- **⏰ Programación de enlaces** - Programa que los enlaces aparezcan o desaparezcan automáticamente con controles de fecha y hora
- **🏷️ Slugs de redirección personalizados** - Enlaces cortos `/go/tu-nombre` estables y compartibles que sobreviven a borrarlos y recrearlos
- **📈 Estadísticas externas** - Integra Plausible, Umami, Matomo o Google Analytics con un simple pegado
- **🖼️ Imágenes de vista previa (OG)** - Tarjetas para compartir generadas automáticamente a partir del tema de tu página, o sube la tuya con control de ajuste, posición y zoom
- **✏️ CSS personalizado** - Ajusta tu página al detalle mediante inyección de CSS sin procesar
- **📧 Recopilación de correos electrónicos** - Recopila los correos de tus suscriptores en tu página pública y expórtalos a CSV
- **🔔 Notificaciones de actualización** - Banner en el panel cuando hay una nueva versión disponible. Sin conexiones automáticas ni actualizaciones automáticas
- **🔑 Panel de administración rápido** - Todo lo anterior desde un panel limpio e instantáneo

- **🌐 Dominios personalizados** - Apunta tus propios dominios a páginas; alcance exclusivo o hub, redirecciones canónicas automáticas, bloqueo de admin estricto por host
- **⏰ Copias programadas** - Copias internas diarias/semanales/mensuales con retención y restauración en un clic, sin cron
</details>

## 🚀 Inicio rápido

**Un comando. Cero configuración. En línea en 30 segundos:**

```bash
curl -fsSL https://linkbreeze.omnirise.dev/install.sh | bash
```

El script detecta Docker o Podman, descarga la imagen e inicia el contenedor. Ejecútalo con `sudo bash` y responde **y** para activar también el inicio automático al arrancar.

Luego abre **http://localhost:3000** - el asistente de configuración tarda menos de 30 segundos.

<details>
<summary>🔍 &nbsp;¿Quieres inspeccionar el script antes de ejecutarlo?</summary>

```bash
curl -fsSL https://linkbreeze.omnirise.dev/install.sh -o install.sh
less install.sh
bash install.sh
```

</details>

**¿Prefieres otro método?** Despliega una de las opciones siguientes.

<details>
<summary>🐳 &nbsp;Docker</summary>

Sin Node.js, sin npm, sin archivos de configuración. Imágenes multi-arquitectura: `linux/amd64` y `linux/arm64` (Raspberry Pi 3/4/5, Apple Silicon, VPS ARM).

**Linux / macOS / Windows CMD:**

```bash
docker run -d --name linkbreeze --restart unless-stopped -p 3000:3000 -v linkbreeze-data:/app/data docker.io/omnirise/linkbreeze:latest
```

**Windows PowerShell** - usa backticks para los saltos de línea:

```powershell
docker run -d `
  --name linkbreeze `
  --restart unless-stopped `
  -p 3000:3000 `
  -v linkbreeze-data:/app/data `
  docker.io/omnirise/linkbreeze:latest
```

> Las migraciones de la base de datos se ejecutan automáticamente al iniciar el contenedor.

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

Actualización: `docker compose pull && docker compose up -d` · Registros: `docker compose logs -f linkbreeze`

¿Prefieres compilar desde el código fuente? `git clone https://github.com/OmniRise/LinkBreeze.git && cd LinkBreeze && docker compose up -d --build`

</details>

<details>
<summary>☁️ &nbsp;Coolify</summary>

1. **+ New Resource** → **Docker Compose Empty**
2. Pega el archivo compose de la sección anterior
3. Define un dominio (por ejemplo, `links.tudominio.com`) - Coolify gestiona Let's Encrypt automáticamente
4. Haz clic en **Deploy**

</details>

<details>
<summary>📦 &nbsp;Synology NAS</summary>

Container Manager (DSM 7.2 o posterior):

1. Descarga la imagen `docker.io/omnirise/linkbreeze:latest` (**Image** → **Add**, si no aparece)
2. **Crea** un contenedor: nombre `linkbreeze`, puerto `3000 → 3000`, volumen `/docker/linkbreeze/data → /app/data`, política de reinicio `Unless stopped`
3. Haz clic en **Done** - en línea en `http://<ip-del-nas>:3000`

Los datos persisten en el volumen entre actualizaciones de la imagen.

</details>

<details>
<summary>🔧 &nbsp;Podman</summary>

```bash
podman run -d --name linkbreeze --restart unless-stopped -p 3000:3000 -v linkbreeze-data:/app/data docker.io/omnirise/linkbreeze:latest
```

¿Errores de permisos en el volumen? Ejecuta primero `podman volume create linkbreeze-data`. El script de instalación del principio detecta Podman automáticamente.

</details>

<details>
<summary>🖥️ &nbsp;Portainer</summary>

1. **Stacks** → **Add stack**, nómbralo `linkbreeze`
2. Pega el archivo compose de la sección de Docker Compose anterior
3. Haz clic en **Deploy the stack**

Actualizaciones: **Stacks** → `linkbreeze` → **Editor** → **Pull and redeploy**.

</details>

<details>
<summary>🔨 &nbsp;Manual (sin Docker)</summary>

Requiere Node.js 18 o posterior.

```bash
git clone https://github.com/OmniRise/LinkBreeze.git
cd LinkBreeze
npm install
cp .env.example .env
# Edit .env to set your SECRET_KEY and DATABASE_PATH if needed
npm run db:migrate
npm run dev
```

Para producción: `npm run build && npm start`

</details>

<details>
<summary>🌍 &nbsp;Publica tu página en tu dominio</summary>

Una vez desplegada, tu página estará en `https://tu-dominio.com/tu-slug`.

1. Apunta el registro A de tu dominio a la IP de tu servidor
2. Expón el puerto 3000 o pon un proxy inverso delante
3. Listo

**Archivos compose listos para usar** disponibles en [`examples/`](examples/) - un archivo autocontenido por escenario:

| Lo que quieres | Usa este archivo |
|---------------|------------------|
| TLS automático, sin configuración manual | `docker-compose.caddy.yml` o `docker-compose.https-portal.yml` |
| TLS automático con un panel (Traefik) | `docker-compose.traefik.yml` |
| Sin puertos abiertos (zero-trust) | `docker-compose.cloudflare-tunnel.yml` |
| Ya usas Nginx + Certbot | `docker-compose.nginx.yml` |
| Copias de seguridad programadas desde la interfaz (sin sidecar) | Integrado - actívalas en Ajustes y luego Datos |
| Copias de seguridad programadas de SQLite (sidecar de volcado bruto, externo a S3) | `docker-compose.with-backup.yml` |
| En Kubernetes | `kubernetes.yaml` |

**Caddy** (recomendado - HTTPS automático):

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

**Cloudflare Tunnel** (sin puertos abiertos, sin necesidad de comprar un dominio):

```bash
cloudflared tunnel --url http://localhost:3000
```

</details>

## 📸 Capturas de pantalla

<details>
    <summary>Haz clic para desplegar</summary>
    <br/>

<table>
    <tr>
    <td>Página pública</td>
    <td>Panel de administración</td>
    </tr>
    <tr>
    <td><img src="public/screenshots/Public-Page(Aurora).jpeg" alt="Página pública [tema Aurora]" /></td>
    <td><img src="public/screenshots/Admin-Dashboard.jpeg" alt="Panel de administración" /></td>
    </tr>
    <tr>
    <td>Enlaces</td>
    <td>Perfil</td>
    </tr>
    <tr>
    <td><img src="public/screenshots/Links.jpeg" alt="Página de enlaces" /></td>
    <td><img src="public/screenshots/Profile.jpeg" alt="Página de perfil" /></td>
    </tr>
    <tr>
    <td>Tema</td>
    <td>Panel de vista previa en directo</td>
    </tr>
    <tr>
    <td><img src="public/screenshots/Theme.jpeg" alt="Página de temas" /></td>
    <td><img src="public/screenshots/Preview.jpeg" alt="Panel de vista previa en directo" /></td>
    </tr>
    <tr>
    <td>Configuración [General]</td>
    <td>Configuración [Apariencia]</td>
    </tr>
    <tr>
    <td><img src="public/screenshots/Settings(General).jpeg" alt="Página de configuración [pestaña General]" /></td>
    <td><img src="public/screenshots/Settings(Appearance).jpeg" alt="Página de configuración [pestaña Apariencia]" /></td>
    <tr>
    <td>Configuración [Seguridad]</td>
    <td>Configuración [Datos]</td>
    </tr>
    <tr>
    <td><img src="public/screenshots/Settings(Security).jpeg" alt="Página de configuración [pestaña Seguridad]" /></td>
    <td><img src="public/screenshots/Settings(Data).jpeg" alt="Página de configuración [pestaña Datos]" /></td>
    </tr>
</table>

</details>

## 🆚 Comparación

<div align="center">

| Funcionalidad | Linktree | LinkStack | LittleLink | Shako | **LinkBreeze** |
|---------|----------|-----------|------------|-------|----------------|
| **Precio** | Gratis - 35 USD/mes | Gratis | Gratis | Gratis | **Gratis** |
| **Panel de administración** | ✅ | ✅ | ❌ | ❌ | **✅ Rápido** |
| **Multipágina** | ❌ | ❌ | ❌ | ❌ | **✅ Ilimitadas** |
| **Favicons automáticos** | ❌ | ❌ | ❌ | ❌ | **✅** |
| **Asistente de migración** | ❌ | ❌ | ❌ | ❌ | **✅** |
| **Estadísticas integradas** | Básicas, completas de pago | Básicas | ❌ | ❌ | **✅ Completas y privadas** |
| **Recopilación de correos** | De pago | ❌ | ❌ | ❌ | **✅** |
| **Widgets integrados** | Parcial | ❌ | ❌ | ❌ | **✅** |
| **Programación de enlaces** | De pago | ❌ | ❌ | ❌ | **✅** |
| **Temas** | De pago | Limitados | Solo CSS | Archivo de configuración | **✅ Sistema completo de tokens** |
| **Códigos QR** | ✅ | ✅ | ❌ | ❌ | **✅ Personalizables** |
| **Autoalojado** | ❌ | ✅ | ✅ | ✅ | **✅** |
| **Carga de página** | Alojado | App PHP | Rápida (estática) | Rápida (estática) | **<300 ms, cero JS** |

</div>

## 💬 Comunidad

<div align="center">

**Consigue ayuda, presume de tu página y vota qué se publica a continuación.**

[![Discord](https://img.shields.io/discord/1559020936253022209?style=for-the-badge&logo=discord&logoColor=white&label=%C3%9Anete%20a%20nuestro%20Discord&color=5865F2)](https://discord.gg/bAJMW3bAJa)

</div>

## ⚙️ Configuración

Toda la configuración se realiza mediante variables de entorno. **[`.env.example`](.env.example) es la referencia canónica** - cópialo y cada variable está documentada en línea, incluidos los bloques de wallet.

| Variable | Valor predeterminado | Descripción |
|----------|----------------------|-------------|
| `PORT` | `3000` | Puerto del servidor |
| `DATABASE_PATH` | `./data/linkbreeze.db` | Ruta del archivo de base de datos SQLite |
| `BACKUP_DIR` | `./data/backups` | Directorio de almacenamiento de copias programadas (mantener dentro del volumen persistente `./data`) |
| `BACKUP_MIN_FREE_MB` | `50` | Omitir la escritura de copias cuando el espacio libre baje de este valor |
| `SECRET_KEY` | Generada automáticamente | Clave de firma HMAC para las sesiones |
| `EXTRA_SCRIPT_SRC` | _(vacío)_ | Dominios de analítica separados por espacios para la CSP (por ejemplo, `plausible.io umami.is`) |
| `LINKBREEZE_PRIMARY_HOST` | _(vacío)_ | Host principal donde vive tu administración; el bloqueo de dominios personalizados devuelve 404 en todos los demás hosts (la variable de entorno tiene prioridad sobre el ajuste) |
| `LINKBREEZE_TRUST_X_FORWARDED_HOST` | `false` | Confiar en `X-Forwarded-Host` para el enrutamiento de dominios - actívalo solo detrás de un proxy que SOBREESCRIBA la cabecera (nginx, Caddy); la cabecera `Host` por defecto no puede falsificarse |

<details>
<summary>💳 &nbsp;Variables de wallet pass (Google Wallet / Apple Wallet)</summary>

| Variable | Descripción |
|----------|-------------|
| `GOOGLE_WALLET_ISSUER_ID` | ID numérico de emisor de Google Pay & Wallet Console. Activa los botones "Añadir a Google Wallet" |
| `GOOGLE_WALLET_SERVICE_ACCOUNT_JSON` | JSON de la cuenta de servicio (`client_email` + `private_key`) autorizada para la Wallet API |
| `APPLE_WALLET_CERT_PEM` | Certificado de firma del Pass Type ID (PEM). Activa los botones "Añadir a Apple Wallet" |
| `APPLE_WALLET_KEY_PEM` | Clave privada correspondiente al certificado de firma (PEM) |
| `APPLE_WALLET_KEY_PASSPHRASE` | Frase de la clave de firma, si está cifrada |
| `APPLE_WALLET_WWDR_PEM` | Certificado intermedio WWDR de Apple (PEM) |
| `APPLE_WALLET_TEAM_ID` | Tu Team ID de Apple de 10 caracteres |
| `APPLE_WALLET_PASS_TYPE_ID` | Tu Pass Type ID (debe empezar por `pass.`) |

Cada página pública renderiza un bloque para compartir con un botón "Guardar contacto" (vCard universal, siempre activo). Los botones de wallet se activan automáticamente cuando se configuran las credenciales anteriores. Google Wallet: cuenta de emisor gratuita, pero los pases solo se guardan para usuarios de prueba en la lista blanca hasta que Google conceda acceso de producción. Apple Wallet: requiere una cuenta de desarrollador de Apple de pago y solo se instala desde Safari. Los pases son instantáneas estáticas - el QR del pase siempre abre la página en vivo. Configuración → Integración muestra el estado de las credenciales por wallet y avisa cuando el certificado de firma de Apple está a punto de caducar.

</details>

**¿Usas analítica externa?** Pega el fragmento de tu proveedor en Configuración → Integración → Script de analítica y añade el dominio del proveedor a `EXTRA_SCRIPT_SRC` para que la CSP lo permita (por ejemplo, `EXTRA_SCRIPT_SRC=plausible.io umami.is`). Vuelve a compilar después de cambiarlo - la CSP se incorpora durante la compilación.

Los ajustes en tiempo de ejecución (slug de la página, título, SEO, tema) se gestionan desde el panel de administración y se almacenan en la base de datos - no es necesario modificar el código.

## 🌐 Dominios personalizados

Apunta tus propios dominios a tus páginas - una instancia, muchas identidades. Los visitantes llegan a `https://jane.com/` y ven la página de Jane directamente, con redirecciones canónicas automáticas, sitemaps listos para SEO y un bloqueo de admin estricto por host. Las vinculaciones se activan en su primera visita real (DNS autoverificado), y el alcance por página decide si un dominio ES la página (exclusivo) o un hub para todos los slugs.

Configuración completa - DNS, TLS comodín y configuraciones de proxy inverso listas para copiar para Caddy, nginx y Traefik - en **[docs/custom-domains.md](docs/custom-domains.md)**.

## 🔌 API REST

Gestiona enlaces, perfil y analíticas desde scripts, pipelines de CI o herramientas de terceros. Genera una clave API en **Settings → Security → API access** (la clave completa se muestra una sola vez - guárdala en un lugar seguro), y envíala en la cabecera `Authorization` con el esquema HTTP Bearer. Límite: 120 peticiones/minuto por clave, más una guarda por IP. Los endpoints de escritura están bloqueados en modo demo. Cada instancia sirve su propia referencia OpenAPI 3.1 en `/api/v1/docs` y `/api/v1/openapi.json`.

<details>
<summary>🔗 &nbsp;Endpoints</summary>

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/v1/links` | Listar enlaces (`?limit`/`?cursor` páginas, `?fields=` campos reducidos) |
| GET | `/api/v1/links/:id` | Obtener un enlace por id |
| POST | `/api/v1/links` | Crear un enlace |
| PUT | `/api/v1/links/:id` | Actualizar un enlace (parcial - solo cambian los campos enviados) |
| DELETE | `/api/v1/links/:id` | Eliminar un enlace |
| PUT | `/api/v1/links/reorder` | Reordenar enlaces (`{ "ids": [3, 1, 2] }`) |
| POST | `/api/v1/links/import` | Crear enlaces por lotes (1-100 elementos, resultados por elemento) |
| GET | `/api/v1/sections` | Listar secciones (`?pageId=N` filtra) |
| POST | `/api/v1/sections` | Crear una sección |
| PUT | `/api/v1/sections/:id` | Actualizar una sección (parcial) |
| DELETE | `/api/v1/sections/:id` | Eliminar una sección (sus enlaces vuelven a sin categoría) |
| PUT | `/api/v1/sections/reorder` | Reordenar secciones (`{ "ids": [3, 1, 2] }`) |
| GET | `/api/v1/profile` | Obtener el perfil |
| PUT | `/api/v1/profile` | Actualizar el perfil (parcial) |
| GET | `/api/v1/analytics` | Vistas, clics y enlaces principales (`?range=7d\|30d\|90d`) |

Las respuestas exitosas envuelven la carga en `data`; los errores son `{ "error": { "code", "message" } }` con los estados HTTP correspondientes (401 clave ausente o inválida, 400 validación, 403 modo demo, 429 límite excedido). Las escrituras de enlaces pasan por la misma validación que la interfaz de administración - incluida la lista permitida de esquemas de URL. Las lecturas también envían un `ETag`; devuélvelo como `If-None-Match` para recibir un `304` vacío mientras nada cambie.

</details>

<details>
<summary>📦 &nbsp;Recetas de la API (curl)</summary>

```bash
# Configuración única
export LB_API_KEY="lbk_..."
export BASE="https://your-instance.example/api/v1"
```

```bash
# Listar enlaces: lista completa o una página paginada con campos reducidos
# (--oauth2-bearer envía la cabecera Bearer por ti)
curl -s --oauth2-bearer "$LB_API_KEY" "$BASE/links" | jq '.data | length'
curl -s --oauth2-bearer "$LB_API_KEY" "$BASE/links?limit=10&fields=title,url" | jq '.meta'
```

```bash
# Crear un enlace (201 devuelve la fila creada, con su id)
curl -s -X POST --oauth2-bearer "$LB_API_KEY" -H "Content-Type: application/json" \
  -d '{"title":"Docs","url":"https://example.com/docs","cardStyle":"rich"}' \
  "$BASE/links" | jq '.data.id'
```

```bash
# Actualización parcial: solo cambian los campos enviados (null limpia)
curl -s -X PUT --oauth2-bearer "$LB_API_KEY" -H "Content-Type: application/json" \
  -d '{"isActive": false}' "$BASE/links/12" | jq '.data.isActive'
```

```bash
# Reordenar enlaces y leer una métrica
curl -s -X PUT --oauth2-bearer "$LB_API_KEY" -H "Content-Type: application/json" \
  -d '{"ids":[3,1,2]}' "$BASE/links/reorder" | jq '.data'
curl -s --oauth2-bearer "$LB_API_KEY" "$BASE/analytics?range=30d" | jq '.data.ctr'
```

```bash
# Crear una sección e importar enlaces por lotes (resultados por elemento)
curl -s -X POST --oauth2-bearer "$LB_API_KEY" -H "Content-Type: application/json" \
  -d '{"pageId":1,"title":"Work"}' "$BASE/sections" | jq '.data.id'
curl -s -X POST --oauth2-bearer "$LB_API_KEY" -H "Content-Type: application/json" \
  -d '{"items":[{"title":"A","url":"https://a.example"},{"title":"","url":"https://bad.example"}]}' \
  "$BASE/links/import" | jq '.data.results'
```

```bash
# Lectura condicional: reproduce el ETag → 304 vacío mientras nada cambie
ETAG=$(curl -sI --oauth2-bearer "$LB_API_KEY" "$BASE/links" | tr -d '\r' | grep -i '^etag:' | cut -d' ' -f2)
curl -s -o /dev/null -w '%{http_code}\n' --oauth2-bearer "$LB_API_KEY" -H "If-None-Match: $ETAG" "$BASE/links"   # → 304
```

Sigue `meta.nextCursor` (devuélvelo como `?cursor=`) para recorrer todas las páginas. El contrato legible por máquina completo está en `$BASE/openapi.json`.

</details>

## 🎨 Sistema de temas

Se incluyen 11 preajustes de serie: **Aurora** (el buque insignia animado), **Glassmorphism**, **Neon Cyberpunk**, **Editorial Paper**, **Terminal Mono**, **Pastel Soft**, **Brutalist**, **Retro Sunset**, **Minimal Light**, **8-Bit Retro** y **Frutiger Aero**.

<details>
<summary>🎛️ &nbsp;Qué controla el personalizador</summary>

El motor de temas es un sistema de tokens basado en propiedades CSS personalizadas (`--lb-*`) - cada color, radio, sombra y fuente de la página pública es un token.

- **Fondo** - 8 tipos (sólido, degradado, radial, malla, aurora, degradado animado, imagen, patrón) con controles de ángulo, superposición y opacidad
- **Colores** - acento, secundario, texto, texto atenuado, fondo de tarjeta, borde de tarjeta (hex o rgba)
- **Tipografía** - 15 fuentes de Google seleccionadas, escala tipográfica, grosor, interletraje - o sube tus propias fuentes woff2/woff (máx. 2 MB). Las fuentes subidas se sirven desde el mismo origen, se incluyen en las exportaciones de temas y se conservan en las copias de seguridad
- **Estilo de tarjeta** - 7 estilos de enlace (pill, redondeado, angular, cristal, contorno, neón, píxel), efectos al pasar el cursor, tamaño del botón, radio de las esquinas, grosor del borde, intensidad de la sombra
- **Diseño** - anchura del contenedor, alineación (izquierda/centro/derecha), densidad (compacta/normal/espaciosa)
- **Efectos** - brillo con color personalizado, desenfoque de cristal, textura de ruido, animación de aparición
- **Duplicar / importar / exportar** - clona cualquier tema como copia editable y compártelo como JSON

</details>

## 📖 Documentación y enlaces

[Guía de contribución](CONTRIBUTING.md) · [Política de seguridad](SECURITY.md) · [Registro de cambios](CHANGELOG.md) · [Solución de problemas](TROUBLESHOOTING.md) · [Custom Domains](docs/custom-domains.md) · [Decisiones de arquitectura](docs/adr/) · [Referencia de configuración](.env.example)

Fuente: [GitHub](https://github.com/OmniRise/LinkBreeze) (canónico) · [GitLab](https://gitlab.com/omnirise00/linkbreeze) (espejo público de solo lectura, sincronizado automáticamente) · Imagen: [`docker.io/omnirise/linkbreeze`](https://hub.docker.com/r/omnirise/linkbreeze)

Issues y PRs son bienvenidos en cualquiera de los dos forges.

## 🤝 Contribuir

¡Las contribuciones son bienvenidas! Consulta [CONTRIBUTING.md](CONTRIBUTING.md) para conocer las directrices.

## 📜 Licencia

MIT - haz con él lo que quieras. Consulta [LICENSE](LICENSE).

## 🏢 Acerca del proyecto

Desarrollado por [Manak-hash](https://github.com/Manak-hash) · Un proyecto de [OmniRise](https://omnirise.dev).
