import { describe, it, expect } from "vitest";
import { isForbiddenIp } from "@/lib/private-ip";

/** Security audit CD-2 — the denylist behind the OG-fetch SSRF guard. */
describe("isForbiddenIp", () => {
  it("forbids loopback, private, link-local and metadata ranges (v4)", () => {
    for (const ip of [
      "127.0.0.1",
      "127.8.8.8",
      "10.0.0.5",
      "172.16.0.1",
      "172.31.255.255",
      "192.168.1.1",
      "169.254.169.254", // cloud metadata
      "0.0.0.0",
      "100.64.0.1", // CGNAT (Tailscale range)
      "198.18.0.1", // benchmarking
      "224.0.0.1", // multicast
      "255.255.255.255",
    ]) {
      expect(isForbiddenIp(ip), ip).toBe(true);
    }
  });

  it("forbids the v6 equivalents and v4-mapped forms", () => {
    for (const ip of ["::1", "::", "fe80::1", "fc00::5", "fd12::1", "ff02::1", "::ffff:10.0.0.5", "::ffff:169.254.169.254"]) {
      expect(isForbiddenIp(ip), ip).toBe(true);
    }
  });

  it("allows real public addresses", () => {
    for (const ip of ["8.8.8.8", "1.1.1.1", "203.0.113.9", "2606:4700::1111", "2a01:cb08::1"]) {
      expect(isForbiddenIp(ip), ip).toBe(false);
    }
  });

  it("allows public ranges that merely LOOK near forbidden ones", () => {
    // 172.32/12 is public; 169.255/16 is public; 100.65 would be CGNAT but 101.x is public
    expect(isForbiddenIp("172.32.0.1")).toBe(false);
    expect(isForbiddenIp("169.255.1.1")).toBe(false);
    expect(isForbiddenIp("101.0.0.1")).toBe(false);
  });

  it("treats garbage as forbidden", () => {
    expect(isForbiddenIp("not-an-ip")).toBe(true);
    expect(isForbiddenIp("999.1.1.1")).toBe(true);
  });
});
