<div align="center">

<img src="public/Public-Page-iPhone-Dashboard-iMac.png" alt="バナー" width="100%" />

---

[English](README.md) · [العربية](README.ar.md) · [中文](README.zh.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Italiano](README.it.md) · **日本語** · [Português (Brasil)](README.pt-BR.md) · [Русский](README.ru.md) · [Español](README.es.md) · [Türkçe](README.tr.md)

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

> **Linktreeに月額$15を払うのはもうやめましょう。** LinkBreezeは無料のセルフホスト型リンクハブです。高速、カスタマイズ自由、アナリティクス内蔵。**コマンド1つでインストールできます。**

<div align="center">

&nbsp;[**🔗 ライブデモ**](https://linkbreeze-demo.omnirise.dev/linkbreeze)&nbsp;&nbsp;·&nbsp;&nbsp;
[**🔐 デモダッシュボード**](https://linkbreeze-demo.omnirise.dev/dashboard)

</div>

---

## ✨ 機能

<div align="center">
<table>
  <tr>
    <td width="50%" valign="top">🔗 <strong>マルチページ対応</strong><br/>ページ数は無制限。ページごとにスラッグ、テーマ、リンク、アナリティクスを個別に設定</td>
    <td valign="top">🎨 <strong>テーマ + カスタマイザー</strong><br/>11種類のプリセットに加え、トークンベースの本格カスタマイザー(インポート/エクスポート対応)</td>
  </tr>
  <tr>
    <td valign="top">📊 <strong>プライバシー重視のアナリティクス</strong><br/>閲覧数、クリック数、リファラー、デバイスを計測。Cookie不使用、IPはハッシュ化、自動削除</td>
    <td valign="top">🧭 <strong>移行ウィザード</strong><br/>Linktree、Bento、Hopp.bio、LittleLinkまたは任意のHTML/JSONエクスポートからインポート</td>
  </tr>
  <tr>
    <td valign="top">🔒 <strong>セルフホスト</strong><br/>データもサーバーも自分のものに。トラッカーなし、広告なし、サブスクリプションなし</td>
    <td valign="top">🐳 <strong>ワンコマンドインストール</strong><br/>curlコマンド1つ。DockerかPodmanを自動判定してすぐに公開</td>
  </tr>
  <tr>
    <td valign="top">📱 <strong>埋め込みウィジェット</strong><br/>YouTube、Spotify、SoundCloud、Vimeo、Bandcampをページに埋め込み</td>
    <td valign="top">🎯 <strong>QRコード</strong><br/>自動生成、色のカスタマイズ、中央にアバターまたはファビコン、SVG/PNGで最大1024px</td>
  </tr>
  <tr>
    <td width="50%" valign="top">🌐 <strong>カスタムドメイン</strong><br/>自分のドメインをページに紐付け - 訪問者はjane.comに直接到着、/slugは不要</td>
    <td valign="top">⏰ <strong>定期バックアップ</strong><br/>日次/週次/月次のアプリ内バックアップ。ワンクリック復元、cron不要</td>
  </tr>
</table>


⚡ **クライアントサイドJavaScriptはゼロ。300ms未満で読み込み完了。純粋なサーバーレンダリングHTML。**

</div>

<details>
<summary>✨ &nbsp;全機能</summary>

- **🔗 リンク管理** - 無制限のリンクをドラッグ&ドロップで追加、並べ替え、カスタマイズ
- **🌐 自動ファビコンリンク** - リンク先サイトのファビコンを自動表示。アイコンのアップロードは不要
- **🖼️ リンクサムネイル** - リンクに画像を追加して視覚的なプレビューカードに
- **⏰ リンクの公開予約** - 日時指定でリンクの表示/非表示を自動切り替え
- **🏷️ カスタムリダイレクトスラッグ** - 削除して再作成してもリンク切れにならない、安定した共有向け`/go/your-name`ショートリンク
- **📈 外部アナリティクス** - Plausible、Umami、Matomo、Google Analyticsを貼り付け1つで注入
- **🖼️ ソーシャルプレビュー(OG)画像** - ページのテーマから自動レンダリングされるシェアカード。フィット、位置、ズームを制御してオリジナル画像をアップロードすることも可能
- **✏️ カスタムCSS** - 生CSSの注入でページを微調整
- **📧 メールアドレス収集** - 公開ページで購読者のメールアドレスを収集、CSVエクスポート対応
- **🔔 アップデート通知** - 新バージョンがあるとダッシュボードにバナーを表示。外部への通信なし、自動更新なし
- **🔑 高速な管理パネル** - 上記のすべてを1つのクリーンで即時応答のダッシュボードから操作

- **🌐 カスタムドメイン** - 自分のドメインをページに紐付け。排他/ハブのスコープ選択、正規リダイレクトの自動化、厳格な管理ホストロック
- **⏰ 定期バックアップ** - 保持期間管理とワンクリック復元付きの日次/週次/月次アプリ内バックアップ。cron不要
</details>

## 🚀 クイックスタート

**コマンド1つ。設定ゼロ。30秒で公開:**

```bash
curl -fsSL https://linkbreeze.omnirise.dev/install.sh | bash
```

スクリプトがDockerかPodmanを自動判定し、イメージを取得してコンテナを起動します。`sudo bash`で実行して**y**と答えると、起動時の自動起動も有効になります。

次に **http://localhost:3000** を開きます - セットアップウィザードは30秒かかりません。

<details>
<summary>🔍 &nbsp;実行前にスクリプトの中身を確認したい方へ</summary>

```bash
curl -fsSL https://linkbreeze.omnirise.dev/install.sh -o install.sh
less install.sh
bash install.sh
```

</details>

**別の方法がお好みですか?** 下から展開してください。

<details>
<summary>🐳 &nbsp;Docker</summary>

Node.jsもnpmも設定ファイルも不要。マルチアーキイメージ:`linux/amd64`と`linux/arm64`(Raspberry Pi 3/4/5、Apple Silicon、ARM VPS)。

**Linux / macOS / Windows CMD:**

```bash
docker run -d --name linkbreeze --restart unless-stopped -p 3000:3000 -v linkbreeze-data:/app/data docker.io/omnirise/linkbreeze:latest
```

**Windows PowerShell** - 改行にはバッククォートを使用:

```powershell
docker run -d `
  --name linkbreeze `
  --restart unless-stopped `
  -p 3000:3000 `
  -v linkbreeze-data:/app/data `
  docker.io/omnirise/linkbreeze:latest
```

> データベースのマイグレーションはコンテナ起動時に自動で実行されます。

</details>

<details>
<summary>🧩 &nbsp;Docker Compose</summary>

`docker-compose.yml`を作成します:

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

アップグレード:`docker compose pull && docker compose up -d` · ログ:`docker compose logs -f linkbreeze`

ソースからビルドしたい場合:`git clone https://github.com/OmniRise/LinkBreeze.git && cd LinkBreeze && docker compose up -d --build`

</details>

<details>
<summary>☁️ &nbsp;Coolify</summary>

1. **+ New Resource** → **Docker Compose Empty**
2. 上のセクションのcomposeファイルを貼り付け
3. ドメインを設定(例:`links.yourdomain.com`) - Let's EncryptはCoolifyが自動処理します
4. **Deploy**をクリック

</details>

<details>
<summary>📦 &nbsp;Synology NAS</summary>

Container Manager(DSM 7.2以降):

1. イメージ`docker.io/omnirise/linkbreeze:latest`をプル(見つからない場合は**イメージ** → **追加**)
2. コンテナを**作成**:名前`linkbreeze`、ポート`3000 → 3000`、ボリューム`/docker/linkbreeze/data → /app/data`、再起動ポリシー`Unless stopped`
3. **完了**をクリック - `http://<nas-ip>:3000`で公開されます

データはボリュームに保存され、イメージ更新後も維持されます。

</details>

<details>
<summary>🔧 &nbsp;Podman</summary>

```bash
podman run -d --name linkbreeze --restart unless-stopped -p 3000:3000 -v linkbreeze-data:/app/data docker.io/omnirise/linkbreeze:latest
```

ボリュームで権限エラーが出ますか?先に`podman volume create linkbreeze-data`を実行してください。冒頭のインストールスクリプトはPodmanを自動判定します。

</details>

<details>
<summary>🖥️ &nbsp;Portainer</summary>

1. **Stacks** → **Add stack**で`linkbreeze`という名前を作成
2. 上のDocker Composeセクションのcomposeファイルを貼り付け
3. **Deploy the stack**をクリック

アップデート:**Stacks** → `linkbreeze` → **Editor** → **Pull and redeploy**。

</details>

<details>
<summary>🔨 &nbsp;手動インストール(Dockerなし)</summary>

Node.js 18以降が必要です。

```bash
git clone https://github.com/OmniRise/LinkBreeze.git
cd LinkBreeze
npm install
cp .env.example .env
# Edit .env to set your SECRET_KEY and DATABASE_PATH if needed
npm run db:migrate
npm run dev
```

本番環境:`npm run build && npm start`

</details>

<details>
<summary>🌍 &nbsp;独自ドメインで公開する</summary>

デプロイが完了すると、ページは`https://your-domain.com/your-slug`で公開されます。

1. ドメインのAレコードをサーバーのIPに向ける
2. ポート3000を公開するか、手前にリバースプロキシを置く
3. 完了

**すぐ使えるcomposeファイル**は[`examples/`](examples/)にあります - シナリオごとに1つの自己完結ファイル:

| 目的 | 使用するファイル |
|---------------|---------------|
| TLS自動設定、手動設定不要 | `docker-compose.caddy.yml`または`docker-compose.https-portal.yml` |
| ダッシュボード付きでTLS自動設定(Traefik) | `docker-compose.traefik.yml` |
| ポート非公開(ゼロトラスト) | `docker-compose.cloudflare-tunnel.yml` |
| Nginx + Certbotを既に使用している | `docker-compose.nginx.yml` |
| UIからの定期バックアップ(サイドカー不要) | 内蔵 - 設定 → データで有効化 |
| SQLiteの定期バックアップ(ダンプ用サイドカー、S3オフサイト) | `docker-compose.with-backup.yml` |
| Kubernetesで実行 | `kubernetes.yaml` |

**Caddy**(推奨 - 自動HTTPS):

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

**Cloudflare Tunnel**(ポート非公開、ドメイン購入不要):

```bash
cloudflared tunnel --url http://localhost:3000
```

</details>

## 📸 スクリーンショット

<details>
    <summary>クリックで展開</summary>
    <br/>

<table>
    <tr>
    <td>公開ページ</td>
    <td>管理ダッシュボード</td>
    </tr>
    <tr>
    <td><img src="public/screenshots/Public-Page(Aurora).jpeg" alt="公開ページ [Auroraテーマ]" /></td>
    <td><img src="public/screenshots/Admin-Dashboard.jpeg" alt="管理ダッシュボード" /></td>
    </tr>
    <tr>
    <td>リンク</td>
    <td>プロフィール</td>
    </tr>
    <tr>
    <td><img src="public/screenshots/Links.jpeg" alt="リンクページ" /></td>
    <td><img src="public/screenshots/Profile.jpeg" alt="プロフィールページ" /></td>
    </tr>
    <tr>
    <td>テーマ</td>
    <td>ライブプレビュー</td>
    </tr>
    <tr>
    <td><img src="public/screenshots/Theme.jpeg" alt="テーマページ" /></td>
    <td><img src="public/screenshots/Preview.jpeg" alt="ライブプレビュー" /></td>
    </tr>
    <tr>
    <td>設定 [一般]</td>
    <td>設定 [外観]</td>
    </tr>
    <tr>
    <td><img src="public/screenshots/Settings(General).jpeg" alt="設定ページ [一般タブ]" /></td>
    <td><img src="public/screenshots/Settings(Appearance).jpeg" alt="設定ページ [外観タブ]" /></td>
    <tr>
    <td>設定 [セキュリティ]</td>
    <td>設定 [データ]</td>
    </tr>
    <tr>
    <td><img src="public/screenshots/Settings(Security).jpeg" alt="設定ページ [セキュリティタブ]" /></td>
    <td><img src="public/screenshots/Settings(Data).jpeg" alt="設定ページ [データタブ]" /></td>
    </tr>
</table>

</details>

## 🆚 比較

<div align="center">

| 機能 | Linktree | LinkStack | LittleLink | Shako | **LinkBreeze** |
|---------|----------|-----------|------------|-------|----------------|
| **価格** | 無料 - 月額$35 | 無料 | 無料 | 無料 | **無料** |
| **管理パネル** | ✅ | ✅ | ❌ | ❌ | **✅ 高速** |
| **マルチページ** | ❌ | ❌ | ❌ | ❌ | **✅ 無制限** |
| **自動ファビコンリンク** | ❌ | ❌ | ❌ | ❌ | **✅** |
| **移行ウィザード** | ❌ | ❌ | ❌ | ❌ | **✅** |
| **内蔵アナリティクス** | 基本のみ、フル機能は有料 | 基本のみ | ❌ | ❌ | **✅ フル機能&プライバシー対応** |
| **メールアドレス収集** | 有料 | ❌ | ❌ | ❌ | **✅** |
| **埋め込みウィジェット** | 一部対応 | ❌ | ❌ | ❌ | **✅** |
| **リンクの公開予約** | 有料 | ❌ | ❌ | ❌ | **✅** |
| **テーマ** | 有料 | 限定 | CSSのみ | 設定ファイル | **✅ フルトークンシステム** |
| **QRコード** | ✅ | ✅ | ❌ | ❌ | **✅ カスタマイズ可能** |
| **セルフホスト** | ❌ | ✅ | ✅ | ✅ | **✅** |
| **ページ読み込み** | ホスティング型 | PHPアプリ | 高速(静的) | 高速(静的) | **300ms未満、JSゼロ** |

</div>

## 💬 コミュニティ

<div align="center">

**質問、ページの自慢、次に開発する機能への投票はこちらから。**

[![Discord](https://img.shields.io/discord/1559020936253022209?style=for-the-badge&logo=discord&logoColor=white&label=Join%20us%20on%20Discord&color=5865F2)](https://discord.gg/bAJMW3bAJa)

</div>

## ⚙️ 設定

すべての設定は環境変数で行います。**[`.env.example`](.env.example)が正式なリファレンスです** - コピーすれば、ウォレット関連のブロックを含む全変数の説明がインラインで書かれています。

| 変数 | デフォルト | 説明 |
|----------|---------|-------------|
| `PORT` | `3000` | サーバーポート |
| `DATABASE_PATH` | `./data/linkbreeze.db` | SQLiteデータベースファイルのパス |
| `BACKUP_DIR` | `./data/backups` | 定期バックアップの保存ディレクトリ(永続化した`./data`ボリューム内に置いてください) |
| `BACKUP_MIN_FREE_MB` | `50` | 空き容量がこの値を下回るとバックアップの書き込みをスキップ |
| `SECRET_KEY` | 自動生成 | セッション用のHMAC署名キー |
| `EXTRA_SCRIPT_SRC` | _(空)_ | CSP用のアナリティクスドメイン(空白区切り、例:`plausible.io umami.is`) |
| `LINKBREEZE_PRIMARY_HOST` | _(空)_ | 管理画面をホストするプライマリホスト。カスタムドメインの管理ロックが他のすべてのホストに404を返します(環境変数は管理画面の設定より優先) |
| `LINKBREEZE_TRUST_X_FORWARDED_HOST` | `false` | ドメインルーティングで`X-Forwarded-Host`を信頼 - このヘッダーを上書きするプロキシ(nginx、Caddy)の背後でのみ有効化してください。デフォルトの`Host`ヘッダーは偽装できません |
| `OIDC_CLIENT_SECRET` | _(空)_ | OIDC シングルサインオン用のクライアントシークレット（#124 マルチユーザー）。Issuer、クライアント ID、JIT プロビジョニング、サインイン方式は設定 → セキュリティで構成します。シークレットは環境変数のみ - 設定はバックアップにそのまま出力されます |
| `LINKBREEZE_ALLOW_HTTP_ISSUER` | `false` | テスト用例外：信頼した LAN 内の http OIDC issuer を許可（本番は https 必須） |

<details>
<summary>💳 &nbsp;ウォレットパス変数(Google Wallet / Apple Wallet)</summary>

| 変数 | 説明 |
|----------|-------------|
| `GOOGLE_WALLET_ISSUER_ID` | Google Pay & Wallet Consoleの発行者ID(数値)。「Google Walletに追加」ボタンが有効になります |
| `GOOGLE_WALLET_SERVICE_ACCOUNT_JSON` | Wallet APIの利用を許可されたサービスアカウントJSON(`client_email` + `private_key`) |
| `APPLE_WALLET_CERT_PEM` | Pass Type IDの署名証明書(PEM)。「Apple Walletに追加」ボタンが有効になります |
| `APPLE_WALLET_KEY_PEM` | 署名証明書に対応する秘密鍵(PEM) |
| `APPLE_WALLET_KEY_PASSPHRASE` | 署名鍵が暗号化されている場合のパスフレーズ |
| `APPLE_WALLET_WWDR_PEM` | Apple WWDR中間証明書(PEM) |
| `APPLE_WALLET_TEAM_ID` | 10文字のApple Team ID |
| `APPLE_WALLET_PASS_TYPE_ID` | Pass Type ID(`pass.`で始まる必要があります) |

すべての公開ページには「連絡先を保存」ボタン付きのシェアブロックが表示されます(汎用vCard、常に有効)。上記の認証情報を設定すると、ウォレットボタンが自動的に有効になります。Google Wallet:発行者アカウントは無料ですが、Googleが本番アクセスを許可するまで、パスを保存できるのはホワイトリスト登録済みのテストユーザーだけです。Apple Wallet:有料のApple Developerアカウントが必要で、Safariからのみインストールできます。パスは静的なスナップショットです - パス上のQRコードは常に最新のページを開きます。設定 → 統合でウォレットごとの認証情報の状態を確認でき、Appleの署名証明書の有効期限が近づくと警告が表示されます。

</details>

**外部アナリティクスを利用する場合?** プロバイダーのスニペットを設定 → 統合 → アナリティクススクリプトに貼り付け、CSPで許可されるようプロバイダーのドメインを`EXTRA_SCRIPT_SRC`に追加します(例:`EXTRA_SCRIPT_SRC=plausible.io umami.is`)。変更後は再ビルドが必要です - CSPはビルド時に組み込まれます。

ランタイム設定(ページのスラッグ、タイトル、SEO、テーマ)は管理ダッシュボードから管理され、データベースに保存されます - コードの変更は不要です。

## 🌐 カスタムドメイン

自分のドメインをページに紐付けましょう - 1つのインスタンスで複数のアイデンティティを持てます。訪問者は`https://jane.com/`にアクセスするだけでJaneのページを直接見られ、正規リダイレクトの自動化、SEO対応のサイトマップ、厳格な管理ホストロックを備えています。バインディングは最初の実アクセスで有効化され(セルフ検証DNS)、ページごとのスコープで、そのドメインがページそのものになるか(排他)、全スラッグのハブになるかを決めます。

DNS、ワイルドカードTLS、Caddy・nginx・Traefik向けのコピペリバースプロキシ設定まで、セットアップの詳細は**[docs/custom-domains.md](docs/custom-domains.md)**をご覧ください。

## 🎨 テーマシステム

プリセット11種類を標準搭載:**Aurora**(アニメーションする旗艦テーマ)、**Glassmorphism**、**Neon Cyberpunk**、**Editorial Paper**、**Terminal Mono**、**Pastel Soft**、**Brutalist**、**Retro Sunset**、**Minimal Light**、**8-Bit Retro**、**Frutiger Aero**。

<details>
<summary>🎛️ &nbsp;カスタマイザーで設定できる項目</summary>

テーマエンジンはCSSカスタムプロパティ(`--lb-*`)のトークンシステムです - 公開ページ上のすべての色、角丸、シャドウ、フォントがトークンになっています。

- **背景** - 8種類(単色、グラデーション、放射状、メッシュ、オーロラ、アニメーショングラデーション、画像、パターン)。角度、オーバーレイ、不透明度を調整できます
- **色** - アクセント、セカンダリ、テキスト、控えめテキスト、カード背景、カード枠線(hexまたはrgba)
- **タイポグラフィ** - 厳選した15種類のGoogle Fonts、フォントスケール、ウェイト、字間。または自分のwoff2/woffをアップロード(最大2 MB)。アップロードしたフォントは同一オリジンで配信され、テーマのエクスポートに埋め込まれ、バックアップにも引き継がれます
- **カードスタイル** - 7種類のリンクスタイル(ピル、角丸、シャープ、グラス、アウトライン、ネオン、ピクセル)、ホバーエフェクト、ボタンサイズ、角丸、枠線の太さ、シャドウの強さ
- **レイアウト** - コンテナ幅、配置(左/中央/右)、密度(コンパクト/標準/ゆったり)
- **エフェクト** - 色を指定できるグロー、ガラスぼかし、ノイズテクスチャ、リビールアニメーション
- **複製 / インポート / エクスポート** - どのテーマも編集可能なコピーとして複製でき、JSONとして共有できます

</details>

## 📖 ドキュメントとリンク

[コントリビューション](CONTRIBUTING.md) · [セキュリティポリシー](SECURITY.md) · [変更履歴](CHANGELOG.md) · [トラブルシューティング](TROUBLESHOOTING.md) · [カスタムドメイン](docs/custom-domains.md) · [アーキテクチャ決定記録](docs/adr/) · [設定リファレンス](.env.example)

ソース:[GitHub](https://github.com/OmniRise/LinkBreeze)(正規)· [GitLab](https://gitlab.com/omnirise00/linkbreeze)(公開プルミラー、自動同期)· イメージ:[`docker.io/omnirise/linkbreeze`](https://hub.docker.com/r/omnirise/linkbreeze)

IssueとPRはどちらのフォージでも歓迎します。

## 🤝 コントリビューション

貢献は大歓迎です!ガイドラインは[CONTRIBUTING.md](CONTRIBUTING.md)をご覧ください。

## 📜 ライセンス

MIT - ご自由にお使いください。詳細は[LICENSE](LICENSE)をご覧ください。

## 🏢 このプロジェクトについて

[Manak-hash](https://github.com/Manak-hash)による開発 · [OmniRise](https://omnirise.dev)のプロジェクト。
