# Packaging

Canonical sources for LinkBreeze's app-store packaging. The official
distribution is the Docker image; these directories turn that image into
one-click catalog listings.

| Directory | Target | Vehicle |
|---|---|---|
| `casaos/` | CasaOS / ZimaOS App Store | PR to `IceWhaleTech/CasaOS-AppStore` from the `OmniRise/LinkBreeze-CasaOS-AppStore` fork |
| `runtipi/` | Runtipi v4+ custom app store | Public store repo `OmniRise/LinkBreeze-Runtipi-Store` (users add the URL in Settings → App Stores) |
| `unraid/` | Unraid Community Applications | Public repo `OmniRise/LinkBreeze-Unraid-Templates`, submitted at ca.unraid.net/submit |

Policy: these three catalogs are maintained by the project. Any other platform
or hosting-provider deploy integration is community-PR territory (see
../.github/CONTRIBUTING.md).

## Release bump checklist

All three manifests pin the released semver (no `:latest` where the platform
bans it; we pin everywhere for consistency). During each release fold:

1. Bump the image tag, `version`, and `updated_at`/`update_at` in:
   - `runtipi/apps/linkbreeze/config.json`
   - `casaos/Apps/LinkBreeze/docker-compose.yml`
   - `unraid/linkbreeze.xml` (`<Branch><Tag>`)
2. Sync outward after the release publishes: push the Runtipi store repo,
   open the CasaOS update PR, push the Unraid templates repo (Unraid users
   then update from the Apps tab)
3. If assets changed, regenerate: `icon.png` 256² (CasaOS), `logo.jpg` 512²
   flattened (Runtipi), screenshot 1280×720 (CasaOS) from `public/` in the
   app repo
