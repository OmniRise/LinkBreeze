# Translations

Status of translated README files. The English [README.md](../README.md) is
authoritative; translations may lag behind.

| Language | File | Source commit (README.md) | Status |
|----------|------|--------------------------|--------|
| English | [README.md](../README.md) | — | authoritative |
| العربية | [README.ar.md](../README.ar.md) | `a1af7992922ecdbb429686fb769a6cfa7923991e` | in review |
| 中文 | [README.zh.md](../README.zh.md) | `a1af7992922ecdbb429686fb769a6cfa7923991e` | in review |
| Français | [README.fr.md](../README.fr.md) | `a1af7992922ecdbb429686fb769a6cfa7923991e` | in review |
| Deutsch | [README.de.md](../README.de.md) | `a1af7992922ecdbb429686fb769a6cfa7923991e` | in review |
| Italiano | [README.it.md](../README.it.md) | `a1af7992922ecdbb429686fb769a6cfa7923991e` | in review |
| 日本語 | [README.ja.md](../README.ja.md) | `a1af7992922ecdbb429686fb769a6cfa7923991e` | in review |
| Português (Brasil) | [README.pt-BR.md](../README.pt-BR.md) | `a1af7992922ecdbb429686fb769a6cfa7923991e` | in review |
| Русский | [README.ru.md](../README.ru.md) | `a1af7992922ecdbb429686fb769a6cfa7923991e` | in review |
| Español | [README.es.md](../README.es.md) | `a1af7992922ecdbb429686fb769a6cfa7923991e` | in review |
| Türkçe | [README.tr.md](../README.tr.md) | `a1af7992922ecdbb429686fb769a6cfa7923991e` | in review |

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
