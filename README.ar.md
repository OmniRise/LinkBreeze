<div align="center">

<img src="public/Public-Page-iPhone-Dashboard-iMac.png" alt="Banner" width="100%" />

---

[English](README.md) · **العربية** · [中文](README.zh.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Italiano](README.it.md) · [日本語](README.ja.md) · [Português (Brasil)](README.pt-BR.md) · [Русский](README.ru.md) · [Español](README.es.md) · [Türkçe](README.tr.md)

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

> **توقف عن دفع 15 دولارًا شهريًا لـ Linktree.**  LinkBreeze مركز روابط مجاني ومستضاف ذاتيًا: سريع، قابل للتخصيص، مع إحصائيات مدمجة. **ثبّته بأمر واحد.**

<div align="center">

&nbsp;[**🔗 عرض مباشر**](https://linkbreeze-demo.omnirise.dev/linkbreeze)&nbsp;&nbsp;·&nbsp;&nbsp;
[**🔐 لوحة تحكم العرض**](https://linkbreeze-demo.omnirise.dev/dashboard)

</div>

---

## ✨ الميزات

<div align="center">
<table>
  <tr>
    <td width="50%" valign="top">🔗 <strong>دعم الصفحات المتعددة</strong><br/>صفحات غير محدودة، لكل منها اسم مختصر (slug) وثيم وروابط وإحصائيات خاصة بها</td>
    <td valign="top">🎨 <strong>الثيمات + المخصّص</strong><br/>11 إعدادًا مسبقًا إضافة إلى مخصّص كامل قائم على الرموز مع استيراد/تصدير</td>
  </tr>
  <tr>
    <td valign="top">📊 <strong>إحصائيات تحترم الخصوصية أولًا</strong><br/>مشاهدات، نقرات، مصادر، أجهزة. بلا كوكيز، عناوين IP مُهشَّرة، حذف تلقائي للبيانات القديمة</td>
    <td valign="top">🧭 <strong>معالج الترحيل</strong><br/>استورد من Linktree أو Bento أو Hopp.bio أو LittleLink أو أي تصدير HTML/JSON</td>
  </tr>
  <tr>
    <td valign="top">🔒 <strong>استضافة ذاتية</strong><br/>بياناتك، خادمك. لا متتبعات، لا إعلانات، لا اشتراكات</td>
    <td valign="top">🐳 <strong>تثبيت بأمر واحد</strong><br/>أمر curl واحد. يكتشف Docker أو Podman تلقائيًا وتصبح على الخط</td>
  </tr>
  <tr>
    <td valign="top">📱 <strong>أدوات مدمجة</strong><br/>YouTube وSpotify وSoundCloud وVimeo وBandcamp في صفحتك</td>
    <td valign="top">🎯 <strong>رموز QR</strong><br/>تُولَّد تلقائيًا، ألوان مخصصة، صورة رمزية أو أيقونة الموقع في المنتصف، SVG/PNG حتى 1024 بكسل</td>
  </tr>
  <tr>
    <td width="50%" valign="top">🌐 <strong>نطاقات مخصصة</strong><br/>اربط نطاقاتك الخاصة بالصفحات - يصل الزوار إلى jane.com مباشرة دون /slug</td>
    <td valign="top">⏰ <strong>نسخ احتياطي مجدول</strong><br/>نسخ احتياطية داخلية يومية/أسبوعية/شهرية مع استعادة بنقرة واحدة، دون cron</td>
  </tr>
</table>


⚡ **صفر JavaScript من جانب العميل. يُحمَّل في أقل من 300 مللي ثانية. HTML مصيَّر على الخادم بالكامل.**

</div>

<details>
<summary>✨ &nbsp;كل الميزات</summary>

- **🔗 إدارة الروابط** - أضف ورتّب وخصّص عددًا غير محدود من الروابط بالسحب والإفلات
- **🌐 روابط بأيقونات تلقائية** - تعرض الروابط تلقائيًا أيقونة الموقع الهدف، دون حاجة لرفع أيقونات
- **🖼️ صور مصغّرة للروابط** - أضف صورًا إلى روابطك للحصول على بطاقات معاينة بصرية
- **⏰ جدولة الروابط** - جدوِل ظهور الروابط أو اختفائها تلقائيًا مع تحكم بالتاريخ والوقت
- **🏷️ أسماء مخصصة لإعادة التوجيه** - روابط قصيرة ثابتة وقابلة للمشاركة بصيغة `/go/اسمك` تبقى صالحة بعد الحذف وإعادة الإنشاء
- **📈 إحصائيات خارجية** - أضف Plausible أو Umami أو Matomo أو Google Analytics بلصقة واحدة
- **🖼️ صور المعاينة الاجتماعية (OG)** - بطاقات مشاركة تُصيَّر تلقائيًا من ثيم صفحتك، أو ارفع صورتك الخاصة مع التحكم في الملاءمة والموضع والتكبير
- **✏️ CSS مخصص** - اضبط صفحتك بدقة عبر حقن CSS خام
- **📧 جمع البريد الإلكتروني** - اجمع بريد المشتركين في صفحتك العامة وصدّره إلى CSV
- **🔔 إشعارات التحديث** - شريط في لوحة التحكم عند توفر نسخة جديدة. لا اتصال خارجي، لا تحديث تلقائي
- **🔑 لوحة تحكم سريعة** - كل ما سبق من لوحة واحدة نظيفة وفورية

- **🌐 نطاقات مخصصة** - اربط نطاقاتك الخاصة بالصفحات؛ نطاق حصري أو مركز، تحويلات canonical تلقائية، قفل إدارة صارم حسب المستضيف
- **⏰ نسخ احتياطي مجدول** - نسخ احتياطية داخلية يومية/أسبوعية/شهرية مع احتفاظ واستعادة بنقرة واحدة، دون cron
</details>

## 🚀 البدء السريع

**أمر واحد. صفر إعداد. على الخط في 30 ثانية:**

```bash
curl -fsSL https://linkbreeze.omnirise.dev/install.sh | bash
```

يكتشف السكربت Docker أو Podman، يجلب الصورة ويشغّل الحاوية. شغّله بـ `sudo bash` وأجب **y** لتفعيل التشغيل التلقائي عند الإقلاع أيضًا.

ثم افتح **http://localhost:3000** - معالج الإعداد يستغرق أقل من 30 ثانية.

<details>
<summary>🔍 &nbsp;تريد فحص السكربت قبل تشغيله؟</summary>

```bash
curl -fsSL https://linkbreeze.omnirise.dev/install.sh -o install.sh
less install.sh
bash install.sh
```

</details>

**تفضّل طريقة أخرى؟** افتح إحدى الطرق أدناه.

<details>
<summary>🐳 &nbsp;Docker</summary>

لا Node.js ولا npm ولا ملفات إعداد. صور متعددة المعماريات: `linux/amd64` و `linux/arm64` (Raspberry Pi 3/4/5، Apple Silicon، VPS بمعمارية ARM).

**Linux / macOS / Windows CMD:**

```bash
docker run -d --name linkbreeze --restart unless-stopped -p 3000:3000 -v linkbreeze-data:/app/data docker.io/omnirise/linkbreeze:latest
```

**Windows PowerShell** - استخدم backticks لكسر الأسطر:

```powershell
docker run -d `
  --name linkbreeze `
  --restart unless-stopped `
  -p 3000:3000 `
  -v linkbreeze-data:/app/data `
  docker.io/omnirise/linkbreeze:latest
```

> تُنفَّذ تهجرات قاعدة البيانات تلقائيًا عند تشغيل الحاوية.

</details>

<details>
<summary>🧩 &nbsp;Docker Compose</summary>

أنشئ ملف `docker-compose.yml`:

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

الترقية: `docker compose pull && docker compose up -d` · السجلات: `docker compose logs -f linkbreeze`

تفضّل البناء من المصدر؟ `git clone https://github.com/OmniRise/LinkBreeze.git && cd LinkBreeze && docker compose up -d --build`

</details>

<details>
<summary>☁️ &nbsp;Coolify</summary>

1. **+ New Resource** → **Docker Compose Empty**
2. الصق ملف compose من القسم أعلاه
3. عيّن نطاقًا (مثل `links.yourdomain.com`) - يتولى Coolify Let's Encrypt تلقائيًا
4. انقر **Deploy**

</details>

<details>
<summary>📦 &nbsp;Synology NAS</summary>

Container Manager (DSM 7.2+):

1. اجلب الصورة `docker.io/omnirise/linkbreeze:latest` (**Image** → **Add**، إن لم توجد)
2. **أنشئ** حاوية: الاسم `linkbreeze`، المنفذ `3000 → 3000`، الوحدة التخزينية `/docker/linkbreeze/data → /app/data`، سياسة إعادة التشغيل `Unless stopped`
3. انقر **Done** - على الخط عبر `http://<nas-ip>:3000`

تبقى البيانات في الوحدة التخزينية عبر تحديثات الصورة.

</details>

<details>
<summary>🔧 &nbsp;Podman</summary>

```bash
podman run -d --name linkbreeze --restart unless-stopped -p 3000:3000 -v linkbreeze-data:/app/data docker.io/omnirise/linkbreeze:latest
```

أخطاء صلاحيات على الوحدة التخزينية؟ نفّذ `podman volume create linkbreeze-data` أولًا. سكربت التثبيت في الأعلى يكتشف Podman تلقائيًا.

</details>

<details>
<summary>🖥️ &nbsp;Portainer</summary>

1. **Stacks** → **Add stack**، سمّها `linkbreeze`
2. الصق ملف compose من قسم Docker Compose أعلاه
3. انقر **Deploy the stack**

التحديثات: **Stacks** → `linkbreeze` → **Editor** → **Pull and redeploy**.

</details>

<details>
<summary>🔨 &nbsp;يدويًا (بدون Docker)</summary>

يتطلب Node.js 18+.

```bash
git clone https://github.com/OmniRise/LinkBreeze.git
cd LinkBreeze
npm install
cp .env.example .env
# Edit .env to set your SECRET_KEY and DATABASE_PATH if needed
npm run db:migrate
npm run dev
```

للإنتاج: `npm run build && npm start`

</details>

<details>
<summary>🌍 &nbsp;انشر صفحتك على نطاقك</summary>

بعد النشر، تصبح صفحتك متاحة على `https://your-domain.com/your-slug`.

1. وجّه سجل A لنطاقك إلى عنوان IP لخادمك
2. اكشف المنفذ 3000 أو ضع وكيلًا عكسيًا أمامه
3. انتهى

**ملفات compose جاهزة** موجودة في [`examples/`](examples/) - ملف واحد مستقل بذاته لكل سيناريو:

| ما تريده | استخدم هذا الملف |
|---------------|---------------|
| TLS تلقائي دون إعداد يدوي | `docker-compose.caddy.yml` أو `docker-compose.https-portal.yml` |
| TLS تلقائي مع لوحة تحكم (Traefik) | `docker-compose.traefik.yml` |
| دون فتح منافذ (zero-trust) | `docker-compose.cloudflare-tunnel.yml` |
| تستخدم Nginx + Certbot أصلًا | `docker-compose.nginx.yml` |
| نسخ احتياطية مجدولة من الواجهة (بدون حاوية مساعدة) | مدمجة - فعّلها من الإعدادات ثم البيانات |
| نسخ احتياطي مجدول لـ SQLite (حاوية مساعدة، تفريغ خام، تخزين خارجي S3) | `docker-compose.with-backup.yml` |
| التشغيل على Kubernetes | `kubernetes.yaml` |

**Caddy** (موصى به - HTTPS تلقائي):

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

**Cloudflare Tunnel** (دون فتح منافذ، دون شراء نطاق):

```bash
cloudflared tunnel --url http://localhost:3000
```

</details>

## 📸 لقطات الشاشة

<details>
    <summary>انقر للتوسيع</summary>
    <br/>

<table>
    <tr>
    <td>الصفحة العامة</td>
    <td>لوحة التحكم</td>
    </tr>
    <tr>
    <td><img src="public/screenshots/Public-Page(Aurora).jpeg" alt="الصفحة العامة [ثيم Aurora]" /></td>
    <td><img src="public/screenshots/Admin-Dashboard.jpeg" alt="لوحة التحكم" /></td>
    </tr>
    <tr>
    <td>الروابط</td>
    <td>الملف الشخصي</td>
    </tr>
    <tr>
    <td><img src="public/screenshots/Links.jpeg" alt="صفحة الروابط" /></td>
    <td><img src="public/screenshots/Profile.jpeg" alt="صفحة الملف الشخصي" /></td>
    </tr>
    <tr>
    <td>الثيم</td>
    <td>لوحة المعاينة الحية</td>
    </tr>
    <tr>
    <td><img src="public/screenshots/Theme.jpeg" alt="صفحة الثيم" /></td>
    <td><img src="public/screenshots/Preview.jpeg" alt="لوحة المعاينة الحية" /></td>
    </tr>
    <tr>
    <td>الإعدادات [عام]</td>
    <td>الإعدادات [المظهر]</td>
    </tr>
    <tr>
    <td><img src="public/screenshots/Settings(General).jpeg" alt="صفحة الإعدادات [تبويب عام]" /></td>
    <td><img src="public/screenshots/Settings(Appearance).jpeg" alt="صفحة الإعدادات [تبويب المظهر]" /></td>
    <tr>
    <td>الإعدادات [الأمان]</td>
    <td>الإعدادات [البيانات]</td>
    </tr>
    <tr>
    <td><img src="public/screenshots/Settings(Security).jpeg" alt="صفحة الإعدادات [تبويب الأمان]" /></td>
    <td><img src="public/screenshots/Settings(Data).jpeg" alt="صفحة الإعدادات [تبويب البيانات]" /></td>
    </tr>
</table>

</details>

## 🆚 المقارنة

<div align="center">

| الميزة | Linktree | LinkStack | LittleLink | Shako | **LinkBreeze** |
|---------|----------|-----------|------------|-------|----------------|
| **السعر** | مجاني - 35 دولارًا/شهر | مجاني | مجاني | مجاني | **مجاني** |
| **لوحة التحكم** | ✅ | ✅ | ❌ | ❌ | **✅ سريعة** |
| **صفحات متعددة** | ❌ | ❌ | ❌ | ❌ | **✅ غير محدودة** |
| **روابط بأيقونات تلقائية** | ❌ | ❌ | ❌ | ❌ | **✅** |
| **معالج الترحيل** | ❌ | ❌ | ❌ | ❌ | **✅** |
| **إحصائيات مدمجة** | أساسية، الكاملة مدفوعة | أساسية | ❌ | ❌ | **✅ كاملة وخاصة** |
| **جمع البريد الإلكتروني** | مدفوع | ❌ | ❌ | ❌ | **✅** |
| **أدوات مدمجة** | جزئية | ❌ | ❌ | ❌ | **✅** |
| **جدولة الروابط** | مدفوعة | ❌ | ❌ | ❌ | **✅** |
| **الثيمات** | مدفوعة | محدودة | CSS فقط | ملف إعداد | **✅ نظام رموز كامل** |
| **رموز QR** | ✅ | ✅ | ❌ | ❌ | **✅ قابلة للتخصيص** |
| **استضافة ذاتية** | ❌ | ✅ | ✅ | ✅ | **✅** |
| **تحميل الصفحة** | مستضاف | تطبيق PHP | سريع (ثابت) | سريع (ثابت) | **<300 مللي ثانية، صفر JS** |

</div>

## 💬 المجتمع

<div align="center">

**احصل على المساعدة، أبرز صفحتك، وصوّت على ما يُطلَق تاليًا.**

[![Discord](https://img.shields.io/discord/1559020936253022209?style=for-the-badge&logo=discord&logoColor=white&label=%D8%A7%D9%86%D8%B6%D9%85%20%D8%A5%D9%84%D9%89%20Discord&color=5865F2)](https://discord.gg/bAJMW3bAJa)

</div>

## ⚙️ الإعدادات

كل الإعدادات تتم عبر متغيرات البيئة. **[`.env.example`](.env.example) هو المرجع الأساسي** - انسخه وستجد كل متغير موثَّقًا داخليًا، بما في ذلك كتل المحفظة.

| المتغير | الافتراضي | الوصف |
|----------|---------|-------------|
| `PORT` | `3000` | منفذ الخادم |
| `DATABASE_PATH` | `./data/linkbreeze.db` | مسار ملف قاعدة بيانات SQLite |
| `BACKUP_DIR` | `./data/backups` | دليل تخزين النسخ الاحتياطية المجدولة (أبقِه داخل وحدة `./data` الدائمة) |
| `BACKUP_MIN_FREE_MB` | `50` | تجاوز كتابة النسخ الاحتياطية عندما تنخفض المساحة الحرة عن هذا الحد |
| `SECRET_KEY` | يُولَّد تلقائيًا | مفتاح توقيع HMAC للجلسات |
| `EXTRA_SCRIPT_SRC` | _(فارغ)_ | نطاقات الإحصائيات مفصولة بمسافات من أجل CSP (مثل `plausible.io umami.is`) |
| `LINKBREEZE_PRIMARY_HOST` | _(فارغ)_ | المستضيف الأساسي الذي تعمل عليه لوحة الإدارة؛ قفل النطاقات المخصص يُرجع 404 لكل مستضيف آخر (متغير البيئة يتجاوز إعداد الإدارة) |
| `LINKBREEZE_TRUST_X_FORWARDED_HOST` | `false` | الثقة بترويسة `X-Forwarded-Host` لتوجيه النطاقات - فعّلها فقط خلف وكيل يعيد كتابة الترويسة (nginx و Caddy)؛ ترويسة `Host` الافتراضية لا يمكن تزويرها |

<details>
<summary>💳 &nbsp;متغيرات تذاكر المحفظة (Google Wallet / Apple Wallet)</summary>

| المتغير | الوصف |
|----------|-------------|
| `GOOGLE_WALLET_ISSUER_ID` | معرّف المُصدر الرقمي من Google Pay & Wallet Console. يفعّل أزرار "إضافة إلى Google Wallet" |
| `GOOGLE_WALLET_SERVICE_ACCOUNT_JSON` | ملف JSON لحساب الخدمة (`client_email` + `private_key`) مُصرَّح له بواجهة Wallet API |
| `APPLE_WALLET_CERT_PEM` | شهادة توقيع Pass Type ID (PEM). يفعّل أزرار "إضافة إلى Apple Wallet" |
| `APPLE_WALLET_KEY_PEM` | المفتاح الخاص المطابق لشهادة التوقيع (PEM) |
| `APPLE_WALLET_KEY_PASSPHRASE` | عبارة مرور مفتاح التوقيع، إن كان مشفّرًا |
| `APPLE_WALLET_WWDR_PEM` | شهادة Apple WWDR الوسيطة (PEM) |
| `APPLE_WALLET_TEAM_ID` | معرّف فريق Apple الخاص بك المكوّن من 10 أحرف |
| `APPLE_WALLET_PASS_TYPE_ID` | معرّف Pass Type ID الخاص بك (يجب أن يبدأ بـ `pass.`) |

|كل صفحة عامة تعرض كتلة مشاركة تحتوي زر "حفظ جهة الاتصال" (vCard عالمي، مفعّل دائمًا). تُفعَّل أزرار المحافظ تلقائيًا عند تكوين بيانات الاعتماد أعلاه. Google Wallet: حساب مُصدر مجاني، لكن لا يمكن حفظ التذاكر إلا لمستخدمي الاختبار المدرجين في القائمة البيضاء حتى تمنح Google الوصول إلى الإنتاج. Apple Wallet: يتطلب حساب مطوّر Apple مدفوعًا والتثبيت من Safari فقط. التذاكر لقطات ثابتة - رمز QR في التذكرة يفتح الصفحة الحية دائمًا. تعرض الإعدادات ← التكامل حالة بيانات الاعتماد لكل محفظة وتحذّر عندما تقترب شهادة توقيع Apple من انتهاء الصلاحية.

</details>

**تستخدم إحصائيات خارجية؟** الصق مقطع المزوّد في الإعدادات ← التكامل ← سكربت الإحصائيات، ثم أضف نطاق المزوّد إلى `EXTRA_SCRIPT_SRC` كي تسمح CSP به (مثل `EXTRA_SCRIPT_SRC=plausible.io umami.is`). أعد البناء بعد تغييره - تُدمَج CSP في البناء.

إعدادات التشغيل (اسم الصفحة المختصر، العنوان، SEO، الثيم) تُدار عبر لوحة التحكم وتُخزَّن في قاعدة البيانات - دون أي تعديل على الكود.

## 🌐 النطاقات المخصصة

وجّه نطاقاتك الخاصة إلى الصفحات - نسخة واحدة، هويات متعددة. يصل الزوار إلى `https://jane.com/` فيرون صفحة Jane مباشرة، مع تحويلات canonical تلقائية وخرائط مواقع صديقة لمحركات البحث وقفل إدارة صارم حسب المستضيف. تتفعّل الروابط عند أول زيارة حقيقية (DNS ذاتي التحقق)، ويحدد نطاق كل صفحة ما إن كان النطاق هو الصفحة نفسها (حصري) أم مركزًا لجميع المعرّفات.

الإعداد الكامل - DNS وTLS wildcard وتكوينات وكيل عكسي جاهزة للنسخ لـ Caddy وnginx وTraefik - في **[docs/custom-domains.md](docs/custom-domains.md)**.

## 🔌 واجهة REST

أدر الروابط والملف الشخصي والإحصائيات من السكربتات وأنابيب CI أو الأدوات الخارجية. أنشئ مفتاح API من **Settings → Security → API access** (يُعرض المفتاح الكامل مرة واحدة فقط - احفظه في مكان آمن) وأرسله في ترويسة `Authorization` بمخطط HTTP Bearer. الحد: 120 طلباً في الدقيقة لكل مفتاح، مع حماية إضافية بعنوان IP. نقاط النهاية الكتابية محجوبة في وضع العرض التجريبي. يقدّم كل نسخة استضافة مرجع OpenAPI 3.1 خاصاً بها على `/api/v1/docs` و`/api/v1/openapi.json`.

<details>
<summary>🔗 &nbsp;نقاط النهاية</summary>

| الطريقة | المسار | الوصف |
|---------|--------|-------|
| GET | `/api/v1/links` | سرد جميع الروابط |
| POST | `/api/v1/links` | إنشاء رابط |
| PUT | `/api/v1/links/:id` | تحديث رابط (جزئي - تُغيَّر الحقول المرسلة فقط) |
| DELETE | `/api/v1/links/:id` | حذف رابط |
| PUT | `/api/v1/links/reorder` | إعادة ترتيب الروابط (`{ "ids": [3, 1, 2] }`) |
| GET | `/api/v1/profile` | جلب الملف الشخصي |
| PUT | `/api/v1/profile` | تحديث الملف الشخصي (جزئي) |
| GET | `/api/v1/analytics` | المشاهدات والنقرات والروابط الأكثر زيارة (`?range=7d\|30d\|90d`) |

تغلّف الاستجابات الناجحة البيانات في `data`؛ وأخطاء الصيغة `{ "error": { "code", "message" } }` مع رموز HTTP المطابقة (401 مفتاح مفقود أو غير صالح، 400 تحقق، 403 وضع العرض التجريبي، 429 تجاوز الحد). تمر كتابة الروابط بنفس التحقق المستخدم في لوحة الإدارة - بما في ذلك قائمة مخططات URL المسموح بها.

</details>

<details>
<summary>📦 &nbsp;أمثلة واجهة REST (curl)</summary>

```bash
# إعداد مرة واحدة
export LB_API_KEY="lbk_..."
export BASE="https://your-instance.example/api/v1"
```

```bash
# سرد الروابط: القائمة الكاملة أو صفحة مُرقّمة بحقول مختصرة
# (--oauth2-bearer يرسل ترويسة Bearer نيابة عنك)
curl -s --oauth2-bearer "$LB_API_KEY" "$BASE/links" | jq '.data | length'
curl -s --oauth2-bearer "$LB_API_KEY" "$BASE/links?limit=10&fields=title,url" | jq '.meta'
```

```bash
# إنشاء رابط (201 يعيد الصف المنشأ مع المعرّف)
curl -s -X POST --oauth2-bearer "$LB_API_KEY" -H "Content-Type: application/json" \
  -d '{"title":"Docs","url":"https://example.com/docs","cardStyle":"rich"}' \
  "$BASE/links" | jq '.data.id'
```

```bash
# تحديث جزئي: تُغيَّر فقط الحقول المرسلة (null تمسح)
curl -s -X PUT --oauth2-bearer "$LB_API_KEY" -H "Content-Type: application/json" \
  -d '{"isActive": false}' "$BASE/links/12" | jq '.data.isActive'
```

```bash
# إعادة ترتيب الروابط ثم قراءة مقياس
curl -s -X PUT --oauth2-bearer "$LB_API_KEY" -H "Content-Type: application/json" \
  -d '{"ids":[3,1,2]}' "$BASE/links/reorder" | jq '.data'
curl -s --oauth2-bearer "$LB_API_KEY" "$BASE/analytics?range=30d" | jq '.data.ctr'
```

```bash
# أنشئ قسماً ثم استورد روابط بالجملة (نتائج لكل عنصر)
curl -s -X POST --oauth2-bearer "$LB_API_KEY" -H "Content-Type: application/json" \
  -d '{"pageId":1,"title":"Work"}' "$BASE/sections" | jq '.data.id'
curl -s -X POST --oauth2-bearer "$LB_API_KEY" -H "Content-Type: application/json" \
  -d '{"items":[{"title":"A","url":"https://a.example"},{"title":"","url":"https://bad.example"}]}' \
  "$BASE/links/import" | jq '.data.results'
```

اتبع `meta.nextCursor` (أعده كـ `?cursor=`) لاجتياز كل الصفحات. العقد الكامل القابل للقراءة الآلية على `$BASE/openapi.json`.

</details>

## 🎨 نظام الثيمات

11 إعدادًا مسبقًا مضمَّنة افتراضيًا: **Aurora** (الواجهة المتحركة الرئيسية)، **Glassmorphism**، **Neon Cyberpunk**، **Editorial Paper**، **Terminal Mono**، **Pastel Soft**، **Brutalist**، **Retro Sunset**، **Minimal Light**، **8-Bit Retro** و **Frutiger Aero**.

<details>
<summary>🎛️ &nbsp;ماذا يتحكم فيه المخصّص</summary>

|محرك الثيمات نظام رموز قائم على خصائص CSS المخصصة (`--lb-*`) - كل لون ونصف قطر وظل وخط في الصفحة العامة هو رمز.

- **الخلفية** - 8 أنواع (لون صامت، تدرّج، شعاعي، mesh، شفق قطبي، تدرّج متحرك، صورة، نقش) مع تحكم بالزاوية والطبقة العازلة والعتامة
- **الألوان** - اللون المميز، الثانوي، النص، النص الخافت، خلفية البطاقة، حدود البطاقة (hex أو rgba)
- **الطباعة** - 15 خط Google منتقاة، مقياس الخط، الوزن، تباعد الحروف - أو ارفع خطوطك الخاصة بصيغة woff2/woff (بحد أقصى 2 ميغابايت). تُخدَم الخطوط المرفوعة من نفس المصدر، وتُدمَج في تصديرات الثيمات، وتُنقَل مع النسخ الاحتياطية
- **نمط البطاقة** - 7 أنماط روابط (حبة، مستدير، حاد، زجاجي، محدد، نيون، بكسل)، مؤثرات التحويم، حجم الزر، انحناء الزوايا، سماكة الحدود، قوة الظل
- **التخطيط** - عرض الحاوية، المحاذاة (يسار/وسط/يمين)، الكثافة (مضغوط/عادي/مريح)
- **المؤثرات** - توهج بلون مخصص، ضباب زجاجي، نسيج ضوضاء، حركة ظهور
- **التكرار / الاستيراد / التصدير** - استنسخ أي ثيم كنسخة قابلة للتحرير وشاركه بصيغة JSON

</details>

## 📖 الوثائق والروابط

[دليل المساهمة](CONTRIBUTING.md) · [سياسة الأمان](SECURITY.md) · [سجل التغييرات](CHANGELOG.md) · [حل المشكلات](TROUBLESHOOTING.md) · [Custom Domains](docs/custom-domains.md) · [قرارات المعمارية](docs/adr/) · [مرجع الإعدادات](.env.example)

المصدر: [GitHub](https://github.com/OmniRise/LinkBreeze) (المرجع) · [GitLab](https://gitlab.com/omnirise00/linkbreeze) (نسخة عامة للسحب فقط، تُزامَن تلقائيًا) · الصورة: [`docker.io/omnirise/linkbreeze`](https://hub.docker.com/r/omnirise/linkbreeze)

المشكلات وطلبات السحب مرحّب بها على أيٍّ من المنصتين.

## 🤝 المساهمة

المساهمات مرحّب بها! طالع [CONTRIBUTING.md](CONTRIBUTING.md) للإرشادات.

## 📜 الترخيص

MIT - افعل ما تشاء. طالع [LICENSE](LICENSE).

## 🏢 حول

بناه [Manak-hash](https://github.com/Manak-hash) · مشروع [OmniRise](https://omnirise.dev).
