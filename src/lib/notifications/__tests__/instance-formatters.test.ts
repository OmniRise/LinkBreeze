/**
 * Formatter tests for instance-wide events and the generic provider (#13).
 * Pure fixtures: no DB, no fetch.
 */
import { describe, it, expect } from "vitest";
import { formatWebhookRequest } from "@/lib/notifications/formatters";
import { instanceDedupeKey, type NotificationEvent } from "@/lib/notifications/events";

const updateEvent: NotificationEvent = {
  type: "update",
  pageId: null,
  pageTitle: "",
  slug: null,
  title: "LinkBreeze v1.7.0 is available",
  message: "New embeds and the shared notification layer.\nInstalled: v1.6.2 - Latest: v1.7.0",
  dedupeKey: instanceDedupeKey("updates", "1.7.0"),
};

const milestoneEvent: NotificationEvent = {
  type: "milestone",
  pageId: 1,
  pageTitle: "My page",
  slug: "my-page",
  metric: "clicks",
  level: 100,
  total: 120,
  dedupeKey: "milestone:clicks:1:100",
};

describe("instance events through the classic providers", () => {
  it("discord: uses the event title and message, amber admin accent", () => {
    const req = formatWebhookRequest("discord", "https://d/1", updateEvent);
    const body = JSON.parse(req.body) as { embeds: Array<{ title: string; description: string }> };
    expect(body.embeds[0].title).toBe("LinkBreeze v1.7.0 is available");
    expect(body.embeds[0].description).toContain("New embeds");
    const admin = formatWebhookRequest(
      "discord",
      "https://d/1",
      { ...updateEvent, type: "admin", title: "Role assigned" },
    );
    expect((JSON.parse(admin.body) as { embeds: Array<{ color: number }> }).embeds[0].color).toBe(0xf59e0b);
  });

  it("slack: headline and body on separate lines", () => {
    const req = formatWebhookRequest("slack", "https://hooks.slack/x", updateEvent);
    const body = JSON.parse(req.body) as { text: string };
    expect(body.text).toContain("LinkBreeze v1.7.0 is available");
    expect(body.text).toContain("New embeds");
  });

  it("telegram: escapes HTML in the message body", () => {
    const req = formatWebhookRequest("telegram", "https://t/1", {
      ...updateEvent,
      message: "a <b> tag stays literal",
    });
    const body = JSON.parse(req.body) as { text: string; parse_mode: string };
    expect(body.parse_mode).toBe("HTML");
    expect(body.text).toContain("&lt;b&gt;");
  });

  it("ntfy: title header from the event title", () => {
    const req = formatWebhookRequest("ntfy", "https://ntfy/1", updateEvent);
    expect(req.headers.Title).toBe("LinkBreeze v1.7.0 is available");
    expect(req.body).toContain("New embeds");
  });
});

describe("generic provider (Zapier/Make/n8n contract)", () => {
  it("posts canonical JSON with the documented field names", () => {
    const req = formatWebhookRequest("generic", "https://hooks.zapier/1", milestoneEvent);
    expect(req.headers["Content-Type"]).toBe("application/json");
    const body = JSON.parse(req.body) as Record<string, unknown>;
    expect(body).toMatchObject({
      type: "milestone",
      pageId: 1,
      pageTitle: "My page",
      slug: "my-page",
      metric: "clicks",
      level: 100,
      total: 120,
      title: "LinkBreeze milestone",
      message: "My page hit 100 clicks (total: 120).",
      dedupeKey: "milestone:clicks:1:100",
    });
    expect(typeof body.occurredAt).toBe("string");
  });

  it("instance events carry null page fields, not milestone leftovers", () => {
    const req = formatWebhookRequest("generic", "https://n8n/1", updateEvent);
    const body = JSON.parse(req.body) as Record<string, unknown>;
    expect(body).toMatchObject({
      type: "update",
      pageId: null,
      pageTitle: null,
      slug: null,
      metric: null,
      title: "LinkBreeze v1.7.0 is available",
    });
  });

  it("every provider returns a request for any event type (exhaustive)", () => {
    const types: NotificationEvent["type"][] = [
      "milestone",
      "test",
      "form_submission",
      "subscriber",
      "admin",
      "update",
      "digest",
    ];
    for (const type of types) {
      const event: NotificationEvent = {
        ...updateEvent,
        type,
        dedupeKey: `x:${type}`,
      };
      for (const provider of ["discord", "slack", "telegram", "ntfy", "generic"] as const) {
        const req = formatWebhookRequest(provider, "https://x/1", event);
        expect(req.body.length).toBeGreaterThan(0);
      }
    }
  });
});
