/**
 * Provider payload formatters (#13).
 *
 * PURE module: no @/db, no fetch. Takes the canonical NotificationEvent and
 * produces the exact JSON body (plus required headers) each provider expects.
 * Fixture-testable.
 */

import {
  eventSummary,
  eventTitle,
  type NotificationEvent,
  type NotificationProvider,
} from "./events";

export interface WebhookRequest {
  url: string;
  headers: Record<string, string>;
  body: string;
}

interface DiscordEmbed {
  title: string;
  description: string;
  color: number;
}

interface DiscordPayload {
  content?: string;
  embeds?: DiscordEmbed[];
}

/** Per-type embed accent colors (Discord). */
function discordColor(event: NotificationEvent): number {
  switch (event.type) {
    case "test":
      return 0x22c55e; // green
    case "admin":
      return 0xf59e0b; // amber — attention without alarm
    case "update":
      return 0x38bdf8; // sky
    default:
      return 0xa78bfa; // brand violet
  }
}

function discordBody(event: NotificationEvent): DiscordPayload {
  return {
    embeds: [
      {
        title: eventTitle(event),
        description: eventSummary(event),
        color: discordColor(event),
      },
    ],
  };
}

/** Escape HTML special chars for Telegram parse_mode=HTML. */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Slack/Telegram multi-line message: headline + body. */
function flatMessage(event: NotificationEvent): string {
  return `${eventTitle(event)}\n${eventSummary(event)}`;
}

/**
 * The provider-agnostic payload (`generic` provider): the canonical event as
 * plain JSON. This is what Zapier, Make and n8n parse — field names are the
 * stable contract documented in the webhook recipes.
 */
function genericBody(event: NotificationEvent): string {
  return JSON.stringify({
    type: event.type,
    pageId: event.pageId,
    pageTitle: event.pageTitle || null,
    slug: event.slug,
    metric: event.metric ?? null,
    level: event.level ?? null,
    total: event.total ?? null,
    title: eventTitle(event),
    message: eventSummary(event),
    dedupeKey: event.dedupeKey,
    occurredAt: new Date().toISOString(),
  });
}

export function formatWebhookRequest(
  provider: NotificationProvider,
  url: string,
  event: NotificationEvent,
): WebhookRequest {
  const summary = eventSummary(event);
  switch (provider) {
    case "discord":
      return {
        url,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(discordBody(event)),
      };
    case "slack":
      return {
        url,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: flatMessage(event) }),
      };
    case "telegram":
      return {
        url,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: `<b>LinkBreeze</b>\n${escapeHtml(flatMessage(event))}`,
          parse_mode: "HTML",
        }),
      };
    case "ntfy":
      // ntfy accepts a plain-text POST body; the title rides a header.
      return {
        url,
        headers: {
          "Content-Type": "text/plain",
          Title: eventTitle(event),
        },
        body: summary,
      };
    case "generic":
      return {
        url,
        headers: { "Content-Type": "application/json" },
        body: genericBody(event),
      };
  }
}
