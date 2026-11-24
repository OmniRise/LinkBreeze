/**
 * New embed providers (embed follow-up): Odysee inline; Google Forms, Tally,
 * Cal.com and TikTok as click-to-open (modal) providers; Google Maps both
 * keyless shapes. Registry is pure — no network, no DB.
 */
import { describe, it, expect } from "vitest";

import { resolveEmbedFrame } from "@/lib/embed-providers";

describe("Odysee (inline 16:9)", () => {
  it("channel/video URLs build the $/embed/ iframe", () => {
    const e = resolveEmbedFrame("https://odysee.com/@BibleTranslation/this-video:d");
    expect(e?.src).toBe("https://odysee.com/$/embed/@BibleTranslation/this-video:d");
    expect(e?.provider).toBe("odysee");
    expect(e?.aspect).toBe("16 / 9");
    expect(e?.mode ?? "inline").toBe("inline");
  });

  it("pasted /$/embed/ links normalize", () => {
    expect(resolveEmbedFrame("https://odysee.com/$/embed/@c/vid")?.src).toBe(
      "https://odysee.com/$/embed/@c/vid",
    );
  });

  it("paths not starting with @ are rejected", () => {
    expect(resolveEmbedFrame("https://odysee.com/notachannel/video")).toBeNull();
    expect(resolveEmbedFrame("https://odysee.com/")).toBeNull();
  });

  it("query strings are dropped from the rebuilt src (nothing unvalidated reaches it)", () => {
    const e = resolveEmbedFrame("https://odysee.com/@c/vid?next=/x");
    expect(e?.src).toBe("https://odysee.com/$/embed/@c/vid");
    expect(e?.src).not.toContain("next=");
    expect(resolveEmbedFrame("https://odysee.com/@c/<script>")).toBeNull();
  });
});

describe("Google Forms (modal)", () => {
  it("published /d/e/ viewform URLs embed with embedded=true", () => {
    const e = resolveEmbedFrame(
      "https://docs.google.com/forms/d/e/1FAIpQLSf9D3AhX0QviExampleForm/viewform",
    );
    expect(e?.mode).toBe("modal");
    expect(e?.label).toBe("Google Form");
    expect(e?.icon).toBe("clipboard-list");
    expect(e?.src).toBe(
      "https://docs.google.com/forms/d/e/1FAIpQLSf9D3AhX0QviExampleForm/viewform?embedded=true",
    );
  });

  it("legacy /forms/d/<ID>/viewform normalizes to /d/e/", () => {
    const e = resolveEmbedFrame(
      "https://docs.google.com/forms/d/1FAIpQLSf9D3AhX0QviExampleForm/viewform",
    );
    expect(e?.src).toContain("/forms/d/e/1FAIpQLSf9D3AhX0QviExampleForm/viewform?embedded=true");
  });

  it("edit URLs, short ids and non-form docs are rejected", () => {
    expect(
      resolveEmbedFrame("https://docs.google.com/forms/d/e/1FAIpQLSf9D3AhX0QviExampleForm/edit"),
    ).toBeNull();
    expect(resolveEmbedFrame("https://docs.google.com/forms/d/e/short/viewform")).toBeNull();
    expect(resolveEmbedFrame("https://docs.google.com/document/d/abc123/edit")).toBeNull();
  });
});

describe("Tally (modal)", () => {
  it("/r/ share links embed via the official embed endpoint", () => {
    const e = resolveEmbedFrame("https://tally.so/r/n9LOVp");
    expect(e?.mode).toBe("modal");
    expect(e?.label).toBe("Tally form");
    expect(e?.src).toBe("https://tally.so/embed/n9LOVp?alignLeft=1&hideTitle=1&transparentBackground=1");
  });

  it("/forms/<id> works; workspace paths are rejected", () => {
    expect(resolveEmbedFrame("https://tally.so/forms/abcXYZ123")?.src).toContain("/embed/abcXYZ123");
    expect(resolveEmbedFrame("https://tally.so/ workspace/invite")).toBeNull();
    expect(resolveEmbedFrame("https://tally.so/pricing")).toBeNull();
  });
});

describe("Cal.com (modal)", () => {
  it("user and user/event booking pages embed with ?embed=true", () => {
    const user = resolveEmbedFrame("https://cal.com/jane-doe");
    expect(user?.mode).toBe("modal");
    expect(user?.label).toBe("Cal.com booking");
    expect(user?.icon).toBe("calendar");
    expect(user?.src).toBe("https://cal.com/jane-doe?embed=true");

    const event = resolveEmbedFrame("https://cal.com/jane-doe/30min-intro");
    expect(event?.src).toBe("https://cal.com/jane-doe/30min-intro?embed=true");
  });

  it("site pages (reserved roots) are rejected", () => {
    expect(resolveEmbedFrame("https://cal.com/pricing")).toBeNull();
    expect(resolveEmbedFrame("https://cal.com/blog/some-post")).toBeNull();
    expect(resolveEmbedFrame("https://cal.com/embed")).toBeNull();
  });

  it("deeper paths and junk characters are rejected; query strings dropped", () => {
    expect(resolveEmbedFrame("https://cal.com/user/event/extra")).toBeNull();
    expect(resolveEmbedFrame("https://cal.com/<user>")).toBeNull();
    const e = resolveEmbedFrame("https://cal.com/user/event?evil=<x>");
    expect(e?.src).toBe("https://cal.com/user/event?embed=true");
    expect(e?.src).not.toContain("evil");
  });
});

