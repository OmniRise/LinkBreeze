# Translations

Status of translated README files. The English [README.md](../README.md) is
authoritative; translations may lag behind.

| Language | File | Source commit (README.md) | Status |
|----------|------|--------------------------|--------|
| English | [README.md](../README.md) | — | authoritative |
| العربية | [README.ar.md](../README.ar.md) | `68878b162e76dd9e052c7cc33903fcfcb4d3dfd3` | in review |
| 中文 | [README.zh.md](../README.zh.md) | `68878b162e76dd9e052c7cc33903fcfcb4d3dfd3` | in review |
| Français | [README.fr.md](../README.fr.md) | `68878b162e76dd9e052c7cc33903fcfcb4d3dfd3` | in review |
| Deutsch | [README.de.md](../README.de.md) | `68878b162e76dd9e052c7cc33903fcfcb4d3dfd3` | in review |
| Italiano | [README.it.md](../README.it.md) | `68878b162e76dd9e052c7cc33903fcfcb4d3dfd3` | in review |
| 日本語 | [README.ja.md](../README.ja.md) | `68878b162e76dd9e052c7cc33903fcfcb4d3dfd3` | in review |
| Português (Brasil) | [README.pt-BR.md](../README.pt-BR.md) | `68878b162e76dd9e052c7cc33903fcfcb4d3dfd3` | in review |
| Русский | [README.ru.md](../README.ru.md) | `68878b162e76dd9e052c7cc33903fcfcb4d3dfd3` | in review |
| Español | [README.es.md](../README.es.md) | `68878b162e76dd9e052c7cc33903fcfcb4d3dfd3` | in review |
| Türkçe | [README.tr.md](../README.tr.md) | `68878b162e76dd9e052c7cc33903fcfcb4d3dfd3` | in review |

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

## Reviewing

Maintainer-reviewed languages (fr, es, de, zh, ar, pt-BR) are translated and reviewed by the
maintainer. For community languages, open a discussion; a native speaker
should review before the translation lands.
