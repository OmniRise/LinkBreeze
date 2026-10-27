# Translations

Status of translated README files. The English [README.md](../README.md) is
authoritative; translations may lag behind.

| Language | File | Source commit (README.md) | Status |
|----------|------|--------------------------|--------|
| English | [README.md](../README.md) | — | authoritative |
| العربية | [README.ar.md](../README.ar.md) | `d392e994e78b0722b2dc8780fda6be41fe5abe20` | in review |
| 中文 | [README.zh.md](../README.zh.md) | `d392e994e78b0722b2dc8780fda6be41fe5abe20` | in review |
| Français | [README.fr.md](../README.fr.md) | `d392e994e78b0722b2dc8780fda6be41fe5abe20` | in review |
| Deutsch | [README.de.md](../README.de.md) | `d392e994e78b0722b2dc8780fda6be41fe5abe20` | in review |
| Italiano | [README.it.md](../README.it.md) | `d392e994e78b0722b2dc8780fda6be41fe5abe20` | in review |
| 日本語 | [README.ja.md](../README.ja.md) | `d392e994e78b0722b2dc8780fda6be41fe5abe20` | in review |
| Português (Brasil) | [README.pt-BR.md](../README.pt-BR.md) | `d392e994e78b0722b2dc8780fda6be41fe5abe20` | in review |
| Русский | [README.ru.md](../README.ru.md) | `d392e994e78b0722b2dc8780fda6be41fe5abe20` | in review |
| Español | [README.es.md](../README.es.md) | `d392e994e78b0722b2dc8780fda6be41fe5abe20` | in review |
| Türkçe | [README.tr.md](../README.tr.md) | `d392e994e78b0722b2dc8780fda6be41fe5abe20` | in review |

## Keeping translations fresh

Each translation records the `git hash-object README.md` value it was written
against. CI (`docs-stale.yml`) compares the recorded hash against the current
hash of README.md and fails when they differ, with a message telling you which
file needs a re-sync:

```bash
npm run docs:check        # local: same check CI runs
npm run docs:check -- --update   # after re-syncing a translation: rewrite hashes
```

After updating a translation, re-record the hash in this table and commit both
together.

## API section (REST)

The `## 🔌 REST API` section is translated in all files, with one rule that
overrides usual prose translation: everything inside ```bash blocks must be
byte-identical across locales (commands, `--oauth2-bearer "$LB_API_KEY"`,
`$BASE/...` paths, `If-None-Match`/`ETag` header names, `jq` filters) — only
the `# comment` lines are translated. Table descriptions and paragraph prose
translate freely; endpoint paths, HTTP verbs, and header names never
translate. The endpoints table and cookbook have grown several times (single
reads, sections, import, conditional GET, header contract) — when re-syncing,
diff section-by-section rather than assuming the old block list.

## Reviewing

Maintainer-reviewed languages (fr, es, de, zh, ar, pt-BR) are translated and reviewed by the
maintainer. For community languages, open a discussion; a native speaker
should review before the translation lands.
