<div align="center">

<img src="public/Public-Page-iPhone-Dashboard-iMac.png" alt="Banner" width="100%" />

---

[English](README.md) · [العربية](README.ar.md) · [中文](README.zh.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Italiano](README.it.md) · [日本語](README.ja.md) · **Português (Brasil)** · [Русский](README.ru.md) · [Español](README.es.md) · [Türkçe](README.tr.md)

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

> **Pare de pagar US$ 15/mês pelo Linktree.** O LinkBreeze é um hub de links gratuito e auto-hospedado: rápido, personalizável, com análises integradas. **Instale com um comando.**

<div align="center">

&nbsp;[**🔗 Demo ao vivo**](https://linkbreeze-demo.omnirise.dev/linkbreeze)&nbsp;&nbsp;·&nbsp;&nbsp;
[**🔐 Painel de demonstração**](https://linkbreeze-demo.omnirise.dev/dashboard)

</div>

---

## ✨ Recursos

<div align="center">
<table>
  <tr>
    <td width="50%" valign="top">🔗 <strong>Suporte a Múltiplas Páginas</strong><br/>Páginas ilimitadas, cada uma com seu próprio slug, tema, links e análises</td>
    <td valign="top">🎨 <strong>Temas + Personalizador</strong><br/>11 predefinições além de um personalizador completo baseado em tokens com importação/exportação</td>
  </tr>
  <tr>
    <td valign="top">📊 <strong>Análises com Privacidade em Primeiro Lugar</strong><br/>Visualizações, cliques, origens, dispositivos. Sem cookies, IPs com hash, limpeza automática</td>
    <td valign="top">🧭 <strong>Assistente de Migração</strong><br/>Importe do Linktree, Bento, Hopp.bio, LittleLink ou de qualquer exportação HTML/JSON</td>
  </tr>
  <tr>
    <td valign="top">🔒 <strong>Auto-Hospedado</strong><br/>Seus dados, seu servidor. Sem rastreadores, sem anúncios, sem assinatura</td>
    <td valign="top">🐳 <strong>Instalação com Um Comando</strong><br/>Um comando curl. Detecta Docker ou Podman automaticamente e você já está no ar</td>
  </tr>
  <tr>
    <td valign="top">📱 <strong>Widgets Incorporados</strong><br/>YouTube, Spotify, SoundCloud, Vimeo e Bandcamp na sua página</td>
    <td valign="top">🎯 <strong>Códigos QR</strong><br/>Gerados automaticamente, cores personalizáveis, avatar ou favicon no centro, SVG/PNG até 1024px</td>
  </tr>
  <tr>
    <td width="50%" valign="top">🌐 <strong>Domínios personalizados</strong><br/>Aponte seus próprios domínios para páginas - visitantes chegam em jane.com, sem /slug</td>
    <td valign="top">⏰ <strong>Backups agendados</strong><br/>Backups internos diários/semanais/mensais com restauração em um clique, sem cron</td>
  </tr>
</table>


⚡ **Zero JavaScript no cliente. Carrega em menos de 300ms. HTML puro renderizado no servidor.**

</div>

<details>
<summary>✨ &nbsp;Todos os recursos</summary>

- **🔗 Gerenciamento de Links** - Adicione, reordene e personalize links ilimitados com arrastar e soltar
- **🌐 Links com Favicon Automático** - Os links mostram automaticamente o favicon do site de destino, sem necessidade de upload de ícones
- **🖼️ Miniaturas nos Links** - Adicione imagens aos seus links para cartões com pré-visualização visual
- **⏰ Agendamento de Links** - Agende links para aparecerem ou desaparecerem automaticamente com controles de data/hora
- **🏷️ Slugs de Redirecionamento Personalizados** - Links curtos `/go/seu-nome` estáveis e compartilháveis que sobrevivem a excluir e recriar
- **🧪 Testes A/B** - Divida o tráfego de um link entre dois destinos com atribuição por visitante que se mantém entre visitas, analítica por variante, percentual de lift e promoção do vencedor com um clique ([guia](docs/ab-testing.md))
- **📈 Análises Externas** - Injete Plausible, Umami, Matomo ou Google Analytics com um simples colar
- **🖼️ Imagens de Pré-visualização Social (OG)** - Cartões de compartilhamento gerados automaticamente a partir do tema da sua página, ou envie a sua com controle de ajuste, posição e zoom
- **✏️ CSS Personalizado** - Ajuste fino da sua página com injeção de CSS puro
- **📧 Captura de E-mails** - Colete e-mails de inscritos na sua página pública, exporte para CSV
- **🔔 Notificações de Atualização** - Banner no painel quando uma nova versão estiver disponível. Sem phone-home, sem atualização automática
- **🔑 Painel Admin Rápido** - Tudo acima a partir de um painel limpo e instantâneo

- **🌐 Domínios personalizados** - Aponte seus próprios domínios para páginas; escopo exclusivo ou hub, redirecionamentos canônicos automáticos, bloqueio de admin estrito por host
- **⏰ Backups agendados** - Backups internos diários/semanais/mensais com retenção e restauração em um clique, sem cron
</details>

## 🚀 Início Rápido

**Um comando. Zero configuração. No ar em 30 segundos:**

```bash
curl -fsSL https://linkbreeze.omnirise.dev/install.sh | bash
```

O script detecta Docker ou Podman, baixa a imagem e inicia o container. Execute com `sudo bash` e responda **y** para também ativar a inicialização automática no boot.

Depois abra **http://localhost:3000** - o assistente de configuração leva menos de 30 segundos.

<details>
<summary>🔍 &nbsp;Quer inspecionar o script antes de executá-lo?</summary>

```bash
curl -fsSL https://linkbreeze.omnirise.dev/install.sh -o install.sh
less install.sh
bash install.sh
```

</details>

**Prefere outro método?** Expanda uma das opções abaixo.

<details>
<summary>🐳 &nbsp;Docker</summary>

Sem Node.js, sem npm, sem arquivos de configuração. Imagens multi-arquitetura: `linux/amd64` e `linux/arm64` (Raspberry Pi 3/4/5, Apple Silicon, VPS ARM).

**Linux / macOS / CMD do Windows:**

```bash
docker run -d --name linkbreeze --restart unless-stopped -p 3000:3000 -v linkbreeze-data:/app/data docker.io/omnirise/linkbreeze:latest
```

**Windows PowerShell** - use crases para quebra de linha:

```powershell
docker run -d `
  --name linkbreeze `
  --restart unless-stopped `
  -p 3000:3000 `
  -v linkbreeze-data:/app/data `
  docker.io/omnirise/linkbreeze:latest
```

> As migrações do banco de dados rodam automaticamente na inicialização do container.

</details>

<details>
<summary>🧩 &nbsp;Docker Compose</summary>

Crie um `docker-compose.yml`:

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

Atualização: `docker compose pull && docker compose up -d` · Logs: `docker compose logs -f linkbreeze`

Prefere compilar a partir do código-fonte? `git clone https://github.com/OmniRise/LinkBreeze.git && cd LinkBreeze && docker compose up -d --build`

</details>

<details>
<summary>☁️ &nbsp;Coolify</summary>

1. **+ New Resource** → **Docker Compose Empty**
2. Cole o arquivo compose da seção acima
3. Configure um domínio (ex: `links.seudominio.com`) - o Coolify cuida do Let's Encrypt automaticamente
4. Clique em **Deploy**

</details>

<details>
<summary>📦 &nbsp;Synology NAS</summary>

Container Manager (DSM 7.2+):

1. Baixe a imagem `docker.io/omnirise/linkbreeze:latest` (**Image** → **Add**, se não encontrar)
2. **Create** um container: nome `linkbreeze`, porta `3000 → 3000`, volume `/docker/linkbreeze/data → /app/data`, política de reinício `Unless stopped`
3. Clique em **Done** - no ar em `http://<nas-ip>:3000`

Os dados persistem no volume entre atualizações de imagem.

</details>

<details>
<summary>🔧 &nbsp;Podman</summary>

```bash
podman run -d --name linkbreeze --restart unless-stopped -p 3000:3000 -v linkbreeze-data:/app/data docker.io/omnirise/linkbreeze:latest
```

Erros de permissão no volume? Execute `podman volume create linkbreeze-data` antes. O script de instalação no topo detecta o Podman automaticamente.

</details>

<details>
<summary>🖥️ &nbsp;Portainer</summary>

1. **Stacks** → **Add stack**, nomeie como `linkbreeze`
2. Cole o arquivo compose da seção Docker Compose acima
3. Clique em **Deploy the stack**

Atualizações: **Stacks** → `linkbreeze` → **Editor** → **Pull and redeploy**.

</details>

<details>
<summary>🔨 &nbsp;Manual (sem Docker)</summary>

Requer Node.js 18+.

```bash
git clone https://github.com/OmniRise/LinkBreeze.git
cd LinkBreeze
npm install
cp .env.example .env
# Edit .env to set your SECRET_KEY and DATABASE_PATH if needed
npm run db:migrate
npm run dev
```

Para produção: `npm run build && npm start`

</details>

<details>
<summary>🌍 &nbsp;Coloque no ar no seu domínio</summary>

Depois de implantado, sua página fica em `https://your-domain.com/your-slug`.

1. Aponte o registro A do seu domínio para o IP do seu servidor
2. Exponha a porta 3000 ou coloque um proxy reverso na frente
3. Pronto

**Arquivos compose prontos** ficam em [`examples/`](examples/) - um arquivo independente por cenário:

| O que você quer | Use este arquivo |
|---------------|-----------------|
| TLS automático, sem configuração manual | `docker-compose.caddy.yml` ou `docker-compose.https-portal.yml` |
| TLS automático com painel (Traefik) | `docker-compose.traefik.yml` |
| Sem portas abertas (zero-trust) | `docker-compose.cloudflare-tunnel.yml` |
| Você já usa Nginx + Certbot | `docker-compose.nginx.yml` |
| Backups agendados pela interface (sem sidecar) | Integrado - ative em Configurações e depois Dados |
| Backups agendados do SQLite (sidecar de dump bruto, externo para S3) | `docker-compose.with-backup.yml` |
| Rodando no Kubernetes | `kubernetes.yaml` |

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

**Cloudflare Tunnel** (sem portas abertas, sem precisar comprar domínio):

```bash
cloudflared tunnel --url http://localhost:3000
```

</details>

## 📸 Capturas de Tela

<details>
    <summary>Clique para expandir</summary>
    <br/>

<table>
    <tr>
    <td>Página Pública</td>
    <td>Painel de Administração</td>
    </tr>
    <tr>
    <td><img src="public/screenshots/Public-Page(Aurora).jpeg" alt="Página Pública [Tema Aurora]" /></td>
    <td><img src="public/screenshots/Admin-Dashboard.jpeg" alt="Painel de Administração" /></td>
    </tr>
    <tr>
    <td>Links</td>
    <td>Perfil</td>
    </tr>
    <tr>
    <td><img src="public/screenshots/Links.jpeg" alt="Página de Links" /></td>
    <td><img src="public/screenshots/Profile.jpeg" alt="Página de Perfil" /></td>
    </tr>
    <tr>
    <td>Tema</td>
    <td>Painel de Prévia ao Vivo</td>
    </tr>
    <tr>
    <td><img src="public/screenshots/Theme.jpeg" alt="Página de Temas" /></td>
    <td><img src="public/screenshots/Preview.jpeg" alt="Painel de Prévia ao Vivo" /></td>
    </tr>
    <tr>
    <td>Configurações [Geral]</td>
    <td>Configurações [Aparência]</td>
    </tr>
    <tr>
    <td><img src="public/screenshots/Settings(General).jpeg" alt="Página de Configurações [Aba Geral]" /></td>
    <td><img src="public/screenshots/Settings(Appearance).jpeg" alt="Página de Configurações [Aba Aparência]" /></td>
    <tr>
    <td>Configurações [Segurança]</td>
    <td>Configurações [Dados]</td>
    </tr>
    <tr>
    <td><img src="public/screenshots/Settings(Security).jpeg" alt="Página de Configurações [Aba Segurança]" /></td>
    <td><img src="public/screenshots/Settings(Data).jpeg" alt="Página de Configurações [Aba Dados]" /></td>
    </tr>
</table>

</details>

## 🆚 Comparativo

<div align="center">

| Recurso | Linktree | LinkStack | LittleLink | Shako | **LinkBreeze** |
|---------|----------|-----------|------------|-------|----------------|
| **Preço** | Grátis - US$ 35/mês | Grátis | Grátis | Grátis | **Grátis** |
| **Painel Admin** | ✅ | ✅ | ❌ | ❌ | **✅ Rápido** |
| **Múltiplas Páginas** | ❌ | ❌ | ❌ | ❌ | **✅ Ilimitadas** |
| **Favicon Automático nos Links** | ❌ | ❌ | ❌ | ❌ | **✅** |
| **Assistente de Migração** | ❌ | ❌ | ❌ | ❌ | **✅** |
| **Análises Integradas** | Básico, completo é pago | Básico | ❌ | ❌ | **✅ Completo e privado** |
| **Captura de E-mails** | Pago | ❌ | ❌ | ❌ | **✅** |
| **Widgets Incorporados** | Parcial | ❌ | ❌ | ❌ | **✅** |
| **Agendamento de Links** | Pago | ❌ | ❌ | ❌ | **✅** |
| **Temas** | Pago | Limitado | Apenas CSS | Arquivo de config | **✅ Sistema completo de tokens** |
| **Códigos QR** | ✅ | ✅ | ❌ | ❌ | **✅ Personalizáveis** |
| **Auto-Hospedado** | ❌ | ✅ | ✅ | ✅ | **✅** |
| **Carregamento da Página** | Hospedado | App PHP | Rápido (estático) | Rápido (estático) | **<300ms, zero JS** |

</div>

## 💬 Comunidade

<div align="center">

**Obtenha ajuda, mostre sua página, vote no que vem a seguir.**

[![Discord](https://img.shields.io/discord/1559020936253022209?style=for-the-badge&logo=discord&logoColor=white&label=Junte-se%20ao%20nosso%20Discord&color=5865F2)](https://discord.gg/bAJMW3bAJa)

</div>

## ⚙️ Configuração

Toda a configuração é feita via variáveis de ambiente. **[`.env.example`](.env.example) é a referência canônica** - copie-o e cada variável está documentada inline, incluindo os blocos de carteira.

| Variável | Padrão | Descrição |
|----------|--------|-----------|
| `PORT` | `3000` | Porta do servidor |
| `DATABASE_PATH` | `./data/linkbreeze.db` | Caminho do arquivo de banco SQLite |
| `BACKUP_DIR` | `./data/backups` | Diretório de armazenamento dos backups agendados (manter dentro do volume persistente `./data`) |
| `BACKUP_MIN_FREE_MB` | `50` | Pular a gravação de backups quando o espaço livre cair abaixo deste valor |
| `SECRET_KEY` | Gerado automaticamente | Chave de assinatura HMAC para sessões |
| `EXTRA_SCRIPT_SRC` | _(vazio)_ | Domínios de análises separados por espaço para o CSP (ex: `plausible.io umami.is`) |
| `LINKBREEZE_PRIMARY_HOST` | _(vazio)_ | Host principal onde fica a administração; o bloqueio de domínios personalizados retorna 404 em todos os outros hosts (a variável de ambiente tem prioridade sobre a configuração) |
| `LINKBREEZE_TRUST_X_FORWARDED_HOST` | `false` | Confiar em `X-Forwarded-Host` para o roteamento de domínios - ative apenas atrás de um proxy que SOBRESCREVA o cabeçalho (nginx, Caddy); o cabeçalho `Host` padrão não pode ser falsificado |

<details>
<summary>💳 &nbsp;Variáveis de carteira (Google Wallet / Apple Wallet)</summary>

| Variável | Descrição |
|----------|-----------|
| `GOOGLE_WALLET_ISSUER_ID` | ID numérico do emissor do Google Pay & Wallet Console. Ativa os botões "Adicionar ao Google Wallet" |
| `GOOGLE_WALLET_SERVICE_ACCOUNT_JSON` | JSON da conta de serviço (`client_email` + `private_key`) autorizada para a Wallet API |
| `APPLE_WALLET_CERT_PEM` | Certificado de assinatura do Pass Type ID (PEM). Ativa os botões "Adicionar ao Apple Wallet" |
| `APPLE_WALLET_KEY_PEM` | Chave privada correspondente ao certificado de assinatura (PEM) |
| `APPLE_WALLET_KEY_PASSPHRASE` | Senha da chave de assinatura, se criptografada |
| `APPLE_WALLET_WWDR_PEM` | Certificado intermediário WWDR da Apple (PEM) |
| `APPLE_WALLET_TEAM_ID` | Seu Team ID da Apple de 10 caracteres |
| `APPLE_WALLET_PASS_TYPE_ID` | Seu Pass Type ID (deve começar com `pass.`) |

Toda página pública renderiza um bloco de compartilhamento com um botão "Salvar contato" (vCard universal, sempre ativo). Os botões de carteira são ativados automaticamente quando as credenciais acima estão configuradas. Google Wallet: conta de emissor gratuita, mas os passes só podem ser salvos por usuários de teste na lista de permissões até o Google liberar o acesso de produção. Apple Wallet: requer uma conta paga de desenvolvedor Apple e instalação apenas pelo Safari. Os passes são snapshots estáticos - o QR do pass sempre abre a página ao vivo. Configurações → Integração mostra o status das credenciais por carteira e avisa quando o certificado de assinatura da Apple está prestes a expirar.

</details>

**Usa análises externas?** Cole o snippet do provedor em Configurações → Integração → Script de análises e adicione o domínio do provedor em `EXTRA_SCRIPT_SRC` para que o CSP o permita (ex: `EXTRA_SCRIPT_SRC=plausible.io umami.is`). Recompile após alterar - o CSP é gerado no processo de build.

As configurações de tempo de execução (slug da página, título, SEO, tema) são gerenciadas pelo painel admin e armazenadas no banco de dados - sem necessidade de alterar código.

## 🌐 Domínios personalizados

Aponte seus próprios domínios para páginas - uma instância, várias identidades. Visitantes chegam em `https://jane.com/` e veem a página de Jane diretamente, com redirecionamentos canônicos automáticos, sitemaps prontos para SEO e bloqueio de admin estrito por host. Os vínculos são ativados na primeira visita real (DNS autoverificado), e o escopo por página decide se um domínio É a página (exclusivo) ou um hub para todos os slugs.

Configuração completa - DNS, TLS curinga e configurações de proxy reverso prontas para copiar para Caddy, nginx e Traefik - em **[docs/custom-domains.md](docs/custom-domains.md)**.

## 🎨 Sistema de Temas

11 predefinições estão incluídas de fábrica: **Aurora** (carro-chefe animado), **Glassmorphism**, **Neon Cyberpunk**, **Editorial Paper**, **Terminal Mono**, **Pastel Soft**, **Brutalist**, **Retro Sunset**, **Minimal Light**, **8-Bit Retro** e **Frutiger Aero**.

<details>
<summary>🎛️ &nbsp;O que o personalizador controla</summary>

O motor de temas é um sistema de tokens baseado em propriedades personalizadas CSS (`--lb-*`) - cada cor, raio, sombra e fonte da página pública é um token.

- **Fundo** - 8 tipos (sólido, gradiente, radial, mesh, aurora, gradiente animado, imagem, padrão) com controles de ângulo, sobreposição e opacidade
- **Cores** - destaque, secundária, texto, texto atenuado, fundo do cartão, borda do cartão (hex ou rgba)
- **Tipografia** - 15 Google Fonts selecionadas, escala de fonte, peso, espaçamento entre letras - ou envie seu próprio woff2/woff (máx. 2 MB). Fontes enviadas são servidas na mesma origem, incorporadas nas exportações de tema e incluídas nos backups
- **Estilo dos Cartões** - 7 estilos de link (pílula, arredondado, reto, vidro, contorno, neon, pixel), efeitos de hover, tamanho do botão, raio dos cantos, largura da borda, intensidade da sombra
- **Layout** - largura do contêiner, alinhamento (esquerda/centro/direita), densidade (compacto/normal/espaçado)
- **Efeitos** - brilho com cor personalizada, desfoque de vidro, textura de ruído, animação de revelação
- **Duplicar / importar / exportar** - clone qualquer tema como uma cópia editável e compartilhe como JSON

</details>

## 📖 Docs & Links

[Contribuição](CONTRIBUTING.md) · [Política de Segurança](SECURITY.md) · [Histórico de Alterações](CHANGELOG.md) · [Solução de Problemas](TROUBLESHOOTING.md) · [Custom Domains](docs/custom-domains.md) · [Decisões de Arquitetura](docs/adr/) · [Referência de configuração](.env.example)

Fonte: [GitHub](https://github.com/OmniRise/LinkBreeze) (canônico) · [GitLab](https://gitlab.com/omnirise00/linkbreeze) (espelho público de pull, sincronizado automaticamente) · Imagem: [`docker.io/omnirise/linkbreeze`](https://hub.docker.com/r/omnirise/linkbreeze)

Issues e PRs são bem-vindos em qualquer uma das plataformas.

## 🤝 Contribuição

Contribuições são bem-vindas! Consulte [CONTRIBUTING.md](CONTRIBUTING.md) para as diretrizes.

## 📜 Licença

MIT - faça o que quiser. Veja [LICENSE](LICENSE).

## 🏢 Sobre

Criado por [Manak-hash](https://github.com/Manak-hash) · Um projeto [OmniRise](https://omnirise.dev).
