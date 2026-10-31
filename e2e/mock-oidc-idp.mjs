// Minimal-but-honest mock OIDC provider for the #124 round-trip test.
// Implements discovery, authorize (auto-consent), token (validates PKCE!),
// and userinfo over http://localhost:9999 — which the app accepts only in
// non-production, so the standalone server must run with NODE_ENV != production.
import { createHash } from "node:crypto";
import http from "node:http";

const ISSUER = "http://localhost:9999";
const CLIENT_ID = "e2e-client-id";
const CLIENT_SECRET = "e2e-client-secret";
const SUB = "test-sub-42";
const USERNAME = "sso.tester";
const ACCESS = "mock-access-token";
/** Groups the mock IdP attests — mapped to a role in the round-trip test. */
const GROUPS = ["sso-editors", "all-staff"];

/** code → { codeVerifier (challenge to check), redirectUri } */
const codes = new Map();

const server = http.createServer((req, res) => {
  const url = new URL(req.url, ISSUER);
  if (url.pathname === "/.well-known/openid-configuration") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({
      issuer: ISSUER,
      authorization_endpoint: `${ISSUER}/authorize`,
      token_endpoint: `${ISSUER}/token`,
      userinfo_endpoint: `${ISSUER}/userinfo`,
      response_types_supported: ["code"],
    }));
    return;
  }
  if (url.pathname === "/authorize") {
    // Validate like a real IdP: client + redirect_uri + state must be present.
    const redirect = url.searchParams.get("redirect_uri");
    const state = url.searchParams.get("state");
    const challenge = url.searchParams.get("code_challenge");
    if (url.searchParams.get("client_id") !== CLIENT_ID || !redirect || !state || !challenge) {
      res.writeHead(400).end("bad authorize request");
      return;
    }
    const code = `code-${Math.random().toString(36).slice(2)}`;
    codes.set(code, { challenge, redirect });
    const sep = redirect.includes("?") ? "&" : "?";
    res.writeHead(302, { location: `${redirect}${sep}code=${code}&state=${encodeURIComponent(state)}` });
    res.end();
    return;
  }
  if (url.pathname === "/token" && req.method === "POST") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const p = new URLSearchParams(body);
      const record = codes.get(p.get("code"));
      const fail = (msg) => { res.writeHead(400, { "content-type": "application/json" }); res.end(JSON.stringify({ error: msg })); };
      if (!record) return fail("invalid_grant"); // unknown/replayed code
      if (p.get("client_id") !== CLIENT_ID || p.get("client_secret") !== CLIENT_SECRET) return fail("invalid_client");
      if (p.get("redirect_uri") !== record.redirect) return fail("invalid_grant");
      // PKCE S256 verification — the app MUST send the right verifier.
      const expected = createHash("sha256").update(p.get("code_verifier") ?? "").digest("base64url");
      if (expected !== record.challenge) return fail("invalid_grant: pkce mismatch");
      codes.delete(p.get("code")); // single-use
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ access_token: ACCESS, token_type: "Bearer" }));
    });
    return;
  }
  if (url.pathname === "/userinfo") {
    if (req.headers.authorization !== `Bearer ${ACCESS}`) {
      res.writeHead(401).end("unauthorized");
      return;
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ sub: SUB, preferred_username: USERNAME, email: "sso@example.com", groups: GROUPS }));
    return;
  }
  res.writeHead(404).end();
});

server.listen(9999, "127.0.0.1", () => console.log("mock IdP ready on http://localhost:9999"));
