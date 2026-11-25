/**
 * Addresses that must never be fetched by server-side fetches (security
 * audit CD-2): loopback, RFC 1918, link-local (incl. cloud-metadata
 * 169.254.169.254), CGNAT, benchmark, multicast, and their IPv6 equivalents
 * — including IPv4-mapped IPv6. Pure so the unit tests stay cheap.
 */
export function isForbiddenIp(ip: string): boolean {
  let addr = ip.trim().toLowerCase();

  // IPv4-mapped IPv6 (::ffff:a.b.c.d) — judge by the embedded v4.
  const mapped = addr.match(/^::ffff:(.+)$/);
  if (mapped) addr = mapped[1];

  if (addr.includes(":")) return isForbiddenIpv6(addr);
  return isForbiddenIpv4(addr);
}

function isForbiddenIpv4(ip: string): boolean {
  const m = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return true; // not a parseable v4 — treat as forbidden
  const [a, b] = [Number(m[1]), Number(m[2])];
  if ([a, b].some((n) => n > 255)) return true;
  if (a === 0) return true; // "this network" (0.0.0.0/8)
  if (a === 10) return true; // RFC 1918 private
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64.0.0/10 (Tailscale)
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local / cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // RFC 1918 private
  if (a === 192 && b === 168) return true; // RFC 1918 private
  if (a === 192 && b === 0) return true; // 192.0.0.0/24 + 192.0.2.0/24 TEST-NET
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking 198.18.0.0/15
  if (a >= 224) return true; // multicast 224/4 + reserved 240/4 + broadcast
  return false;
}

function isForbiddenIpv6(ip: string): boolean {
  if (ip === "::" || ip === "::1") return true; // unspecified + loopback
  if (ip.startsWith("fc") || ip.startsWith("fd")) return true; // ULA fc00::/7
  if (ip.startsWith("fe8") || ip.startsWith("fe9") || ip.startsWith("fea") || ip.startsWith("feb"))
    return true; // link-local fe80::/10
  if (ip.startsWith("ff")) return true; // multicast ff00::/8
  if (ip === "::1" || ip.startsWith("::1")) return true;
  return false;
}
