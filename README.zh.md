<div align="center">

<img src="public/Public-Page-iPhone-Dashboard-iMac.png" alt="Banner" width="100%" />

---

[English](README.md) · [العربية](README.ar.md) · **中文** · [Français](README.fr.md) · [Deutsch](README.de.md) · [Italiano](README.it.md) · [日本語](README.ja.md) · [Português (Brasil)](README.pt-BR.md) · [Русский](README.ru.md) · [Español](README.es.md) · [Türkçe](README.tr.md)

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

> **别再为 Linktree 每月付 15 美元了。** LinkBreeze 是一个免费、自托管的链接主页：快速、可自定义、内置统计分析。**一条命令即可安装。**

<div align="center">

&nbsp;[**🔗 在线演示**](https://linkbreeze-demo.omnirise.dev/linkbreeze)&nbsp;&nbsp;·&nbsp;&nbsp;
[**🔐 演示后台**](https://linkbreeze-demo.omnirise.dev/dashboard)

</div>

---

## ✨ 功能

<div align="center">
<table>
  <tr>
    <td width="50%" valign="top">🔗 <strong>多页面支持</strong><br/>无限页面，每个页面拥有独立的 slug、主题、链接和统计数据</td>
    <td valign="top">🎨 <strong>主题 + 自定义器</strong><br/>11 个预设，外加基于令牌的完整自定义器，支持导入/导出</td>
  </tr>
  <tr>
    <td valign="top">📊 <strong>隐私优先的统计分析</strong><br/>浏览量、点击量、来源、设备。不使用 Cookie，IP 哈希处理，自动清理</td>
    <td valign="top">🧭 <strong>迁移向导</strong><br/>从 Linktree、Bento、Hopp.bio、LittleLink 或任何 HTML/JSON 导出文件导入</td>
  </tr>
  <tr>
    <td valign="top">🔒 <strong>自托管</strong><br/>数据归你，服务器归你。无跟踪器，无广告，无订阅</td>
    <td valign="top">🐳 <strong>一条命令安装</strong><br/>一条 curl 命令。自动检测 Docker 或 Podman，即刻上线</td>
  </tr>
  <tr>
    <td valign="top">📱 <strong>内嵌小组件</strong><br/>在页面上嵌入 YouTube、Spotify、SoundCloud、Vimeo 和 Bandcamp</td>
    <td valign="top">🎯 <strong>QR 码</strong><br/>自动生成，自定义颜色，中心嵌入头像或 favicon，SVG/PNG 最高 1024px</td>
  </tr>
  <tr>
    <td width="50%" valign="top">🌐 <strong>自定义域名</strong><br/>将自有域名绑定到页面 - 访客直接访问 jane.com，无需 /slug</td>
    <td valign="top">⏰ <strong>定时备份</strong><br/>应用内每日/每周/每月备份，一键恢复，无需 cron</td>
  </tr>
</table>


⚡ **客户端零 JavaScript。300 毫秒内加载完成。纯服务端渲染 HTML。**

</div>

<details>
<summary>✨ &nbsp;全部功能</summary>

- **🔗 链接管理** - 拖拽添加、排序和自定义无限数量的链接
- **🌐 自动 Favicon 链接** - 链接自动显示目标网站的 favicon，无需上传图标
- **🖼️ 链接缩略图** - 为链接添加图片，生成可视化预览卡片
- **⏰ 链接定时** - 通过日期/时间控制，让链接自动上线或下线
- **🏷️ 自定义跳转别名** - 稳定、可分享的 `/go/your-name` 短链接，删除重建后依然有效
- **📈 第三方统计** - 粘贴一次即可接入 Plausible、Umami、Matomo 或 Google Analytics
- **📦 静态 HTML 导出** - 将任意页面下载为单个独立的 .html 文件，可托管在任何地方
- **🖼️ 社交预览（OG）图片** - 根据页面主题自动渲染分享卡片，也可上传自定义图片并控制适配、位置与缩放
- **✏️ 自定义 CSS** - 通过原生 CSS 注入精细调整你的页面
- **📧 邮件收集** - 在公共页面收集订阅者邮箱，导出为 CSV
- **🔔 更新通知** - 有新版本时仪表盘横幅会提醒你。不回传数据，不自动更新
- **🔑 快速管理面板** - 以上所有功能，尽在一个简洁、即时的仪表盘

- **🌐 自定义域名** - 将自有域名绑定到页面；独占或中心范围，自动 canonical 重定向，严格的管理后台主机锁定
- **⏰ 定时备份** - 应用内每日/每周/每月备份，带保留策略和一键恢复，无需 cron
</details>

## 🚀 快速开始

**一条命令。零配置。30 秒上线：**

```bash
curl -fsSL https://linkbreeze.omnirise.dev/install.sh | bash
```

脚本会自动检测 Docker 或 Podman，拉取镜像并启动容器。用 `sudo bash` 运行并在提示时回答 **y**，即可同时启用开机自启。

然后打开 **http://localhost:3000** - 安装向导不到 30 秒即可完成。

<details>
<summary>🔍 &nbsp;想在运行前先检查一下脚本？</summary>

```bash
curl -fsSL https://linkbreeze.omnirise.dev/install.sh -o install.sh
less install.sh
bash install.sh
```

</details>

**想换一种方式？** 展开下面任意一个。

<details>
<summary>🐳 &nbsp;Docker</summary>

不需要 Node.js、npm 或任何配置文件。多架构镜像：`linux/amd64` 与 `linux/arm64`（Raspberry Pi 3/4/5、Apple Silicon、ARM VPS）。

**Linux / macOS / Windows CMD：**

```bash
docker run -d --name linkbreeze --restart unless-stopped -p 3000:3000 -v linkbreeze-data:/app/data docker.io/omnirise/linkbreeze:latest
```

**Windows PowerShell** - 换行使用反引号：

```powershell
docker run -d `
  --name linkbreeze `
  --restart unless-stopped `
  -p 3000:3000 `
  -v linkbreeze-data:/app/data `
  docker.io/omnirise/linkbreeze:latest
```

> 数据库迁移会在容器启动时自动运行。

</details>

<details>
<summary>🧩 &nbsp;Docker Compose</summary>

创建 `docker-compose.yml`：

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

升级：`docker compose pull && docker compose up -d` · 日志：`docker compose logs -f linkbreeze`

想从源码构建？`git clone https://github.com/OmniRise/LinkBreeze.git && cd LinkBreeze && docker compose up -d --build`

</details>

<details>
<summary>☁️ &nbsp;Coolify</summary>

1. **+ New Resource** → **Docker Compose Empty**
2. 粘贴上一节中的 compose 文件
3. 设置域名（如 `links.yourdomain.com`）- Coolify 自动处理 Let's Encrypt
4. 点击 **Deploy**

</details>

<details>
<summary>📦 &nbsp;群晖 NAS</summary>

Container Manager（DSM 7.2+）：

1. 拉取镜像 `docker.io/omnirise/linkbreeze:latest`（如未找到，通过 **Image** → **Add** 拉取）
2. **创建**容器：名称 `linkbreeze`，端口 `3000 → 3000`，卷 `/docker/linkbreeze/data → /app/data`，重启策略 `Unless stopped`
3. 点击 **Done** - 在 `http://<nas-ip>:3000` 即可访问

镜像更新后数据仍保留在卷中。

</details>

<details>
<summary>🔧 &nbsp;Podman</summary>

```bash
podman run -d --name linkbreeze --restart unless-stopped -p 3000:3000 -v linkbreeze-data:/app/data docker.io/omnirise/linkbreeze:latest
```

卷出现权限错误？先运行 `podman volume create linkbreeze-data`。顶部的安装脚本会自动检测 Podman。

</details>

<details>
<summary>🖥️ &nbsp;Portainer</summary>

1. **Stacks** → **Add stack**，命名为 `linkbreeze`
2. 粘贴上方 Docker Compose 一节中的 compose 文件
3. 点击 **Deploy the stack**

更新：**Stacks** → `linkbreeze` → **Editor** → **Pull and redeploy**。

</details>

<details>
<summary>🔨 &nbsp;手动（不用 Docker）</summary>

需要 Node.js 18+。

```bash
git clone https://github.com/OmniRise/LinkBreeze.git
cd LinkBreeze
npm install
cp .env.example .env
# Edit .env to set your SECRET_KEY and DATABASE_PATH if needed
npm run db:migrate
npm run dev
```

生产环境：`npm run build && npm start`

</details>

<details>
<summary>🌍 &nbsp;在自己的域名上线</summary>

部署完成后，你的页面位于 `https://your-domain.com/your-slug`。

1. 将域名的 A 记录指向你的服务器 IP
2. 开放 3000 端口，或在前端放置反向代理
3. 完成

**现成的 compose 文件**位于 [`examples/`](examples/) - 每个场景一个独立文件：

| 需求 | 使用这个文件 |
|---------------|---------------|
| 自动 TLS，无需手动配置 | `docker-compose.caddy.yml` 或 `docker-compose.https-portal.yml` |
| 自动 TLS 并带有控制面板（Traefik） | `docker-compose.traefik.yml` |
| 不开放端口（零信任） | `docker-compose.cloudflare-tunnel.yml` |
| 已在用 Nginx + Certbot | `docker-compose.nginx.yml` |
| 从界面进行定时备份（无需 sidecar） | 内置 - 在设置的数据页开启 |
| 定时 SQLite 备份（原始转储 sidecar，S3 异地存储） | `docker-compose.with-backup.yml` |
| 在 Kubernetes 上运行 | `kubernetes.yaml` |

**Caddy**（推荐 - 自动 HTTPS）：

```
links.example.com {
    reverse_proxy localhost:3000
}
```

**Nginx：**

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

**Cloudflare Tunnel**（无需开放端口，无需购买域名）：

```bash
cloudflared tunnel --url http://localhost:3000
```

</details>

## 📸 截图

<details>
    <summary>点击展开</summary>
    <br/>

<table>
    <tr>
    <td>公共页面</td>
    <td>管理仪表盘</td>
    </tr>
    <tr>
    <td><img src="public/screenshots/Public-Page(Aurora).jpeg" alt="公共页面 [Aurora 主题]" /></td>
    <td><img src="public/screenshots/Admin-Dashboard.jpeg" alt="管理仪表盘" /></td>
    </tr>
    <tr>
    <td>链接</td>
    <td>资料</td>
    </tr>
    <tr>
    <td><img src="public/screenshots/Links.jpeg" alt="链接页面" /></td>
    <td><img src="public/screenshots/Profile.jpeg" alt="资料页面" /></td>
    </tr>
    <tr>
    <td>主题</td>
    <td>实时预览面板</td>
    </tr>
    <tr>
    <td><img src="public/screenshots/Theme.jpeg" alt="主题页面" /></td>
    <td><img src="public/screenshots/Preview.jpeg" alt="实时预览面板" /></td>
    </tr>
    <tr>
    <td>设置 [常规]</td>
    <td>设置 [外观]</td>
    </tr>
    <tr>
    <td><img src="public/screenshots/Settings(General).jpeg" alt="设置页面 [常规标签]" /></td>
    <td><img src="public/screenshots/Settings(Appearance).jpeg" alt="设置页面 [外观标签]" /></td>
    <tr>
    <td>设置 [安全]</td>
    <td>设置 [数据]</td>
    </tr>
    <tr>
    <td><img src="public/screenshots/Settings(Security).jpeg" alt="设置页面 [安全标签]" /></td>
    <td><img src="public/screenshots/Settings(Data).jpeg" alt="设置页面 [数据标签]" /></td>
    </tr>
</table>

</details>

## 🆚 对比

<div align="center">

| 功能 | Linktree | LinkStack | LittleLink | Shako | **LinkBreeze** |
|---------|----------|-----------|------------|-------|----------------|
| **价格** | 免费 - $35/月 | 免费 | 免费 | 免费 | **免费** |
| **管理后台** | ✅ | ✅ | ❌ | ❌ | **✅ 快** |
| **多页面** | ❌ | ❌ | ❌ | ❌ | **✅ 无限** |
| **自动 Favicon 链接** | ❌ | ❌ | ❌ | ❌ | **✅** |
| **迁移向导** | ❌ | ❌ | ❌ | ❌ | **✅** |
| **内置统计** | 基础版，完整版收费 | 基础 | ❌ | ❌ | **✅ 完整且私密** |
| **邮件收集** | 付费 | ❌ | ❌ | ❌ | **✅** |
| **内嵌小组件** | 部分 | ❌ | ❌ | ❌ | **✅** |
| **链接定时** | 付费 | ❌ | ❌ | ❌ | **✅** |
| **主题** | 付费 | 有限 | 仅 CSS | 配置文件 | **✅ 完整令牌系统** |
| **QR 码** | ✅ | ✅ | ❌ | ❌ | **✅ 可自定义** |
| **自托管** | ❌ | ✅ | ✅ | ✅ | **✅** |
| **页面加载** | 托管 | PHP 应用 | 快（静态） | 快（静态） | **<300 毫秒，零 JS** |

</div>

## 💬 社区

<div align="center">

**获取帮助，展示你的页面，为下一个功能投票。**

[![Discord](https://img.shields.io/discord/1559020936253022209?style=for-the-badge&logo=discord&logoColor=white&label=%E5%8A%A0%E5%85%A5%E6%88%91%E4%BB%AC%E7%9A%84%20Discord&color=5865F2)](https://discord.gg/bAJMW3bAJa)

</div>

## ⚙️ 配置

所有配置均通过环境变量完成。**[`.env.example`](.env.example) 是权威参考** - 复制它，每个变量都有内联说明，包括钱包区块。

| 变量 | 默认值 | 说明 |
|----------|---------|-------------|
| `PORT` | `3000` | 服务器端口 |
| `DATABASE_PATH` | `./data/linkbreeze.db` | SQLite 数据库文件路径 |
| `BACKUP_DIR` | `./data/backups` | 定时备份的存储目录（保留在持久化的 `./data` 卷内） |
| `BACKUP_MIN_FREE_MB` | `50` | 剩余空间低于该值时跳过写入备份 |
| `SECRET_KEY` | 自动生成 | 用于会话的 HMAC 签名密钥 |
| `EXTRA_SCRIPT_SRC` | _(空)_ | CSP 允许的统计域名，空格分隔（如 `plausible.io umami.is`） |
| `LINKBREEZE_PRIMARY_HOST` | _（空）_ | 管理后台所在的主机；自定义域名的主机锁定会对其他所有主机返回 404（环境变量优先于后台设置） |
| `LINKBREEZE_TRUST_X_FORWARDED_HOST` | `false` | 让域名路由信任 `X-Forwarded-Host` - 仅在代理会覆写该请求头时启用（nginx、Caddy）；默认的 `Host` 请求头无法被伪造 |

<details>
<summary>💳 &nbsp;钱包通行证变量（Google Wallet / Apple Wallet）</summary>

| 变量 | 说明 |
|----------|-------------|
| `GOOGLE_WALLET_ISSUER_ID` | 来自 Google Pay & Wallet Console 的数字发卡机构 ID。启用"添加到 Google Wallet"按钮 |
| `GOOGLE_WALLET_SERVICE_ACCOUNT_JSON` | 已获 Wallet API 授权的服务账号 JSON（`client_email` + `private_key`） |
| `APPLE_WALLET_CERT_PEM` | Pass Type ID 签名证书（PEM）。启用"添加到 Apple Wallet"按钮 |
| `APPLE_WALLET_KEY_PEM` | 与签名证书匹配的私钥（PEM） |
| `APPLE_WALLET_KEY_PASSPHRASE` | 签名密钥的密码（如已加密） |
| `APPLE_WALLET_WWDR_PEM` | Apple WWDR 中间证书（PEM） |
| `APPLE_WALLET_TEAM_ID` | 你的 10 位 Apple Team ID |
| `APPLE_WALLET_PASS_TYPE_ID` | 你的 Pass Type ID（必须以 `pass.` 开头） |

每个公开页面都会渲染一个分享区块，其中包含"保存联系人"按钮（通用 vCard，始终启用）。配置好上述凭据后，钱包按钮会自动点亮。Google Wallet：发卡机构账号免费，但在 Google 授予生产环境访问权限之前，通行证仅对白名单内的测试用户可保存。Apple Wallet：需要付费的 Apple 开发者账号，且仅支持从 Safari 安装。通行证是静态快照 - 通行证上的二维码始终打开实时页面。设置 → 集成 会显示每个钱包的凭据状态，并在 Apple 签名证书即将过期时发出警告。

</details>

**使用第三方统计？** 把服务商的代码片段粘贴到 设置 → 集成 → 统计脚本，然后将服务商域名加入 `EXTRA_SCRIPT_SRC`，让 CSP 允许加载（例如 `EXTRA_SCRIPT_SRC=plausible.io umami.is`）。修改后需要重新构建 - CSP 在构建时固化。

运行时设置（页面 slug、标题、SEO、主题）通过管理后台管理并存储在数据库中 - 无需修改代码。

## 🌐 自定义域名

将自有域名指向页面 - 一个实例，多个身份。访客打开 `https://jane.com/` 即可直接看到 Jane 的页面，并配有自动 canonical 重定向、利于 SEO 的站点地图和严格的管理后台主机锁定。绑定会在首次真实访问时激活（DNS 自验证），页面范围决定域名是该页面本身（独占）还是所有 slug 的中心。

完整设置 - DNS、泛域名 TLS 以及 Caddy、nginx、Traefik 的即拷即用反向代理配置 - 见 **[docs/custom-domains.md](docs/custom-domains.md)**。

## 🎨 主题系统

开箱即用包含 11 个预设：**Aurora**（动画旗舰）、**Glassmorphism**、**Neon Cyberpunk**、**Editorial Paper**、**Terminal Mono**、**Pastel Soft**、**Brutalist**、**Retro Sunset**、**Minimal Light**、**8-Bit Retro** 和 **Frutiger Aero**。

<details>
<summary>🎛️ &nbsp;自定义器可以控制什么</summary>

主题引擎是一个基于 CSS 自定义属性（`--lb-*`）的令牌系统 - 公共页面上的每种颜色、圆角、阴影和字体都是一个令牌。

- **背景** - 8 种类型（纯色、渐变、径向、网格、极光、动画渐变、图片、图案），支持角度、遮罩和不透明度控制
- **颜色** - 强调色、辅助色、文字、弱化文字、卡片背景、卡片边框（hex 或 rgba）
- **排版** - 15 款精选 Google 字体、字号缩放、字重、字间距 - 也可上传自己的 woff2/woff（最大 2 MB）。上传的字体同源提供、嵌入主题导出文件、随备份保留
- **卡片样式** - 7 种链接样式（胶囊、圆角、直角、玻璃、描边、霓虹、像素）、悬停效果、按钮大小、圆角半径、边框宽度、阴影强度
- **布局** - 容器宽度、对齐（左/中/右）、密度（紧凑/标准/宽松）
- **特效** - 自定义颜色的发光、玻璃模糊、噪点纹理、入场动画
- **复制 / 导入 / 导出** - 将任何主题克隆为可编辑的副本，并以 JSON 分享

</details>

## 📦 静态导出

在页面切换器中将任意页面下载为单个独立的 `.html` 文件 - 或将所有页面打包为 zip - 托管在任何地方，无需运行 LinkBreeze 实例。

<details>
<summary>🌐 &nbsp;在任何地方托管导出的页面</summary>

- **获取文件** - 页面切换器的下载图标导出单个页面；"将所有页面导出为 zip" 打包整个实例。加上 `?embed=1`（`/api/pages/export?id=1&embed=1`）可一并包含 `uploads/` 文件夹，得到完全离线的副本
- **托管位置** - GitHub Pages、Netlify、Cloudflare Pages 或任意静态文件服务器；`python3 -m http.server` 可用于本地快速检查
- **随行内容** - 你的主题、自定义 CSS 和第三方统计代码照常工作，每个链接都直接指向目标地址
- **留在本机的部分** - 内置的浏览/点击统计和邮件收集需要你的实例；不加 `?embed=1` 时，图片通过绝对 URL 从你的实例加载，请保持其可访问，或使用 `?embed=1` 导出
- **体积** - 50 个链接的页面导出约 107 KB 原始大小（gzip 后约 8 KB），单页文件上限 2 MiB，zip 包上限 25 MiB（全部页面或 `?embed=1`）

</details>

## 📖 文档与链接

[贡献指南](CONTRIBUTING.md) · [安全策略](SECURITY.md) · [更新日志](CHANGELOG.md) · [故障排查](TROUBLESHOOTING.md) · [Custom Domains](docs/custom-domains.md) · [架构决策](docs/adr/) · [配置参考](.env.example)

源码：[GitHub](https://github.com/OmniRise/LinkBreeze)（权威源） · [GitLab](https://gitlab.com/omnirise00/linkbreeze)（公开拉取镜像，自动同步） · 镜像：[`docker.io/omnirise/linkbreeze`](https://hub.docker.com/r/omnirise/linkbreeze)

欢迎在任一平台提交 Issue 和 PR。

## 🤝 贡献

欢迎贡献！请查看 [CONTRIBUTING.md](CONTRIBUTING.md) 了解指南。

## 📜 许可证

MIT - 随便用。详见 [LICENSE](LICENSE)。

## 🏢 关于

由 [Manak-hash](https://github.com/Manak-hash) 开发 · 一个 [OmniRise](https://omnirise.dev) 项目。
