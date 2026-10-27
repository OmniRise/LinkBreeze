<div align="center">

<img src="public/Public-Page-iPhone-Dashboard-iMac.png" alt="Banner" width="100%" />

---

[English](README.md) · [العربية](README.ar.md) · [中文](README.zh.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Italiano](README.it.md) · [日本語](README.ja.md) · [Português (Brasil)](README.pt-BR.md) · [Русский](README.ru.md) · [Español](README.es.md) · **Türkçe**

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

> **Linktree için aylık 15 $ ödemeyi bırak.** LinkBreeze; ücretsiz, kendi sunucunda barındırılan bir bağlantı merkezidir: hızlı, özelleştirilebilir, yerleşik analitikli. **Tek komutla kur.**

<div align="center">

&nbsp;[**🔗 Canlı Demo**](https://linkbreeze-demo.omnirise.dev/linkbreeze)&nbsp;&nbsp;·&nbsp;&nbsp;
[**🔐 Demo Panosu**](https://linkbreeze-demo.omnirise.dev/dashboard)

</div>

---

## ✨ Özellikler

<div align="center">
<table>
  <tr>
    <td width="50%" valign="top">🔗 <strong>Çoklu Sayfa Desteği</strong><br/>Sınırsız sayfa; her biri kendi slug'ı, teması, bağlantıları ve analitiğiyle</td>
    <td valign="top">🎨 <strong>Temalar + Özelleştirici</strong><br/>11 hazır tema ve içe/dışa aktarma destekli, tamamen token tabanlı bir özelleştirici</td>
  </tr>
  <tr>
    <td valign="top">📊 <strong>Gizlilik Öncelikli Analitik</strong><br/>Görüntülenme, tıklama, yönlendirenler, cihazlar. Çerezsiz, IP'ler hash'lenir, eski veriler otomatik temizlenir</td>
    <td valign="top">🧭 <strong>Taşıma Sihirbazı</strong><br/>Linktree, Bento, Hopp.bio, LittleLink veya herhangi bir HTML/JSON dışa aktarımından içe aktar</td>
  </tr>
  <tr>
    <td valign="top">🔒 <strong>Kendi Sunucunda</strong><br/>Verin senin, sunucun senin. İzleyici yok, reklam yok, abonelik yok</td>
    <td valign="top">🐳 <strong>Tek Komutla Kurulum</strong><br/>Tek curl komutu. Docker veya Podman'ı otomatik algılar ve yayındasın</td>
  </tr>
  <tr>
    <td valign="top">📱 <strong>Gömülü Widget'lar</strong><br/>Sayfanda YouTube, Spotify, SoundCloud, Vimeo ve Bandcamp</td>
    <td valign="top">🎯 <strong>QR Kodları</strong><br/>Otomatik oluşturulur; özel renkler, merkezde avatar veya favicon, 1024 px'e kadar SVG/PNG</td>
  </tr>
  <tr>
    <td width="50%" valign="top">🌐 <strong>Özel Alan Adları</strong><br/>Kendi alan adlarını sayfalara bağla - ziyaretçiler /slug olmadan doğrudan jane.com'a gelir</td>
    <td valign="top">⏰ <strong>Zamanlanmış Yedekler</strong><br/>Günlük/haftalık/aylık uygulama içi yedekler, tek tıkla geri yükleme, cron gerekmez</td>
  </tr>
</table>


⚡ **İstemci tarafında sıfır JavaScript. 300 ms'nin altında yüklenir. Tamamen sunucu tarafında oluşturulmuş HTML.**

</div>

<details>
<summary>✨ &nbsp;Tüm özellikler</summary>

- **🔗 Bağlantı Yönetimi** - Sınırsız bağlantıyı sürükle-bırak ile ekle, sırala ve özelleştir
- **🌐 Otomatik Favicon'lu Bağlantılar** - Bağlantılar hedef sitenin favicon'unu otomatik gösterir, ikon yüklemeye gerek yok
- **🖼️ Bağlantı Küçük Resimleri** - Görsel önizleme kartları için bağlantılarına resim ekle
- **⏰ Bağlantı Zamanlama** - Bağlantıları tarih/saat kontrolleriyle otomatik olarak görünür veya görünmez yap
- **🏷️ Özel Yönlendirme Slug'ları** - Silip yeniden oluşturulsa bile bozulmayan, paylaşılabilir sabit `/go/adiniz` kısa bağlantıları
- **📈 Harici Analitik** - Plausible, Umami, Matomo veya Google Analytics'i tek yapıştırmayla ekle
- **🖼️ Sosyal Önizleme (OG) Görselleri** - Sayfanın temasından otomatik oluşturulan paylaşım kartları ya da ölçek, konum ve yakınlaştırma kontrolüyle kendi görselini yükle
- **✏️ Özel CSS** - Sayfanı ham CSS enjeksiyonuyla ince ayarla
- **📧 E-posta Toplama** - Herkese açık sayfanda abone e-postaları topla, CSV olarak dışa aktar
- **🔔 Güncelleme Bildirimleri** - Yeni bir sürüm mevcut olduğunda panoda banner. Sunucuya sessiz veri gönderimi yok, otomatik güncelleme yok
- **🔑 Hızlı Yönetim Paneli** - Yukarıdaki her şey tek bir temiz ve anında açılan panoda

- **🌐 Özel Alan Adları** - Kendi alan adlarını sayfalara bağla; tek sayfa ya da hub kapsamı, otomatik canonical yönlendirmeler, sıkı yönetici host kilidi
- **⏰ Zamanlanmış Yedekler** - Saklama politikası ve tek tıkla geri yükleme ile günlük/haftalık/aylık uygulama içi yedekler, cron gerekmez
</details>

## 🚀 Hızlı Başlangıç

**Tek komut. Sıfır yapılandırma. 30 saniyede yayında:**

```bash
curl -fsSL https://linkbreeze.omnirise.dev/install.sh | bash
```

Betik Docker veya Podman'ı algılar, imajı çeker ve kapsayıcıyı başlatır. `sudo bash` ile çalıştır ve açılışta otomatik başlatmayı da etkinleştirmek için **y** diye yanıtla.

Ardından **http://localhost:3000** adresini aç - kurulum sihirbazı 30 saniyeden az sürer.

<details>
<summary>🔍 &nbsp;Çalıştırmadan önce betiği incelemek ister misin?</summary>

```bash
curl -fsSL https://linkbreeze.omnirise.dev/install.sh -o install.sh
less install.sh
bash install.sh
```

</details>

**Farklı bir yöntem mi tercih edersin?** Aşağıdakilerden birini genişlet.

<details>
<summary>🐳 &nbsp;Docker</summary>

Node.js yok, npm yok, yapılandırma dosyası yok. Çok mimarili imajlar: `linux/amd64` ve `linux/arm64` (Raspberry Pi 3/4/5, Apple Silicon, ARM VPS).

**Linux / macOS / Windows CMD:**

```bash
docker run -d --name linkbreeze --restart unless-stopped -p 3000:3000 -v linkbreeze-data:/app/data docker.io/omnirise/linkbreeze:latest
```

**Windows PowerShell** - satır sonları için backtick kullan:

```powershell
docker run -d `
  --name linkbreeze `
  --restart unless-stopped `
  -p 3000:3000 `
  -v linkbreeze-data:/app/data `
  docker.io/omnirise/linkbreeze:latest
```

> Veritabanı geçişleri kapsayıcı başlangıcında otomatik çalışır.

</details>

<details>
<summary>🧩 &nbsp;Docker Compose</summary>

Bir `docker-compose.yml` oluştur:

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

Güncelleme: `docker compose pull && docker compose up -d` · Günlükler: `docker compose logs -f linkbreeze`

Kaynaktan derlemeyi mi tercih edersin? `git clone https://github.com/OmniRise/LinkBreeze.git && cd LinkBreeze && docker compose up -d --build`

</details>

<details>
<summary>☁️ &nbsp;Coolify</summary>

1. **+ New Resource** → **Docker Compose Empty**
2. Yukarıdaki bölümdeki compose dosyasını yapıştır
3. Bir alan adı ayarla (örn. `links.alanadin.com`) - Let's Encrypt'i Coolify otomatik halleder
4. **Deploy** düğmesine tıkla

</details>

<details>
<summary>📦 &nbsp;Synology NAS</summary>

Container Manager (DSM 7.2+):

1. `docker.io/omnirise/linkbreeze:latest` imajını çek (bulunamazsa **Image** → **Add**)
2. **Create** ile bir kapsayıcı oluştur: ad `linkbreeze`, port `3000 → 3000`, volume `/docker/linkbreeze/data → /app/data`, yeniden başlatma ilkesi `Unless stopped`
3. **Done** düğmesine tıkla - `http://<nas-ip>:3000` adresinde yayında

Veriler, imaj güncellemeleri boyunca volume'da korunur.

</details>

<details>
<summary>🔧 &nbsp;Podman</summary>

```bash
podman run -d --name linkbreeze --restart unless-stopped -p 3000:3000 -v linkbreeze-data:/app/data docker.io/omnirise/linkbreeze:latest
```

Volume'da izin hataları mı alıyorsun? Önce `podman volume create linkbreeze-data` komutunu çalıştır. Baştaki kurulum betiği Podman'ı otomatik algılar.

</details>

<details>
<summary>🖥️ &nbsp;Portainer</summary>

1. **Stacks** → **Add stack**, adını `linkbreeze` koy
2. Yukarıdaki Docker Compose bölümündeki compose dosyasını yapıştır
3. **Deploy the stack** düğmesine tıkla

Güncellemeler: **Stacks** → `linkbreeze` → **Editor** → **Pull and redeploy**.

</details>

<details>
<summary>🔨 &nbsp;Elle kurulum (Docker olmadan)</summary>

Node.js 18+ gerekir.

```bash
git clone https://github.com/OmniRise/LinkBreeze.git
cd LinkBreeze
npm install
cp .env.example .env
# Edit .env to set your SECRET_KEY and DATABASE_PATH if needed
npm run db:migrate
npm run dev
```

Üretim için: `npm run build && npm start`

</details>

<details>
<summary>🌍 &nbsp;Kendi alan adında yayına çık</summary>

Dağıtım tamamlandığında sayfan `https://alan-adin.com/slug-in` adresinde olur.

1. Alan adının A kaydını sunucunun IP adresine yönlendir
2. 3000 portunu dışarı aç ya da önüne bir reverse proxy koy
3. Bitti

**Hazır compose dosyaları** [`examples/`](examples/) içinde - her senaryo için kendi başına yeten bir dosya:

| Ne istiyorsun | Bu dosyayı kullan |
|---------------|-------------------|
| Otomatik TLS, elle yapılandırma yok | `docker-compose.caddy.yml` veya `docker-compose.https-portal.yml` |
| Panolu otomatik TLS (Traefik) | `docker-compose.traefik.yml` |
| Açık port yok (sıfır güven) | `docker-compose.cloudflare-tunnel.yml` |
| Nginx + Certbot zaten kullanıyorsun | `docker-compose.nginx.yml` |
| Arayüzden zamanlanmış yedekler (sidecar yok) | Yerleşik - Ayarlar -> Veri bölümünden etkinleştir |
| Zamanlanmış SQLite yedekleri (ham dump sidecar, S3'e uzaktan yedekleme) | `docker-compose.with-backup.yml` |
| Kubernetes üzerinde çalıştırma | `kubernetes.yaml` |

**Caddy** (önerilen - otomatik HTTPS):

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

**Cloudflare Tunnel** (açık port yok, alan adı satın almaya gerek yok):

```bash
cloudflared tunnel --url http://localhost:3000
```

</details>

## 📸 Ekran Görüntüleri

<details>
    <summary>Genişletmek için tıkla</summary>
    <br/>

<table>
    <tr>
    <td>Herkese Açık Sayfa</td>
    <td>Yönetici Panosu</td>
    </tr>
    <tr>
    <td><img src="public/screenshots/Public-Page(Aurora).jpeg" alt="Herkese Açık Sayfa [Aurora Teması]" /></td>
    <td><img src="public/screenshots/Admin-Dashboard.jpeg" alt="Yönetici Panosu" /></td>
    </tr>
    <tr>
    <td>Bağlantılar</td>
    <td>Profil</td>
    </tr>
    <tr>
    <td><img src="public/screenshots/Links.jpeg" alt="Bağlantılar Sayfası" /></td>
    <td><img src="public/screenshots/Profile.jpeg" alt="Profil Sayfası" /></td>
    </tr>
    <tr>
    <td>Tema</td>
    <td>Canlı Önizleme Bölmesi</td>
    </tr>
    <tr>
    <td><img src="public/screenshots/Theme.jpeg" alt="Tema Sayfası" /></td>
    <td><img src="public/screenshots/Preview.jpeg" alt="Canlı Önizleme Bölmesi" /></td>
    </tr>
    <tr>
    <td>Ayarlar [Genel]</td>
    <td>Ayarlar [Görünüm]</td>
    </tr>
    <tr>
    <td><img src="public/screenshots/Settings(General).jpeg" alt="Ayarlar Sayfası [Genel Sekmesi]" /></td>
    <td><img src="public/screenshots/Settings(Appearance).jpeg" alt="Ayarlar Sayfası [Görünüm Sekmesi]" />
    <tr>
    <td>Ayarlar [Güvenlik]</td>
    <td>Ayarlar [Veri]</td>
    </tr>
    <tr>
    <td><img src="public/screenshots/Settings(Security).jpeg" alt="Ayarlar Sayfası [Güvenlik Sekmesi]" /></td>
    <td><img src="public/screenshots/Settings(Data).jpeg" alt="Ayarlar Sayfası [Veri Sekmesi]" /></td>
    </tr>
</table>

</details>

## 🆚 Karşılaştırma

<div align="center">

| Özellik | Linktree | LinkStack | LittleLink | Shako | **LinkBreeze** |
|---------|----------|-----------|------------|-------|----------------|
| **Fiyat** | Ücretsiz - 35 $/ay | Ücretsiz | Ücretsiz | Ücretsiz | **Ücretsiz** |
| **Yönetim Paneli** | ✅ | ✅ | ❌ | ❌ | **✅ Hızlı** |
| **Çoklu Sayfa** | ❌ | ❌ | ❌ | ❌ | **✅ Sınırsız** |
| **Otomatik Favicon'lu Bağlantılar** | ❌ | ❌ | ❌ | ❌ | **✅** |
| **Taşıma Sihirbazı** | ❌ | ❌ | ❌ | ❌ | **✅** |
| **Yerleşik Analitik** | Temel, tam olan ücretli | Temel | ❌ | ❌ | **✅ Tam ve gizlilik dostu** |
| **E-posta Toplama** | Ücretli | ❌ | ❌ | ❌ | **✅** |
| **Gömülü Widget'lar** | Kısmi | ❌ | ❌ | ❌ | **✅** |
| **Bağlantı Zamanlama** | Ücretli | ❌ | ❌ | ❌ | **✅** |
| **Temalar** | Ücretli | Sınırlı | Yalnız CSS | Yapılandırma dosyası | **✅ Tam token sistemi** |
| **QR Kodları** | ✅ | ✅ | ❌ | ❌ | **✅ Özelleştirilebilir** |
| **Kendi Sunucunda** | ❌ | ✅ | ✅ | ✅ | **✅** |
| **Sayfa Yükleme** | Barındırılan | PHP uygulaması | Hızlı (statik) | Hızlı (statik) | **<300 ms, sıfır JS** |

</div>

## 💬 Topluluk

<div align="center">

**Yardım al, sayfanı sergile, sırada ne çıkacağına oy ver.**

[![Discord](https://img.shields.io/discord/1559020936253022209?style=for-the-badge&logo=discord&logoColor=white&label=Join%20us%20on%20Discord&color=5865F2)](https://discord.gg/bAJMW3bAJa)

</div>

## ⚙️ Yapılandırma

Tüm yapılandırma ortam değişkenleri üzerinden yapılır. **[`.env.example`](.env.example) yetkili başvuru kaynağıdır** - kopyala; cüzdan değişkenleri dahil her değişken satır içi açıklamalıdır.

| Değişken | Varsayılan | Açıklama |
|----------|---------|-------------|
| `PORT` | `3000` | Sunucu portu |
| `DATABASE_PATH` | `./data/linkbreeze.db` | SQLite veritabanı dosya yolu |
| `BACKUP_DIR` | `./data/backups` | Zamanlanmış yedek depolama dizini (kalıcı `./data` volume'unun içinde tut) |
| `BACKUP_MIN_FREE_MB` | `50` | Boş alan bu değerin altına düşerse yedek yazmayı atla |
| `SECRET_KEY` | Otomatik oluşturulur | Oturumlar için HMAC imzalama anahtarı |
| `EXTRA_SCRIPT_SRC` | _(boş)_ | CSP için boşlukla ayrılmış analitik alan adları (örn. `plausible.io umami.is`) |
| `LINKBREEZE_PRIMARY_HOST` | _(boş)_ | Yönetim panelinin barındığı birincil host; özel alan adı yönetici kilidi diğer tüm hostlara 404 döndürür (ortam değişkeni, panodaki ayarı geçersiz kılar) |
| `LINKBREEZE_TRUST_X_FORWARDED_HOST` | `false` | Alan adı yönlendirmesi için `X-Forwarded-Host` başlığına güven - yalnızca bu başlığı ÜZERİNE YAZAN bir proxy arkasında etkinleştir (nginx, Caddy); varsayılan `Host` başlığı sahteciliğe açık değildir |

<details>
<summary>💳 &nbsp;Cüzdan kartı değişkenleri (Google Wallet / Apple Wallet)</summary>

| Değişken | Açıklama |
|----------|-------------|
| `GOOGLE_WALLET_ISSUER_ID` | Google Pay & Wallet Console'dan alınan sayısal issuer kimliği. "Google Wallet'a Ekle" düğmelerini etkinleştirir |
| `GOOGLE_WALLET_SERVICE_ACCOUNT_JSON` | Wallet API için yetkilendirilmiş servis hesabı JSON'u (`client_email` + `private_key`) |
| `APPLE_WALLET_CERT_PEM` | Pass Type ID imzalama sertifikası (PEM). "Apple Wallet'a Ekle" düğmelerini etkinleştirir |
| `APPLE_WALLET_KEY_PEM` | İmzalama sertifikasıyla eşleşen özel anahtar (PEM) |
| `APPLE_WALLET_KEY_PASSPHRASE` | Şifreliyse imzalama anahtarının parolası |
| `APPLE_WALLET_WWDR_PEM` | Apple WWDR ara sertifikası (PEM) |
| `APPLE_WALLET_TEAM_ID` | 10 karakterli Apple Team ID'in |
| `APPLE_WALLET_PASS_TYPE_ID` | Pass Type ID'in (`pass.` ile başlamalı) |

Her herkese açık sayfa, "Kişiyi kaydet" düğmeli bir paylaşım bloğu oluşturur (evrensel vCard, her zaman açık). Yukarıdaki kimlik bilgileri yapılandırıldığında cüzdan düğmeleri otomatik yanar. Google Wallet: issuer hesabı ücretsizdir, ancak Google üretim erişimi verene kadar kartlar yalnızca beyaz listedeki test kullanıcıları tarafından kaydedilir. Apple Wallet: ücretli bir Apple Developer hesabı gerekir ve kartlar yalnızca Safari'den yüklenebilir. Kartlar statik anlık görüntülerdir - kart üzerindeki QR her zaman canlı sayfayı açar. Ayarlar → Entegrasyon bölümü cüzdan başına kimlik bilgisi durumunu gösterir ve Apple imzalama sertifikasının süresi dolmak üzereyken uyarır.

</details>

**Harici analitik mi kullanıyorsun?** Sağlayıcı snippet'ini Ayarlar → Entegrasyon → Analitik betiği alanına yapıştır, ardından CSP'nin izin vermesi için sağlayıcının alan adını `EXTRA_SCRIPT_SRC` değişkenine ekle (örn. `EXTRA_SCRIPT_SRC=plausible.io umami.is`). Değiştirdikten sonra yeniden derle - CSP derleme aşamasında gömülür.

Çalışma zamanı ayarları (sayfa slug'ı, başlık, SEO, tema) yönetim panosundan yönetilir ve veritabanında saklanır - kod değişikliği gerekmez.

## 🌐 Özel Alan Adları

Kendi alan adlarını sayfalara yönlendir - tek kurulum, çok kimlik. Ziyaretçiler `https://jane.com/` adresine gelir ve doğrudan Jane'in sayfasını görür; üstelik otomatik canonical yönlendirmeler, SEO'ya hazır site haritaları ve sıkı bir yönetici host kilidiyle. Bağlamalar ilk gerçek ziyarette etkinleşir (kendi kendini doğrulayan DNS) ve sayfa başına kapsam, alan adının sayfanın KENDİSİ mi (münhasır) yoksa tüm slug'lar için bir hub mı olduğunu belirler.

Eksiksiz kurulum - DNS, wildcard TLS ve Caddy, nginx ve Traefik için kopyala-yapıştır reverse proxy yapılandırmaları - **[docs/custom-domains.md](docs/custom-domains.md)** içinde.

## 🔌 REST API

Bağlantıları, profili ve analitiği betiklerden, CI boru hatlarından veya üçüncü taraf araçlardan yönetin. **Settings → Security → API access** bölümünde bir API anahtarı oluşturun (tam anahtar yalnızca bir kez gösterilir - güvenli bir yerde saklayın) ve HTTP Bearer şemasıyla `Authorization` başlığında gönderin. Dönüşüm varsayılan olarak anlıktır; yönetici isteğe bağlı bir saatlik geçiş süresini etkinleştirdiyse eski anahtar, pencere kapanana veya yönetici iptal edene kadar çalışmaya devam edebilir. Sınır: anahtar başına dakikada 120 istek, ayrıca IP başına bir koruma. Yazma uç noktaları demo modunda engellenir. Her kendi örneği `/api/v1/docs` ve `/api/v1/openapi.json` adreslerinde kendi OpenAPI 3.1 referansını sunar.

<details>
<summary>🔗 &nbsp;Uç noktalar</summary>

| Yöntem | Yol | Açıklama |
|--------|-----|----------|
| GET | `/api/v1/links` | Bağlantıları listele (`?limit`/`?cursor` sayfalar, `?fields=` azaltılmış alanlar) |
| GET | `/api/v1/links/:id` | Id ile bir bağlantı getir |
| POST | `/api/v1/links` | Bağlantı oluştur |
| PUT | `/api/v1/links/:id` | Bağlantıyı güncelle (kısmi - yalnızca gönderilen alanlar değişir) |
| DELETE | `/api/v1/links/:id` | Bağlantıyı sil |
| PUT | `/api/v1/links/reorder` | Bağlantıları yeniden sırala (`{ "ids": [3, 1, 2] }`) |
| POST | `/api/v1/links/import` | Toplu bağlantı oluşturma (1-100 öğe, öğe başına sonuç) |
| GET | `/api/v1/sections` | Bölümleri listele (`?pageId=N` filtreler) |
| POST | `/api/v1/sections` | Bölüm oluştur |
| PUT | `/api/v1/sections/:id` | Bölümü güncelle (kısmi) |
| DELETE | `/api/v1/sections/:id` | Bölümü sil (bağlantıları kategorisiz kalır) |
| PUT | `/api/v1/sections/reorder` | Bölümleri yeniden sırala (`{ "ids": [3, 1, 2] }`) |
| GET | `/api/v1/profile` | Profili al |
| PUT | `/api/v1/profile` | Profili güncelle (kısmi) |
| GET | `/api/v1/analytics` | Görüntülenmeler, tıklamalar ve üst bağlantılar (`?range=7d\|30d\|90d`) |

Başarılı yanıtlar yükü `data` içinde paketler; hatalar `{ "error": { "code", "message" } }` biçimindedir ve eşleş HTTP durumlarıyla gelir (401 anahtar eksik veya geçersiz, 400 doğrulama, 403 demo modu, 429 sınır). Bağlantı yazımları, yönetim arayüzüyle aynı doğrulamadan geçer - URL şeması izin listesi dahil. Okuma uçları da bir `ETag` döner; değişene kadar boş `304` almak için onu `If-None-Match` olarak geri gönderin. Her yanıt başlık sözleşmesini de taşır: `X-RateLimit-Limit`, `X-RateLimit-Remaining` ve `X-RateLimit-Reset` dakikalık bütçeyi gösterir (`429` ayrıca `Retry-After` gönderir), `Cache-Control: no-store` kimlik doğrulamalı yanıtları önbellekte tutmaz ve `401` `WWW-Authenticate` ile yanıt verir.

</details>

<details>
<summary>📦 &nbsp;API örnekleri (curl)</summary>

```bash
# Tek seferlik kurulum
export LB_API_KEY="lbk_..."
export BASE="https://your-instance.example/api/v1"
```

```bash
# Bağlantıları listele: tam liste veya azaltılmış alanlı sayfalı sayfa
# (--oauth2-bearer Bearer başlığını sizin gönderir)
curl -s --oauth2-bearer "$LB_API_KEY" "$BASE/links" | jq '.data | length'
curl -s --oauth2-bearer "$LB_API_KEY" "$BASE/links?limit=10&fields=title,url" | jq '.meta'
```

```bash
# Bağlantı oluştur (201, oluşturulan satırı ve id'yi döner)
curl -s -X POST --oauth2-bearer "$LB_API_KEY" -H "Content-Type: application/json" \
  -d '{"title":"Docs","url":"https://example.com/docs","cardStyle":"rich"}' \
  "$BASE/links" | jq '.data.id'
```

```bash
# Kısmi güncelleme: yalnızca gönderilen alanlar değişir (null temizler)
curl -s -X PUT --oauth2-bearer "$LB_API_KEY" -H "Content-Type: application/json" \
  -d '{"isActive": false}' "$BASE/links/12" | jq '.data.isActive'
```

```bash
# Bağlantıları yeniden sırala, sonra bir metriği oku
curl -s -X PUT --oauth2-bearer "$LB_API_KEY" -H "Content-Type: application/json" \
  -d '{"ids":[3,1,2]}' "$BASE/links/reorder" | jq '.data'
curl -s --oauth2-bearer "$LB_API_KEY" "$BASE/analytics?range=30d" | jq '.data.ctr'
```

```bash
# Bir bölüm oluştur, sonra toplu bağlantı içe aktarma (öğe başına sonuç)
curl -s -X POST --oauth2-bearer "$LB_API_KEY" -H "Content-Type: application/json" \
  -d '{"pageId":1,"title":"Work"}' "$BASE/sections" | jq '.data.id'
curl -s -X POST --oauth2-bearer "$LB_API_KEY" -H "Content-Type: application/json" \
  -d '{"items":[{"title":"A","url":"https://a.example"},{"title":"","url":"https://bad.example"}]}' \
  "$BASE/links/import" | jq '.data.results'
```

```bash
# Koşullu okuma: ETag'i tekrar gönder → değişene kadar boş 304
ETAG=$(curl -sI --oauth2-bearer "$LB_API_KEY" "$BASE/links" | tr -d '\r' | grep -i '^etag:' | cut -d' ' -f2)
curl -s -o /dev/null -w '%{http_code}\n' --oauth2-bearer "$LB_API_KEY" -H "If-None-Match: $ETAG" "$BASE/links"   # → 304
```

Tüm sayfaları dolaşmak için `meta.nextCursor` değerini (`?cursor=` olarak) geri gönderin. Makineyle okunabilir tam sözleşme `$BASE/openapi.json` adresinde.

</details>

## 🎨 Tema Sistemi

Kutudan çıktığı gibi 11 hazır tema gelir: **Aurora** (animasyonlu amiral gemisi), **Glassmorphism**, **Neon Cyberpunk**, **Editorial Paper**, **Terminal Mono**, **Pastel Soft**, **Brutalist**, **Retro Sunset**, **Minimal Light**, **8-Bit Retro** ve **Frutiger Aero**.

<details>
<summary>🎛️ &nbsp;Özelleştiricinin kontrol ettiği ayarlar</summary>

Tema motoru, CSS özel özelliklerine (`--lb-*`) dayalı bir token sistemidir - herkese açık sayfadaki her renk, köşe yarıçapı, gölge ve yazı tipi bir token'dır.

- **Arka plan** - 8 tür (düz, gradyan, radyal, mesh, aurora, animasyonlu gradyan, resim, desen); açı, kaplama ve opaklık kontrolleriyle
- **Renkler** - vurgu, ikincil, metin, soluk metin, kart arka planı, kart kenarlığı (hex veya rgba)
- **Tipografi** - 15 özenle seçilmiş Google Font, yazı tipi ölçeği, kalınlık, harf aralığı - ya da kendi woff2/woff dosyanı yükle (en fazla 2 MB). Yüklenen yazı tipleri same-origin olarak sunulur, tema dışa aktarımlarına gömülür ve yedeklerde taşınır
- **Kart stili** - 7 bağlantı stili (pill, rounded, sharp, glass, outline, neon, pixel), hover efektleri, düğme boyutu, köşe yarıçapı, kenarlık kalınlığı, gölge gücü
- **Yerleşim** - kapsayıcı genişliği, hizalama (sol/orta/sağ), yoğunluk (sıkı/normal/ferah)
- **Efektler** - özel renkli parıltı (glow), cam bulanıklığı, gürültü dokusu, beliriş animasyonu
- **Çoğaltma / içe / dışa aktarma** - herhangi bir temayı düzenlenebilir bir kopya olarak çoğalt ve JSON olarak paylaş

</details>

## 📖 Belgeler ve Bağlantılar

[Katkıda Bulunma](CONTRIBUTING.md) · [Güvenlik Politikası](SECURITY.md) · [Değişiklik Günlüğü](CHANGELOG.md) · [Sorun Giderme](TROUBLESHOOTING.md) · [Özel Alan Adları](docs/custom-domains.md) · [Mimari Kararlar](docs/adr/) · [Yapılandırma başvurusu](.env.example)

Kaynak: [GitHub](https://github.com/OmniRise/LinkBreeze) (birincil) · [GitLab](https://gitlab.com/omnirise00/linkbreeze) (herkese açık pull aynası, otomatik senkronize edilir) · İmaj: [`docker.io/omnirise/linkbreeze`](https://hub.docker.com/r/omnirise/linkbreeze)

Sorunlar ve PR'ler her iki platformda da memnuniyetle karşılanır.

## 🤝 Katkıda Bulunma

Katkılar memnuniyetle karşılanır! Yönergeler için [CONTRIBUTING.md](CONTRIBUTING.md) dosyasına bak.

## 📜 Lisans

MIT - ne istersen onu yap. Ayrıntılar için [LICENSE](LICENSE) dosyasına bak.

## 🏢 Hakkında

[Manak-hash](https://github.com/Manak-hash) tarafından geliştirildi · Bir [OmniRise](https://omnirise.dev) projesi.
