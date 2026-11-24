import { describe, it, expect, vi, beforeEach } from "vitest";

import {
  fetchGithubRepoInfo,
  resetGithubRepoCacheForTests,
} from "@/lib/github-repo-card";

const API_REPO_JSON = {
  full_name: "vercel/next.js",
  owner: {
    login: "vercel",
    avatar_url: "https://avatars.githubusercontent.com/u/9354028?v=4",
  },
  description: "The React Framework",
  stargazers_count: 125000,
  forks_count: 27000,
  language: "JavaScript",
  homepage: "https://nextjs.org",
  html_url: "https://github.com/vercel/next.js",
};

function mockFetchOnce(status: number, body: unknown) {
  return vi.fn(async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    }),
  ) as unknown as typeof fetch & ReturnType<typeof vi.fn>;
}

beforeEach(() => {
  resetGithubRepoCacheForTests();
});

describe("fetchGithubRepoInfo", () => {
  it("maps the API payload onto the card shape", async () => {
    const f = mockFetchOnce(200, API_REPO_JSON);
    const info = await fetchGithubRepoInfo("vercel", "next.js", f as unknown as typeof fetch);
    expect(info).toEqual({
      fullName: "vercel/next.js",
      owner: "vercel",
      ownerAvatarUrl: "https://avatars.githubusercontent.com/u/9354028?v=4",
      description: "The React Framework",
      stars: 125000,
      forks: 27000,
      language: "JavaScript",
      homepage: "https://nextjs.org",
      htmlUrl: "https://github.com/vercel/next.js",
    });
    expect((f as unknown as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]).toContain(
      "https://api.github.com/repos/vercel/next.js",
    );
  });

  it("caches a successful lookup — one API call for many visitors", async () => {
    const f = mockFetchOnce(200, API_REPO_JSON);
    const fetchImpl = f as unknown as typeof fetch;
    await fetchGithubRepoInfo("vercel", "next.js", fetchImpl);
    await fetchGithubRepoInfo("vercel", "next.js", fetchImpl);
    await fetchGithubRepoInfo("vercel", "next.js", fetchImpl);
    expect((f as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
  });

  it("caches keys case-insensitively", async () => {
    const f = mockFetchOnce(200, API_REPO_JSON);
    const fetchImpl = f as unknown as typeof fetch;
    await fetchGithubRepoInfo("vercel", "next.js", fetchImpl);
    const again = await fetchGithubRepoInfo("Vercel", "Next.JS", fetchImpl);
    expect(again?.fullName).toBe("vercel/next.js");
    expect((f as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
  });

  it("404s return null and stick for the negative TTL", async () => {
    const f = mockFetchOnce(404, { message: "Not Found" });
    const fetchImpl = f as unknown as typeof fetch;
    expect(await fetchGithubRepoInfo("user", "missing", fetchImpl)).toBeNull();
    expect(await fetchGithubRepoInfo("user", "missing", fetchImpl)).toBeNull();
    expect((f as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
  });

  it("network failures return null without throwing", async () => {
    const f = vi.fn(async () => {
      throw new Error("boom");
    }) as unknown as typeof fetch;
    expect(await fetchGithubRepoInfo("user", "repo", f)).toBeNull();
  });

  it("null description/language/homepage collapse to null", async () => {
    const body = { ...API_REPO_JSON, description: null, language: null, homepage: "" };
    const f = mockFetchOnce(200, body);
    const info = await fetchGithubRepoInfo("vercel", "next.js", f as unknown as typeof fetch);
    expect(info?.description).toBeNull();
    expect(info?.language).toBeNull();
    expect(info?.homepage).toBeNull();
  });

  it("a tampered html_url never becomes the card href", async () => {
    const body = { ...API_REPO_JSON, html_url: "https://evil.example/phish" };
    const f = mockFetchOnce(200, body);
    const info = await fetchGithubRepoInfo("vercel", "next.js", f as unknown as typeof fetch);
    expect(info?.htmlUrl).toBe("https://github.com/vercel/next.js");
  });

  it("a non-https avatar url is dropped", async () => {
    const body = { ...API_REPO_JSON, owner: { login: "vercel", avatar_url: "http://evil.example/a.png" } };
    const f = mockFetchOnce(200, body);
    const info = await fetchGithubRepoInfo("vercel", "next.js", f as unknown as typeof fetch);
    expect(info?.ownerAvatarUrl).toBe("");
  });
});