describe("TikTok (modal, portrait 9:16)", () => {
  it("video URLs build the embed/v2 iframe with a portrait ratio", () => {
    const e = resolveEmbedFrame("https://www.tiktok.com/@somecreator/video/7301234567890123456");
    expect(e?.mode).toBe("modal");
    expect(e?.label).toBe("TikTok");
    expect(e?.icon).toBe("music-2");
    expect(e?.src).toBe("https://www.tiktok.com/embed/v2/7301234567890123456");
    expect(e?.aspect).toBe("9 / 16");
  });

  it("m.tiktok.com works; photo posts, short ids and non-video paths are rejected", () => {
    expect(resolveEmbedFrame("https://m.tiktok.com/@user/video/7301234567890123456")?.src).toContain(
      "/embed/v2/7301234567890123456",
    );
    expect(resolveEmbedFrame("https://www.tiktok.com/@user/photo/7301234567890123456")).toBeNull();
    expect(resolveEmbedFrame("https://www.tiktok.com/@user/video/12345")).toBeNull();
    expect(resolveEmbedFrame("https://www.tiktok.com/t/ZTabcdef/")).toBeNull();
  });
});

describe("Google Maps (inline, keyless)", () => {
  const PB =
    "!1m14!1s0x0:0x0!2m2!1m1!1e2!3m2!1m1!1e1!5m1!1e4!8x0Y1z2A3b4C5d6E7f8G9h0I1j2K3l4M5n6O7p8Q9r0S1t2U3v4W5x6Y7z8A9b0C1d2";

  it("?pb= embed URLs pass through verbatim", () => {
    const e = resolveEmbedFrame(`https://www.google.com/maps/embed?pb=${PB}`);
    expect(e?.provider).toBe("gmaps");
    expect(e?.src).toBe(`https://www.google.com/maps/embed?pb=${PB}`);
    expect(e?.aspect).toBe("16 / 9");
    expect(e?.mode ?? "inline").toBe("inline");
  });

  it("short/garbage pb blobs are rejected", () => {
    expect(resolveEmbedFrame("https://www.google.com/maps/embed?pb=tooshort")).toBeNull();
    expect(resolveEmbedFrame("https://www.google.com/maps/embed")).toBeNull();
    expect(resolveEmbedFrame(`https://www.google.com/maps/embed?pb=${PB}<script>`)).toBeNull();
  });

  it("place/search/@coords URLs delegate to the #93 keyless builder", () => {
    const place = resolveEmbedFrame("https://www.google.com/maps/place/Eiffel+Tower/@48.8584,2.2945,17z");
    expect(place?.provider).toBe("gmaps");
    expect(place?.src).toContain("maps.google.com/maps?q=");
    expect(place?.src).toContain("output=embed");

    const coords = resolveEmbedFrame("https://maps.google.com/maps/@48.8584,2.2945,15z");
    expect(coords?.src).toContain("q=48.8584,2.2945&z=15&output=embed");
  });

  it("non-Maps google.com URLs are rejected", () => {
    expect(resolveEmbedFrame("https://www.google.com/search?q=maps")).toBeNull();
    expect(resolveEmbedFrame("https://maps.app.goo.gl/AbCdEf123456")).toBeNull();
  });
});

describe("modal vs inline modes (the click-to-open contract)", () => {
  it("tall/portrait providers are modal; media players stay inline", () => {
    const modal = [
      resolveEmbedFrame("https://www.tiktok.com/@c/video/7301234567890123456"),
      resolveEmbedFrame("https://cal.com/jane"),
      resolveEmbedFrame("https://docs.google.com/forms/d/e/1FAIpQLSf9D3AhX0QviExampleForm/viewform"),
      resolveEmbedFrame("https://tally.so/r/n9LOVp"),
    ];
    for (const e of modal) {
      expect(e?.mode).toBe("modal");
    }
    const inline = [
      resolveEmbedFrame("https://odysee.com/@c/vid"),
      resolveEmbedFrame(`https://www.google.com/maps/embed?pb=${"!1m14".padEnd(60, "x")}`),
      resolveEmbedFrame("https://www.youtube.com/watch?v=dQw4w9WgXcQ"),
    ];
    for (const e of inline) {
      expect(e?.mode ?? "inline").toBe("inline");
    }
  });
});
