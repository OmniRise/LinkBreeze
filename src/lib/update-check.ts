import "server-only";

import { version as currentVersion } from "@/lib/version";
import { getSetting, updateSetting } from "@/server/queries";

/**
 * Update checker — polls a static JSON file for the latest release version.
 *
 * No GitHub API token needed, no rate limits, no user data sent.
 * The file is fetched from the repo's raw URL, cached for 24h in the DB.
 */

const VERSION_URL =
  "https://linkbreeze.omnirise.dev/latest-version.json";

// Unauthenticated GitHub API — 60 req/h per IP is plenty for a 24h-cached check.
const GITHUB_RELEASE_URL =
  "https://api.github.com/repos/OmniRise/LinkBreeze/releases/latest";

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface UpdateCheckResult {
  /** Whether an update is available */
  hasUpdate: boolean;
  /** Latest version from the remote file */
  latestVersion: string | null;
  /** Currently installed version */
  currentVersion: string;
  /** Release notes URL */
  releaseUrl: string | null;
  /** Human-readable release notes summary */
  notes: string | null;
  /** When the check was last performed (ISO string) */
  checkedAt: string;
}

interface RemoteVersionFile {
  version: string;
  releasedAt?: string;
  url?: string;
  notes?: string;
}

/**
 * Parse a semver string (e.g. "1.2.0") into comparable parts.
 * Returns null if unparseable.
 */
