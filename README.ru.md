<div align="center">

<img src="public/Public-Page-iPhone-Dashboard-iMac.png" alt="Баннер" width="100%" />

---

[English](README.md) · [العربية](README.ar.md) · [中文](README.zh.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Italiano](README.it.md) · [日本語](README.ja.md) · [Português (Brasil)](README.pt-BR.md) · **Русский** · [Español](README.es.md) · [Türkçe](README.tr.md)

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

> **Хватит платить $15/мес за Linktree.** LinkBreeze - бесплатный хаб ссылок для самостоятельного размещения: быстрый, настраиваемый, со встроенной аналитикой. **Установка одной командой.**

<div align="center">

&nbsp;[**🔗 Онлайн-демо**](https://linkbreeze-demo.omnirise.dev/linkbreeze)&nbsp;&nbsp;·&nbsp;&nbsp;
[**🔐 Демо-панель управления**](https://linkbreeze-demo.omnirise.dev/dashboard)

</div>

---

## ✨ Возможности

<div align="center">
<table>
  <tr>
    <td width="50%" valign="top">🔗 <strong>Поддержка нескольких страниц</strong><br/>Неограниченное количество страниц, у каждой свой slug, тема, ссылки и аналитика</td>
    <td valign="top">🎨 <strong>Темы + кастомизатор</strong><br/>11 готовых пресетов плюс полноценный кастомизатор на основе токенов с импортом и экспортом</td>
  </tr>
  <tr>
    <td valign="top">📊 <strong>Аналитика с приоритетом приватности</strong><br/>Просмотры, клики, рефереры, устройства. Без cookies, IP-адреса хешируются, автоматическая очистка</td>
    <td valign="top">🧭 <strong>Мастер миграции</strong><br/>Импорт из Linktree, Bento, Hopp.bio, LittleLink или любого экспорта в HTML/JSON</td>
  </tr>
  <tr>
    <td valign="top">🔒 <strong>Собственный хостинг</strong><br/>Ваши данные, ваш сервер. Без трекеров, без рекламы, без подписки</td>
    <td valign="top">🐳 <strong>Установка одной командой</strong><br/>Одна команда curl. Скрипт сам определит Docker или Podman, и вы уже онлайн</td>
  </tr>
  <tr>
    <td valign="top">📱 <strong>Встраиваемые виджеты</strong><br/>YouTube, Spotify, SoundCloud, Vimeo и Bandcamp прямо на вашей странице</td>
    <td valign="top">🎯 <strong>QR-коды</strong><br/>Генерируются автоматически, свои цвета, аватар или favicon по центру, SVG/PNG до 1024px</td>
  </tr>
  <tr>
    <td width="50%" valign="top">🌐 <strong>Собственные домены</strong><br/>Привяжите свои домены к страницам - посетители попадают на jane.com, без /slug</td>
    <td valign="top">⏰ <strong>Резервные копии по расписанию</strong><br/>Ежедневные, еженедельные или ежемесячные внутренние резервные копии с восстановлением в один клик, cron не нужен</td>
  </tr>
</table>


⚡ **Ноль клиентского JavaScript. Загрузка менее чем за 300 мс. Чистый HTML с рендерингом на сервере.**

</div>

<details>
<summary>✨ &nbsp;Все возможности</summary>

- **🔗 Управление ссылками** - Добавляйте, меняйте порядок и настраивайте неограниченное количество ссылок с помощью drag-and-drop
- **🌐 Ссылки с автоматическим favicon** - Ссылки автоматически показывают favicon целевого сайта, загружать иконки не нужно
- **🖼️ Миниатюры ссылок** - Добавляйте изображения к ссылкам для наглядных карточек предпросмотра
- **⏰ Показ ссылок по расписанию** - Настраивайте автоматическое появление или исчезновение ссылок с помощью даты и времени
- **🏷️ Собственные slug для перенаправлений** - Стабильные короткие ссылки вида `/go/vashe-imya`, которыми удобно делиться и которые переживают удаление и повторное создание
- **📈 Внешняя аналитика** - Подключите Plausible, Umami, Matomo или Google Analytics одной вставкой
- **📦 Экспорт в статический HTML** - Скачайте любую страницу как один самостоятельный .html-файл и разместите где угодно
- **🖼️ Социальные превью (OG-изображения)** - Карточки для шаринга автоматически рендерятся из темы вашей страницы, либо загрузите свою с контролем подгонки, позиции и масштаба
- **✏️ Собственный CSS** - Тонкая настройка страницы вставкой чистого CSS
- **📧 Сбор адресов email** - Собирайте адреса подписчиков на публичной странице, экспорт в CSV
- **🔔 Уведомления об обновлениях** - Баннер в панели управления, когда доступна новая версия. Без связи с внешними серверами и без автообновления
- **🔑 Быстрая админ-панель** - Всё перечисленное выше - в одной чистой и мгновенной панели управления

- **🌐 Собственные домены** - Привязывайте свои домены к страницам; эксклюзивный или «хаб»-режим, автоматические канонические перенаправления, строгая блокировка хоста админки
- **⏰ Резервные копии по расписанию** - Ежедневные, еженедельные или ежемесячные внутренние резервные копии с политикой хранения и восстановлением в один клик, cron не требуется
</details>

## 🚀 Быстрый старт

**Одна команда. Ноль настроек. Онлайн за 30 секунд:**

```bash
curl -fsSL https://linkbreeze.omnirise.dev/install.sh | bash
```

Скрипт определит Docker или Podman, скачает образ и запустит контейнер. Запустите его через `sudo bash` и ответьте **y**, чтобы также включить автозапуск при загрузке системы.

Затем откройте **http://localhost:3000** - мастер настройки займёт меньше 30 секунд.

<details>
<summary>🔍 &nbsp;Хотите изучить скрипт перед запуском?</summary>

```bash
curl -fsSL https://linkbreeze.omnirise.dev/install.sh -o install.sh
less install.sh
bash install.sh
```

</details>

**Предпочитаете другой способ?** Разверните один из вариантов ниже.

<details>
<summary>🐳 &nbsp;Docker</summary>

Без Node.js, без npm, без файлов конфигурации. Мультиархитектурные образы: `linux/amd64` и `linux/arm64` (Raspberry Pi 3/4/5, Apple Silicon, ARM VPS).

**Linux / macOS / Windows CMD:**

```bash
docker run -d --name linkbreeze --restart unless-stopped -p 3000:3000 -v linkbreeze-data:/app/data docker.io/omnirise/linkbreeze:latest
```

**Windows PowerShell** - для переносов строк используйте обратные кавычки:

```powershell
docker run -d `
  --name linkbreeze `
  --restart unless-stopped `
  -p 3000:3000 `
  -v linkbreeze-data:/app/data `
  docker.io/omnirise/linkbreeze:latest
```

> Миграции базы данных выполняются автоматически при запуске контейнера.

</details>

<details>
<summary>🧩 &nbsp;Docker Compose</summary>

Создайте файл `docker-compose.yml`:

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

Обновление: `docker compose pull && docker compose up -d` · Логи: `docker compose logs -f linkbreeze`

Предпочитаете сборку из исходников? `git clone https://github.com/OmniRise/LinkBreeze.git && cd LinkBreeze && docker compose up -d --build`

</details>

<details>
<summary>☁️ &nbsp;Coolify</summary>

1. **+ Новая услуга** → **Пустой Docker Compose**
2. Вставьте compose-файл из раздела выше
3. Задайте домен (например, `links.yourdomain.com`) - Let's Encrypt Coolify настроит автоматически
4. Нажмите **Развернуть**

</details>

<details>
<summary>📦 &nbsp;Synology NAS</summary>

Container Manager (DSM 7.2+):

1. Скачайте образ `docker.io/omnirise/linkbreeze:latest` (**Образ** → **Добавить**, если не найден)
2. **Создайте** контейнер: имя `linkbreeze`, порт `3000 → 3000`, том `/docker/linkbreeze/data → /app/data`, политика перезапуска `Unless stopped`
3. Нажмите **Готово** - всё работает по адресу `http://<nas-ip>:3000`

Данные сохраняются в томе при обновлениях образа.

</details>

<details>
<summary>🔧 &nbsp;Podman</summary>

```bash
podman run -d --name linkbreeze --restart unless-stopped -p 3000:3000 -v linkbreeze-data:/app/data docker.io/omnirise/linkbreeze:latest
```

Ошибки прав доступа к тому? Сначала выполните `podman volume create linkbreeze-data`. Скрипт установки в начале автоматически определяет Podman.

</details>

<details>
<summary>🖥️ &nbsp;Portainer</summary>

1. **Стеки** → **Добавить стек**, задайте имя `linkbreeze`
2. Вставьте compose-файл из раздела Docker Compose выше
3. Нажмите **Развернуть стек**

Обновления: **Стеки** → `linkbreeze` → **Редактор** → **Скачать и развернуть заново**.

</details>

<details>
<summary>🔨 &nbsp;Вручную (без Docker)</summary>

Требуется Node.js 18+.

```bash
git clone https://github.com/OmniRise/LinkBreeze.git
cd LinkBreeze
npm install
cp .env.example .env
# Edit .env to set your SECRET_KEY and DATABASE_PATH if needed
npm run db:migrate
npm run dev
```

Для продакшена: `npm run build && npm start`

</details>

<details>
<summary>🌍 &nbsp;Публикация на своём домене</summary>

После развёртывания ваша страница доступна по адресу `https://your-domain.com/your-slug`.

1. Направьте A-запись домена на IP вашего сервера
2. Откройте порт 3000 или поставьте обратный прокси перед приложением
3. Готово

**Готовые compose-файлы** лежат в [`examples/`](examples/) - по одному самодостаточному файлу на каждый сценарий:

| Что вы хотите | Какой файл использовать |
|---------------|---------------|
| Автоматический TLS без ручной настройки | `docker-compose.caddy.yml` или `docker-compose.https-portal.yml` |
| Автоматический TLS с панелью управления (Traefik) | `docker-compose.traefik.yml` |
| Без открытых портов (zero-trust) | `docker-compose.cloudflare-tunnel.yml` |
| У вас уже есть Nginx + Certbot | `docker-compose.nginx.yml` |
| Резервные копии по расписанию из интерфейса (без sidecar) | Встроено - включите в Настройки -> Данные |
| Резервные копии SQLite по расписанию (sidecar с «сырым» дампом, выгрузка в S3) | `docker-compose.with-backup.yml` |
| Запуск в Kubernetes | `kubernetes.yaml` |

**Caddy** (рекомендуется - автоматический HTTPS):

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

**Cloudflare Tunnel** (без открытых портов, покупать домен не нужно):

```bash
cloudflared tunnel --url http://localhost:3000
```

</details>

## 📸 Скриншоты

<details>
    <summary>Нажмите, чтобы развернуть</summary>
    <br/>

<table>
    <tr>
    <td>Публичная страница</td>
    <td>Панель управления</td>
    </tr>
    <tr>
    <td><img src="public/screenshots/Public-Page(Aurora).jpeg" alt="Публичная страница [тема Aurora]" /></td>
    <td><img src="public/screenshots/Admin-Dashboard.jpeg" alt="Панель управления" /></td>
    </tr>
    <tr>
    <td>Ссылки</td>
    <td>Профиль</td>
    </tr>
    <tr>
    <td><img src="public/screenshots/Links.jpeg" alt="Страница ссылок" /></td>
    <td><img src="public/screenshots/Profile.jpeg" alt="Страница профиля" /></td>
    </tr>
    <tr>
    <td>Тема</td>
    <td>Панель живого предпросмотра</td>
    </tr>
    <tr>
    <td><img src="public/screenshots/Theme.jpeg" alt="Страница темы" /></td>
    <td><img src="public/screenshots/Preview.jpeg" alt="Панель живого предпросмотра" /></td>
    </tr>
    <tr>
    <td>Настройки [Общие]</td>
    <td>Настройки [Внешний вид]</td>
    </tr>
    <tr>
    <td><img src="public/screenshots/Settings(General).jpeg" alt="Страница настроек [вкладка «Общие»]" /></td>
    <td><img src="public/screenshots/Settings(Appearance).jpeg" alt="Страница настроек [вкладка «Внешний вид»]" /></td>
    <tr>
    <td>Настройки [Безопасность]</td>
    <td>Настройки [Данные]</td>
    </tr>
    <tr>
    <td><img src="public/screenshots/Settings(Security).jpeg" alt="Страница настроек [вкладка «Безопасность»]" /></td>
    <td><img src="public/screenshots/Settings(Data).jpeg" alt="Страница настроек [вкладка «Данные»]" /></td>
    </tr>
</table>

</details>

## 🆚 Сравнение

<div align="center">

| Возможность | Linktree | LinkStack | LittleLink | Shako | **LinkBreeze** |
|---------|----------|-----------|------------|-------|----------------|
| **Цена** | Бесплатно - $35/мес | Бесплатно | Бесплатно | Бесплатно | **Бесплатно** |
| **Админ-панель** | ✅ | ✅ | ❌ | ❌ | **✅ Быстрая** |
| **Несколько страниц** | ❌ | ❌ | ❌ | ❌ | **✅ Неограниченно** |
| **Ссылки с авто-favicon** | ❌ | ❌ | ❌ | ❌ | **✅** |
| **Мастер миграции** | ❌ | ❌ | ❌ | ❌ | **✅** |
| **Встроенная аналитика** | Базовая, полная - платно | Базовая | ❌ | ❌ | **✅ Полная и приватная** |
| **Сбор email** | Платно | ❌ | ❌ | ❌ | **✅** |
| **Встраиваемые виджеты** | Частично | ❌ | ❌ | ❌ | **✅** |
| **Показ ссылок по расписанию** | Платно | ❌ | ❌ | ❌ | **✅** |
| **Темы** | Платно | Ограничены | Только CSS | Файл конфигурации | **✅ Полноценная система токенов** |
| **QR-коды** | ✅ | ✅ | ❌ | ❌ | **✅ Настраиваемые** |
| **Собственный хостинг** | ❌ | ✅ | ✅ | ✅ | **✅** |
| **Загрузка страницы** | Хостинг у сервиса | PHP-приложение | Быстро (статика) | Быстро (статика) | **<300 мс, ноль JS** |

</div>

## 💬 Сообщество

<div align="center">

**Получайте помощь, показывайте свою страницу, голосуйте за то, что выйдет следующим.**

[![Discord](https://img.shields.io/discord/1559020936253022209?style=for-the-badge&logo=discord&logoColor=white&label=Join%20us%20on%20Discord&color=5865F2)](https://discord.gg/bAJMW3bAJa)

</div>

## ⚙️ Конфигурация

Вся конфигурация - через переменные окружения. **[`.env.example`](.env.example) - канонический справочник** - скопируйте его, и каждая переменная будет задокументирована прямо в файле, включая блоки кошельков.

| Переменная | По умолчанию | Описание |
|----------|---------|-------------|
| `PORT` | `3000` | Порт сервера |
| `DATABASE_PATH` | `./data/linkbreeze.db` | Путь к файлу базы данных SQLite |
| `BACKUP_DIR` | `./data/backups` | Каталог хранения резервных копий по расписанию (держите его внутри постоянного тома `./data`) |
| `BACKUP_MIN_FREE_MB` | `50` | Пропускать запись резервных копий, когда свободное место опускается ниже этого значения |
| `SECRET_KEY` | Генерируется автоматически | Ключ подписи HMAC для сессий |
| `EXTRA_SCRIPT_SRC` | _(пусто)_ | Разделённые пробелом домены аналитики для CSP (например, `plausible.io umami.is`) |
| `LINKBREEZE_PRIMARY_HOST` | _(пусто)_ | Основной хост, на котором работает админка; блокировка кастомных доменов возвращает 404 на всех остальных хостах (переменная окружения имеет приоритет над настройкой в админке) |
| `LINKBREEZE_TRUST_X_FORWARDED_HOST` | `false` | Доверять заголовку `X-Forwarded-Host` при маршрутизации доменов - включайте только за прокси, который ПЕРЕЗАПИСЫВАЕТ его (nginx, Caddy); стандартный заголовок `Host` подделать нельзя |

<details>
<summary>💳 &nbsp;Переменные кошельков (Google Wallet / Apple Wallet)</summary>

| Переменная | Описание |
|----------|-------------|
| `GOOGLE_WALLET_ISSUER_ID` | Числовой ID эмитента из Google Pay & Wallet Console. Включает кнопки «Добавить в Google Wallet» |
| `GOOGLE_WALLET_SERVICE_ACCOUNT_JSON` | JSON сервисного аккаунта (`client_email` + `private_key`) с правами на Wallet API |
| `APPLE_WALLET_CERT_PEM` | Сертификат подписи Pass Type ID (PEM). Включает кнопки «Добавить в Apple Wallet» |
| `APPLE_WALLET_KEY_PEM` | Приватный ключ, соответствующий сертификату подписи (PEM) |
| `APPLE_WALLET_KEY_PASSPHRASE` | Парольная фраза для ключа подписи, если он зашифрован |
| `APPLE_WALLET_WWDR_PEM` | Промежуточный сертификат Apple WWDR (PEM) |
| `APPLE_WALLET_TEAM_ID` | Ваш 10-символьный Apple Team ID |
| `APPLE_WALLET_PASS_TYPE_ID` | Ваш Pass Type ID (должен начинаться с `pass.`) |

Каждая публичная страница отображает блок «Поделиться» с кнопкой «Сохранить контакт» (универсальная vCard, всегда включена). Кнопки кошельков активируются автоматически, когда настроены указанные выше учётные данные. Google Wallet: аккаунт эмитента бесплатный, но проходы сохраняются только у внесённых в белый список тестовых пользователей, пока Google не откроет продакшен-доступ. Apple Wallet: требуется платный аккаунт Apple Developer, установка возможна только из Safari. Проходы - статические снимки: QR-код на проходе всегда открывает актуальную страницу. В разделе Настройки → Интеграция отображается статус учётных данных каждого кошелька и предупреждение, если срок действия сертификата подписи Apple скоро истечёт.

</details>

**Используете внешнюю аналитику?** Вставьте фрагмент провайдера в Настройки → Интеграция → Скрипт аналитики, затем добавьте домен провайдера в `EXTRA_SCRIPT_SRC`, чтобы CSP его пропускала (например, `EXTRA_SCRIPT_SRC=plausible.io umami.is`). После изменения пересоберите приложение - CSP зашивается в сборку.

Настройки во время работы (slug страницы, заголовок, SEO, тема) управляются через админ-панель и хранятся в базе данных - изменения кода не нужны.

## 🌐 Собственные домены

Направьте свои домены на страницы - один инстанс, множество идентичностей. Посетители попадают на `https://jane.com/` и сразу видят страницу Джейн, с автоматическими каноническими перенаправлениями, SEO-готовыми sitemap и строгой блокировкой хоста админки. Привязки активируются при первом реальном визите (DNS проверяется автоматически), а режим на уровне страницы определяет, является ли домен САМОЙ страницей (эксклюзивный) или хабом для всех slug.

Полная настройка - DNS, wildcard TLS и готовые конфигурации обратного прокси для Caddy, nginx и Traefik - в **[docs/custom-domains.md](docs/custom-domains.md)**.

## 🎨 Система тем

Из коробки доступны 11 пресетов: **Aurora** (анимированный флагман), **Glassmorphism**, **Neon Cyberpunk**, **Editorial Paper**, **Terminal Mono**, **Pastel Soft**, **Brutalist**, **Retro Sunset**, **Minimal Light**, **8-Bit Retro** и **Frutiger Aero**.

<details>
<summary>🎛️ &nbsp;Что настраивает кастомизатор</summary>

Движок тем - это система токенов на основе CSS custom properties (`--lb-*`): каждый цвет, радиус, тень и шрифт на публичной странице является токеном.

- **Фон** - 8 типов (сплошной, градиент, радиальный, mesh, aurora, анимированный градиент, изображение, паттерн) с настройками угла, оверлея и прозрачности
- **Цвета** - акцент, вторичный цвет, текст, приглушённый текст, фон карточки, рамка карточки (hex или rgba)
- **Типографика** - 15 отобранных шрифтов Google Fonts, масштаб шрифта, насыщенность, межбуквенный интервал - либо загрузите свои woff2/woff (максимум 2 МБ). Загруженные шрифты раздаются с того же домена, встраиваются в экспортируемые темы и сохраняются в резервных копиях
- **Стиль карточек** - 7 стилей ссылок (pill, rounded, sharp, glass, outline, neon, pixel), эффекты при наведении, размер кнопки, радиус углов, ширина рамки, сила тени
- **Компоновка** - ширина контейнера, выравнивание (по левому краю/по центру/по правому краю), плотность (компактная/обычная/свободная)
- **Эффекты** - свечение со своим цветом, стеклянное размытие, текстура шума, анимация появления
- **Дублирование / импорт / экспорт** - клонируйте любую тему как редактируемую копию и делитесь ею в формате JSON

</details>

## 📦 Экспорт в статический HTML

Скачайте любую страницу из переключателя страниц одним самостоятельным файлом `.html` - или все страницы в zip - и разместите где угодно, без работающего экземпляра LinkBreeze.

<details>
<summary>🌐 &nbsp;Где разместить экспортированную страницу</summary>

- **Получите файл** - значок загрузки в переключателе страниц экспортирует одну страницу; «Экспортировать все страницы в zip» упаковывает весь экземпляр. Добавьте `?embed=1` (`/api/pages/export?id=1&embed=1`), чтобы включить и папку `uploads/` для полностью автономной копии
- **Куда размещать** - GitHub Pages, Netlify, Cloudflare Pages или любой статический файловый сервер; `python3 -m http.server` подойдёт для быстрой локальной проверки
- **Что переносится** - ваша тема, пользовательские CSS и счётчики третьих сторон продолжают работать, и каждая ссылка ведёт прямо на назначение
- **Что остаётся дома** - встроенные счётчики просмотров и кликов и сбор почты требуют вашего экземпляра; без `?embed=1` изображения загружаются с вашего экземпляра по абсолютным URL - сохраняйте его доступность или экспортируйте с `?embed=1`
- **Размер** - страница на 50 ссылок экспортируется в ~107 КБ (~8 КБ в gzip), лимит 2 МиБ (25 МиБ с `?embed=1`)

</details>

## 📖 Документация и ссылки

[Внесение вклада](CONTRIBUTING.md) · [Политика безопасности](SECURITY.md) · [Список изменений](CHANGELOG.md) · [Устранение неполадок](TROUBLESHOOTING.md) · [Собственные домены](docs/custom-domains.md) · [Архитектурные решения](docs/adr/) · [Справочник по конфигурации](.env.example)

Исходники: [GitHub](https://github.com/OmniRise/LinkBreeze) (канонический репозиторий) · [GitLab](https://gitlab.com/omnirise00/linkbreeze) (публичное pull-зеркало, синхронизируется автоматически) · Образ: [`docker.io/omnirise/linkbreeze`](https://hub.docker.com/r/omnirise/linkbreeze)

Вопросы (issues) и пул-реквесты приветствуются на обеих платформах.

## 🤝 Внесение вклада

Любой вклад приветствуется! Рекомендации см. в [CONTRIBUTING.md](CONTRIBUTING.md).

## 📜 Лицензия

MIT - делайте что хотите. Подробности в [LICENSE](LICENSE).

## 🏢 О проекте

Разработано [Manak-hash](https://github.com/Manak-hash) · Проект [OmniRise](https://omnirise.dev).
