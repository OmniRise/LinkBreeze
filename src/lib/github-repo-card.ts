import "server-only";

/**
 * GitHub repo card data — server-side fetch + cache for github.com embed
 * links. Unauthenticated GitHub REST allows 60 requests/hour per IP, so
 * every successful lookup caches for an hour and every failure (404, rate
 * limit, network) caches a negative result for ten minutes: a cold visitor
 * costs at most one API call per unique repo per hour, and a rate-limited
 * instance degrades to the plain fallback card without hammering the API.
 *
 * The cache is per-process memory — single-container deployments (the
 * documented install shape) share it across all requests. No persistence:
 * worst case after a restart is one API call per repo per hour.
 */

export interface GithubRepoInfo {
  fullName: string;
  owner: string;
  ownerAvatarUrl: string;
  description: string | null;
  stars: number;
  forks: number;
  language: string | null;
  homepage: string | null;
  htmlUrl: string;
}

interface CacheEntry {
  info: GithubRepoInfo | null;
  expires: number;
}

const POSITIVE_TTL_MS = 60 * 60 * 1000;
const NEGATIVE_TTL_MS = 10 * 60 * 1000;

const cache = new Map<string, CacheEntry>();

/** Test hook — wipes the in-memory cache between cases. */
export function resetGithubRepoCacheForTests(): void {
  cache.clear();
}

export async function fetchGithubRepoInfo(
  owner: string,
  repo: string,
  fetchImpl: typeof fetch = fetch,
): Promise<GithubRepoInfo | null> {
  const key = `${owner}/${repo}`.toLowerCase();
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.info;

  const setNegative = () => {
    cache.set(key, { info: null, expires: Date.now() + NEGATIVE_TTL_MS });
  };

  try {
    const res = await fetchImpl(
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
      {
        headers: {
          Accept: "application/vnd.github+json",
          "User-Agent": "LinkBreeze-embeds",
        },
        signal: AbortSignal.timeout(5000),
      },
    );
    if (!res.ok) {
      setNegative();
      return null;
    }
    const j = (await res.json()) as Record<string, unknown>;
    const ownerLogin = String((j.owner as Record<string, unknown> | undefined)?.login ?? owner);
    const avatarRaw = String((j.owner as Record<string, unknown> | undefined)?.avatar_url ?? "");
    // The API response is trusted for data but not for link/img targets: a
    // compromised or tampered payload must not turn the card into a link to
    // (or an image loaded from) an arbitrary URL. Non-https avatar → no
    // avatar; non-github html_url → the canonical constructed URL.
    const avatar = avatarRaw.startsWith("https://") ? avatarRaw : "";
    const rawHtmlUrl = typeof j.html_url === "string" ? j.html_url : "";
    const htmlUrl =
      rawHtmlUrl.startsWith("https://github.com/") && !/[\s"'<>]/.test(rawHtmlUrl)
        ? rawHtmlUrl
        : `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
    const info: GithubRepoInfo = {
      fullName: String(j.full_name ?? `${owner}/${repo}`),
      owner: ownerLogin,
      ownerAvatarUrl: avatar,
      description: typeof j.description === "string" && j.description ? j.description : null,
      stars: typeof j.stargazers_count === "number" ? j.stargazers_count : 0,
      forks: typeof j.forks_count === "number" ? j.forks_count : 0,
      language: typeof j.language === "string" && j.language ? j.language : null,
      homepage: typeof j.homepage === "string" && j.homepage ? j.homepage : null,
      htmlUrl,
    };
    cache.set(key, { info, expires: Date.now() + POSITIVE_TTL_MS });
    return info;
  } catch {
    setNegative();
    return null;
  }
}