function parseSemver(v: string): [number, number, number] | null {
  const m = v.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/**
 * Compare two semver strings. Returns true if `latest` is newer than `current`.
 */
export function isNewerVersion(current: string, latest: string): boolean {
  const c = parseSemver(current);
  const l = parseSemver(latest);
  if (!c || !l) return false; // Can't parse — don't trigger false positives
  return (
    l[0] > c[0] ||
    (l[0] === c[0] && l[1] > c[1]) ||
    (l[0] === c[0] && l[1] === c[1] && l[2] > c[2])
  );
}

/**
 * Check for updates. Uses a 24h DB cache to avoid hammering the remote URL.
 *
 * Pass `forceRefresh: true` to bypass the cache (used for the manual "Check now" button).
 */
export async function checkForUpdates(
  forceRefresh = false,
): Promise<UpdateCheckResult> {
  // Check if update checks are disabled
  const enabled = await getSetting("updateCheckEnabled");
  if (enabled === "false" && !forceRefresh) {
    return {
      hasUpdate: false,
      latestVersion: null,
      currentVersion,
      releaseUrl: null,
      notes: null,
      checkedAt: new Date().toISOString(),
    };
  }

  // Check cache
  if (!forceRefresh) {
    const cached = await getSetting("lastUpdateCheckResult");
    const checkedAt = await getSetting("lastUpdateCheckAt");
    if (cached && checkedAt) {
      const age = Date.now() - new Date(checkedAt).getTime();
      if (age < CACHE_TTL_MS) {
        try {
          const data = JSON.parse(cached) as RemoteVersionFile;
          return {
            hasUpdate: isNewerVersion(currentVersion, data.version),
            latestVersion: data.version,
            currentVersion,
            releaseUrl: data.url ?? null,
            notes: data.notes ?? null,
            checkedAt,
          };
        } catch {
          // Stale/corrupt cache — fall through to live fetch
        }
      }
    }
  }

  // Live fetch
  try {
    const res = await fetch(VERSION_URL, {
      signal: AbortSignal.timeout(5000),
      headers: { Accept: "application/json" },
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = (await res.json()) as RemoteVersionFile;

    // Validate the shape
    if (!data.version || !parseSemver(data.version)) {
      throw new Error("Invalid version format in remote file");
    }

    const checkedAt = new Date().toISOString();

    // Cache the result
    await updateSetting("lastUpdateCheckResult", JSON.stringify(data));
    await updateSetting("lastUpdateCheckAt", checkedAt);

    return {
      hasUpdate: isNewerVersion(currentVersion, data.version),
      latestVersion: data.version,
      currentVersion,
      releaseUrl: data.url ?? null,
      notes: data.notes ?? null,
      checkedAt,
    };
  } catch {
    // Network error, timeout, parse error — fail silently.
    // Return cached data if we have it, otherwise "no update".
    const cached = await getSetting("lastUpdateCheckResult");
    if (cached) {
      try {
        const data = JSON.parse(cached) as RemoteVersionFile;
        return {
          hasUpdate: isNewerVersion(currentVersion, data.version),
          latestVersion: data.version,
          currentVersion,
          releaseUrl: data.url ?? null,
          notes: data.notes ?? null,
          checkedAt: (await getSetting("lastUpdateCheckAt")) ?? new Date().toISOString(),
        };
      } catch {
        // fall through
      }
    }

    return {
      hasUpdate: false,
      latestVersion: null,
      currentVersion,
      releaseUrl: null,
      notes: null,
      checkedAt: new Date().toISOString(),
    };
  }
}

/**
 * Enable or disable update checks.
 */
export async function setUpdateCheckEnabled(enabled: boolean): Promise<void> {
  await updateSetting("updateCheckEnabled", enabled ? "true" : "false");
}

/**
 * Get the current update check setting.
 */
export async function isUpdateCheckEnabled(): Promise<boolean> {
  const val = await getSetting("updateCheckEnabled");
  return val !== "false"; // Default: enabled
}

/**
 * Per-source status for the settings update card. A source with `version:
 * null` could not be determined (fetch failure, or checks disabled for the
 * website source); `checkedAt` is the last time a value was successfully
 * stored, which may be older than 24h when the live fetch keeps failing.
 */
export interface UpdateSourceStatus {
  version: string | null;
  url: string | null;
  checkedAt: string | null;
  error: string | null;
}

export interface UpdateStatusResult {
  currentVersion: string;
  website: UpdateSourceStatus;
  github: UpdateSourceStatus;
  /** Newest version reported by any source, or null when none resolved. */
  latestVersion: string | null;
  hasUpdate: boolean;
}

/**
 * Strip a release-tag prefix ("v1.4.2" -> "1.4.2"). Returns the numeric
 * prefix when the tag is parseable, null otherwise.
 */
export function normalizeTagVersion(tag: string): string | null {
  const m = tag.replace(/^v/i, "").match(/^(\d+\.\d+\.\d+)/);
  return m ? m[1] : null;
}

/**
 * Newest of the given versions (unparseable/null entries are skipped).
 * Returns null when no entry resolves.
 */
export function newestOf(versions: Array<string | null | undefined>): string | null {
  let best: string | null = null;
  for (const v of versions) {
    if (v && parseSemver(v) && (!best || isNewerVersion(best, v))) best = v;
  }
  return best;
}

/**
 * Pure resolver: pick the latest across both sources and decide whether an
 * update exists. Kept pure so the settings-card logic is unit-testable.
 */
export function resolveUpdateStatus(
  currentVersion: string,
  website: UpdateSourceStatus,
  github: UpdateSourceStatus,
): UpdateStatusResult {
  const latestVersion = newestOf([website.version, github.version]);
  return {
    currentVersion,
    website,
    github,
    latestVersion,
    hasUpdate: latestVersion ? isNewerVersion(currentVersion, latestVersion) : false,
  };
}

interface GithubReleaseResponse {
  tag_name?: string;
  html_url?: string;
}

async function fetchGithubReleaseFresh(): Promise<{ version: string; url: string | null }> {
  const res = await fetch(GITHUB_RELEASE_URL, {
    signal: AbortSignal.timeout(8000),
    headers: {
      Accept: "application/vnd.github+json",
      // GitHub API requires a User-Agent.
      "User-Agent": "LinkBreeze-UpdateCheck",
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as GithubReleaseResponse;
  const version = data.tag_name ? normalizeTagVersion(data.tag_name) : null;
  if (!version) throw new Error("Invalid tag format in GitHub response");
  return { version, url: data.html_url ?? null };
}

function parseCachedGithubRelease(
  cached: string,
  checkedAt: string,
): UpdateSourceStatus | null {
  try {
    const data = JSON.parse(cached) as { version?: string; url?: string };
    if (!data.version || !parseSemver(data.version)) return null;
    return { version: data.version, url: data.url ?? null, checkedAt, error: null };
  } catch {
    return null;
  }
}

async function readGithubCache(): Promise<UpdateSourceStatus | null> {
  const [cached, checkedAt] = await Promise.all([
    getSetting("lastGithubReleaseResult"),
    getSetting("lastGithubReleaseAt"),
  ]);
  if (!cached || !checkedAt) return null;
  return parseCachedGithubRelease(cached, checkedAt);
}

/**
 * GitHub latest-release status, 24h-cached in the settings KV the same way
 * the website source is. On a failed live fetch, falls back to the cached
 * value flagged with `error` so the UI can show "last known value".
 */
async function githubReleaseStatus(
  forceRefresh: boolean,
): Promise<UpdateSourceStatus> {
  if (!forceRefresh) {
    const cached = await readGithubCache();
    if (cached) {
      const age = Date.now() - new Date(cached.checkedAt as string).getTime();
      if (age < CACHE_TTL_MS) return cached;
    }
  }

  try {
    const fresh = await fetchGithubReleaseFresh();
    const checkedAt = new Date().toISOString();
    await updateSetting("lastGithubReleaseResult", JSON.stringify(fresh));
    await updateSetting("lastGithubReleaseAt", checkedAt);
    return { ...fresh, checkedAt, error: null };
  } catch {
    const cached = await readGithubCache();
    if (cached) return { ...cached, error: "fetch_failed_stale" };
    return { version: null, url: null, checkedAt: null, error: "fetch_failed" };
  }
}

/**
 * Combined status for the settings update card: installed version, the
 * website source (same fetch/cache as the dashboard banner) and the GitHub
 * source, resolved into a single latest/has-update verdict.
 *
 * Pass `forceRefresh: true` for the manual "Recheck" button.
 */
export async function getUpdateStatus(
  forceRefresh = false,
): Promise<UpdateStatusResult> {
  const [websiteResult, github] = await Promise.all([
    checkForUpdates(forceRefresh),
    githubReleaseStatus(forceRefresh),
  ]);

  const website: UpdateSourceStatus = {
    version: websiteResult.latestVersion,
    url: websiteResult.releaseUrl,
    checkedAt: websiteResult.checkedAt,
    // When checks are disabled (not just a failed fetch) latestVersion is
    // null; the UI keys off `checksEnabled` for that case, so a null here
    // simply reads as "unknown" either way.
    error: websiteResult.latestVersion ? null : "unavailable",
  };

  return resolveUpdateStatus(currentVersion, website, github);
}
