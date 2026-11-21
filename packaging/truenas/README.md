# TrueNAS (ix-dev community train)

Canonical source for the TrueNAS app definition. The upstream PR was adopted
by the maintainers into truenas/apps#6617 (branch `linkbreeze`); our fork
`OmniRise/LinkBreeze-TrueNAS-App` (`feat/linkbreeze-app`) stays in sync via
`packaging-sync.yml`, which keeps the definition identical to upstream. While
the upstream PR is open, the sync keeps our fork aligned; config-shape changes
(new env vars, ports, storage options) still need a PR against `truenas/apps`.

This directory mirrors the upstream layout exactly
(`ix-dev/community/linkbreeze/`). NOTE: upstream does NOT commit
`templates/library/` (their tooling copies it at render time) and `item.yaml`
is generated — to regenerate locally after a tag bump: run
`uv run .github/scripts/ci.py --app linkbreeze --train community` in a
checkout of truenas/apps branch `linkbreeze`, then copy the files back here.

Review changes the maintainers added on top of our original submission (do
not lose them in a sync):

- Run-as is USER-CONFIGURABLE, default 568 (TrueNAS apps user), min 568 —
  not the fixed 1000 we originally shipped
- A writable named volume is mounted at `/app/.next/cache` (Next.js writes
  cache there at runtime as 568)
- Icon/screenshots point at `media.sys.truenas.net` CDN
- Image source is Docker Hub `omnirise/linkbreeze`, NOT ghcr (the ghcr
  package was private at submission time — anonymous pulls got 403)

## Release bump checklist

1. `ix_values.yaml`: image tag and digest — `v<VERSION>@sha256:...` from
   `docker buildx imagetools inspect omnirise/linkbreeze:v<VERSION>` (Docker
   Hub, multi-arch index digest)
2. `app.yaml`: `app_version: <VERSION>` (no `v` prefix)

