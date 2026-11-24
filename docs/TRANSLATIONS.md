# Translations

Status of translated README files. The English [README.md](../README.md) is
authoritative; translations may lag behind.

| Language | File | Source commit (README.md) | Status |
|----------|------|--------------------------|--------|
| English | [README.md](../README.md) | — | authoritative |
| العربية | [readme/README.ar.md](readme/README.ar.md) | `75fc5495e57303362211ff90b5252656e763bb05` | in review |
| 中文 | [readme/README.zh.md](readme/README.zh.md) | `75fc5495e57303362211ff90b5252656e763bb05` | in review |
| Français | [readme/README.fr.md](readme/README.fr.md) | `75fc5495e57303362211ff90b5252656e763bb05` | in review |
| Deutsch | [readme/README.de.md](readme/README.de.md) | `75fc5495e57303362211ff90b5252656e763bb05` | in review |
| Italiano | [readme/README.it.md](readme/README.it.md) | `75fc5495e57303362211ff90b5252656e763bb05` | in review |
| 日本語 | [readme/README.ja.md](readme/README.ja.md) | `75fc5495e57303362211ff90b5252656e763bb05` | in review |
| Português (Brasil) | [readme/README.pt-BR.md](readme/README.pt-BR.md) | `75fc5495e57303362211ff90b5252656e763bb05` | in review |
| Русский | [readme/README.ru.md](readme/README.ru.md) | `75fc5495e57303362211ff90b5252656e763bb05` | in review |
| Español | [readme/README.es.md](readme/README.es.md) | `75fc5495e57303362211ff90b5252656e763bb05` | in review |
| Türkçe | [readme/README.tr.md](readme/README.tr.md) | `75fc5495e57303362211ff90b5252656e763bb05` | in review |

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
