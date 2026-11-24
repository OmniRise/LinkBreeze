import { describe, it, expect } from "vitest";

import { parseGithubRepoUrl, resolveEmbedFrame } from "@/lib/embed-providers";

describe("resolveEmbedFrame — existing providers (regression)", () => {
  it("youtube watch URLs", () => {
    const e = resolveEmbedFrame("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    expect(e?.src).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0&modestbranding=1");
    expect(e?.provider).toBe("youtube");
  });

  it("youtu.be short links", () => {
    expect(resolveEmbedFrame("https://youtu.be/abc123")?.src).toContain("/embed/abc123");
  });

  it("youtube shorts and /embed/ paths", () => {
    expect(resolveEmbedFrame("https://youtube.com/shorts/dQw4w9WgXcQ?feature=share")?.src).toContain("/embed/dQw4w9WgXcQ");
    expect(resolveEmbedFrame("https://youtube-nocookie.com/embed/dQw4w9WgXcQ")?.src).toContain("/embed/dQw4w9WgXcQ");
  });

  it("spotify strips a pasted /embed/ prefix", () => {
    const e = resolveEmbedFrame("https://open.spotify.com/embed/playlist/abc");
    expect(e?.src).toBe("https://open.spotify.com/embed/playlist/abc");
    expect(e?.aspect).toBe("auto");
    expect(e?.height).toBe(152);
  });

  it("vimeo", () => {
    expect(resolveEmbedFrame("https://vimeo.com/12345")?.src).toBe("https://player.vimeo.com/video/12345");
  });

  it("soundcloud keeps a caption", () => {
    const e = resolveEmbedFrame("https://soundcloud.com/artist/track");
    expect(e?.provider).toBe("soundcloud");
    expect(e?.caption).toBe(true);
  });

  it("bandcamp without album_id falls back to null", () => {
    expect(resolveEmbedFrame("https://bandcamp.com/some-album")).toBeNull();
    expect(resolveEmbedFrame("https://bandcamp.com/?seek_to=1&album_id=123")?.src).toContain("album=123");
  });

  it("unknown providers and malformed URLs return null", () => {
    expect(resolveEmbedFrame("https://example.com/video/1")).toBeNull();
    expect(resolveEmbedFrame("not a url")).toBeNull();
  });

  it("non-https URLs never produce a frame (legacy/restored rows)", () => {
    expect(resolveEmbedFrame("http://youtube.com/watch?v=dQw4w9WgXcQ")).toBeNull();
    expect(resolveEmbedFrame("javascript:alert(1)")).toBeNull();
  });

  it("youtube/vimeo ids with non-token characters are rejected (src-template injection)", () => {
    expect(resolveEmbedFrame("https://youtube.com/watch?v=x?<script>")).toBeNull();
    expect(resolveEmbedFrame("https://youtube.com/watch?v=..%2F..%2F")).toBeNull();
    expect(resolveEmbedFrame("https://vimeo.com/<script>alert</script>")).toBeNull();
    expect(resolveEmbedFrame("https://vimeo.com/12345678")).not.toBeNull();
  });
});

describe("resolveEmbedFrame — dailymotion", () => {
  it("standard video URLs", () => {
    const e = resolveEmbedFrame("https://www.dailymotion.com/video/x8abc12");
    expect(e?.src).toBe("https://www.dailymotion.com/embed/video/x8abc12?autoplay=0");
    expect(e?.provider).toBe("dailymotion");
    expect(e?.aspect).toBe("16 / 9");
  });

  it("dai.ly short links", () => {
    expect(resolveEmbedFrame("https://dai.ly/x8abc12")?.src).toContain("/embed/video/x8abc12");
  });

  it("pasted embed URLs", () => {
    expect(resolveEmbedFrame("https://dailymotion.com/embed/video/x8abc12")?.src).toContain("/embed/video/x8abc12");
  });

  it("non-video paths return null", () => {
    expect(resolveEmbedFrame("https://www.dailymotion.com/channel/mychannel")).toBeNull();
  });
});

describe("resolveEmbedFrame — twitch", () => {
  const host = { twitchParent: "links.example.com" };

  it("VOD URLs build a player with parent", () => {
    const e = resolveEmbedFrame("https://www.twitch.tv/videos/123456789", host);
    expect(e?.src).toBe("https://player.twitch.tv/?video=123456789&parent=links.example.com&autoplay=false");
    expect(e?.provider).toBe("twitch");
  });

  it("channel URLs build a channel player with parent", () => {
    const e = resolveEmbedFrame("https://twitch.tv/somechannel", host);
    expect(e?.src).toBe("https://player.twitch.tv/?channel=somechannel&parent=links.example.com&autoplay=false");
  });

  it("site paths are not channels", () => {
    expect(resolveEmbedFrame("https://twitch.tv/directory", host)).toBeNull();
    expect(resolveEmbedFrame("https://twitch.tv/settings", host)).toBeNull();
  });

  it("clips resolve with parent", () => {
    const e = resolveEmbedFrame("https://clips.twitch.tv/FunnyClipSlug", host);
    expect(e?.src).toBe("https://clips.twitch.tv/embed?clip=FunnyClipSlug&parent=links.example.com");
  });

  it("channel/clip paths resolve the slug", () => {
    const e = resolveEmbedFrame("https://www.twitch.tv/somechannel/clip/FunnyClipSlug", host);
    expect(e?.src).toContain("clip=FunnyClipSlug");
  });

  it("without a parent host, no frame can be built", () => {
    expect(resolveEmbedFrame("https://twitch.tv/somechannel")).toBeNull();
    expect(resolveEmbedFrame("https://clips.twitch.tv/FunnyClipSlug", {})).toBeNull();
  });
});

describe("resolveEmbedFrame — rumble", () => {
  it("embed URLs pass through", () => {
    const e = resolveEmbedFrame("https://rumble.com/embed/vabc123/?pub=4");
    expect(e?.src).toBe("https://rumble.com/embed/vabc123/?pub=4");
    expect(e?.provider).toBe("rumble");
  });

  it("watch/share URLs need an oEmbed round-trip — null for now", () => {
    expect(resolveEmbedFrame("https://rumble.com/vabc123-some-video.html")).toBeNull();
  });
});

describe("parseGithubRepoUrl", () => {
  it("owner/repo roots", () => {
    expect(parseGithubRepoUrl("https://github.com/vercel/next.js")).toEqual({
      owner: "vercel",
      repo: "next.js",
    });
  });

  it("deep paths still point at the repo", () => {
    expect(parseGithubRepoUrl("https://github.com/vercel/next.js/blob/canary/readme.md")?.repo).toBe("next.js");
    expect(parseGithubRepoUrl("https://github.com/vercel/next.js/issues/1")?.repo).toBe("next.js");
  });

  it(".git suffixes are stripped", () => {
    expect(parseGithubRepoUrl("https://github.com/user/repo.git")?.repo).toBe("repo");
  });

  it("reserved roots are never treated as owners", () => {
    expect(parseGithubRepoUrl("https://github.com/topics/embed")).toBeNull();
    expect(parseGithubRepoUrl("https://github.com/orgs/vercel/repositories")).toBeNull();
    expect(parseGithubRepoUrl("https://github.com/features/actions")).toBeNull();
  });

  it("single-segment, non-github and malformed URLs return null", () => {
    expect(parseGithubRepoUrl("https://github.com/vercel")).toBeNull();
    expect(parseGithubRepoUrl("https://gitlab.com/user/repo")).toBeNull();
    expect(parseGithubRepoUrl("https://github.com/")).toBeNull();
    expect(parseGithubRepoUrl("nonsense")).toBeNull();
  });
});
