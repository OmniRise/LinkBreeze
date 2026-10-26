import { describe, expect, it } from "vitest";
import { formatWebhookRequest } from "@/lib/notifications/formatters";
import {
  eventSummary,
  milestoneDedupeKey,
  type NotificationEvent,
} from "@/lib/notifications/events";

function milestoneEvent(overrides: Partial<NotificationEvent> = {}): NotificationEvent {
  return {
    type: "milestone",
    pageId: 3,
    pageTitle: "Studio",
    slug: "studio",
    metric: "clicks",
    level: 100,
    total: 123,
    dedupeKey: milestoneDedupeKey(7, "clicks", 100),
    ...overrides,
  };
}

describe("formatters", () => {
  it("discord: embed with summary", () => {
    const req = formatWebhookRequest("discord", "https://discord.example/hook", milestoneEvent());
    expect(req.headers["Content-Type"]).toBe("application/json");
    const parsed = JSON.parse(req.body);
    expect(parsed.embeds).toHaveLength(1);
    expect(parsed.embeds[0].description).toContain("hit 100 clicks");
    expect(parsed.embeds[0].color).toBe(0xa78bfa);
  });

  it("slack: plain text payload", () => {
    const req = formatWebhookRequest("slack", "https://hooks.slack.com/x", milestoneEvent());
    const parsed = JSON.parse(req.body);
    expect(Object.keys(parsed)).toEqual(["text"]);
    expect(parsed.text).toContain("100 clicks");
  });

  it("telegram: HTML parse mode with escaped page title", () => {
    const req = formatWebhookRequest(
      "telegram",
      "https://api.telegram.example/send",
      milestoneEvent({ pageTitle: 'A <b> & "B"' }),
    );
    const parsed = JSON.parse(req.body);
    expect(parsed.parse_mode).toBe("HTML");
    expect(parsed.text).toContain("A &lt;b&gt; &amp; \"B\"");
    expect(parsed.text).not.toMatch(/<b> &/);
  });

  it("ntfy: plain text body with title header", () => {
    const req = formatWebhookRequest("ntfy", "https://ntfy.sh/lb-abc", milestoneEvent());
    expect(req.headers["Content-Type"]).toBe("text/plain");
    expect(req.headers.Title).toBe("LinkBreeze milestone");
    expect(req.body).toContain("hit 100 clicks");
  });

  it("test events produce a distinct green discord embed", () => {
    const req = formatWebhookRequest(
      "discord",
      "https://discord.example/hook",
      milestoneEvent({ type: "test", level: 0, total: 0, dedupeKey: "test:7" }),
    );
    const parsed = JSON.parse(req.body);
    expect(parsed.embeds[0].title).toBe("LinkBreeze test notification");
    expect(parsed.embeds[0].color).toBe(0x22c55e);
  });

  it("falls back to slug when page title empty", () => {
    expect(eventSummary(milestoneEvent({ pageTitle: "" }))).toContain("/studio");
  });
});
