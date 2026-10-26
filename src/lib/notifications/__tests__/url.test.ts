import { describe, expect, it } from "vitest";
import { isValidWebhookUrl } from "@/lib/notifications/url";

describe("isValidWebhookUrl", () => {
  it("accepts http and https", () => {
    expect(isValidWebhookUrl("https://discord.com/api/webhooks/1/abc")).toBe(true);
    expect(isValidWebhookUrl("http://192.168.1.10:8080/ntfy/topic")).toBe(true);
  });

  it("rejects other schemes and garbage", () => {
    expect(isValidWebhookUrl("file:///etc/passwd")).toBe(false);
    expect(isValidWebhookUrl("data:text/plain,hi")).toBe(false);
    expect(isValidWebhookUrl("ftp://host/x")).toBe(false);
    expect(isValidWebhookUrl("javascript:alert(1)")).toBe(false);
    expect(isValidWebhookUrl("not a url")).toBe(false);
    expect(isValidWebhookUrl("")).toBe(false);
    expect(isValidWebhookUrl(null)).toBe(false);
    expect(isValidWebhookUrl(42)).toBe(false);
  });

  it("rejects absurdly long urls", () => {
    expect(isValidWebhookUrl(`https://x.test/${"a".repeat(3000)}`)).toBe(false);
  });
});
