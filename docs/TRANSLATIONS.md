# Translations

Status of translated README files. The English [README.md](../README.md) is
authoritative; translations may lag behind.

| Language | File | Source commit (README.md) | Status |
|----------|------|--------------------------|--------|
| English | [README.md](../README.md) | — | authoritative |
| العربية | [readme/README.ar.md](readme/README.ar.md) | `5e23f7c69d33c2f00ae03dd48e2072b8513de5ea` | in review |
| 中文 | [readme/README.zh.md](readme/README.zh.md) | `5e23f7c69d33c2f00ae03dd48e2072b8513de5ea` | in review |
| Français | [readme/README.fr.md](readme/README.fr.md) | `5e23f7c69d33c2f00ae03dd48e2072b8513de5ea` | in review |
| Deutsch | [readme/README.de.md](readme/README.de.md) | `5e23f7c69d33c2f00ae03dd48e2072b8513de5ea` | in review |
| Italiano | [readme/README.it.md](readme/README.it.md) | `5e23f7c69d33c2f00ae03dd48e2072b8513de5ea` | in review |
| 日本語 | [readme/README.ja.md](readme/README.ja.md) | `5e23f7c69d33c2f00ae03dd48e2072b8513de5ea` | in review |
| Português (Brasil) | [readme/README.pt-BR.md](readme/README.pt-BR.md) | `5e23f7c69d33c2f00ae03dd48e2072b8513de5ea` | in review |
| Русский | [readme/README.ru.md](readme/README.ru.md) | `5e23f7c69d33c2f00ae03dd48e2072b8513de5ea` | in review |
| Español | [readme/README.es.md](readme/README.es.md) | `5e23f7c69d33c2f00ae03dd48e2072b8513de5ea` | in review |
| Türkçe | [readme/README.tr.md](readme/README.tr.md) | `5e23f7c69d33c2f00ae03dd48e2072b8513de5ea` | in review |

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
