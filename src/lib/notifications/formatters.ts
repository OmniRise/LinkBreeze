/**
 * Provider payload formatters (#13).
 *
 * PURE module: no @/db, no fetch. Takes the canonical NotificationEvent and
 * produces the exact JSON body (plus required headers) each provider expects.
 * Fixture-testable.
 */

import {
  eventSummary,
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

function discordBody(event: NotificationEvent): DiscordPayload {
  const embed: DiscordEmbed = {
    title: "LinkBreeze milestone",
    description: eventSummary(event),
    color: 0xa78bfa,
  };
  if (event.type === "test") {
    embed.title = "LinkBreeze test notification";
    embed.color = 0x22c55e;
  }
  return { embeds: [embed] };
}

/** Escape HTML special chars for Telegram parse_mode=HTML. */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
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
        body: JSON.stringify({ text: summary }),
      };
    case "telegram":
      return {
        url,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: `<b>LinkBreeze</b>\n${escapeHtml(summary)}`,
          parse_mode: "HTML",
        }),
      };
    case "ntfy":
      // ntfy accepts a plain-text POST body; the title rides a header.
      return {
        url,
        headers: {
          "Content-Type": "text/plain",
          Title: event.type === "test" ? "LinkBreeze test notification" : "LinkBreeze milestone",
        },
        body: summary,
      };
  }
}
