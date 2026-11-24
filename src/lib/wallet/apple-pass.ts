import { PKPass } from "passkit-generator";
import { X509Certificate } from "node:crypto";
import { renderPassIcon } from "./qr-icon";

/**
 * Apple Wallet pass builder — pure module over passkit-generator, no DB.
 *
 * BYO credentials via env:
 *   APPLE_WALLET_CERT_PEM      signer certificate (Pass Type ID cert)
 *   APPLE_WALLET_KEY_PEM       signer private key (PEM)
 *   APPLE_WALLET_KEY_PASSPHRASE  optional key passphrase
 *   APPLE_WALLET_WWDR_PEM      Apple WWDR intermediate certificate
 *   APPLE_WALLET_TEAM_ID       10-char team identifier
 *   APPLE_WALLET_PASS_TYPE_ID  e.g. pass.com.example.linkbreeze
 *
 * The generated .pkpass is a STATIC business card: front = name + QR to
 * the live page, back = top-links snapshot + saved-on date. No update web
 * service (no APNs) in v1 — passes are frozen at install; the QR always
 * opens the live page.
 *
 * Tests use in-test generated self-signed certs: they exercise packaging,
 * manifest, and signing CODE PATHS but produce passes no device accepts.
 * Real-device validation is a manual runbook step (docs).
 */

export interface AppleWalletCreds {
  signerCert: Buffer;
  signerKey: Buffer;
  signerKeyPassphrase?: string;
  wwdr: Buffer;
  teamId: string;
  passTypeId: string;
}

export interface ApplePassInput {
  slug: string;
  title: string;
  origin: string;
  backgroundColor: string; // "rgb(r g b)" or #hex — normalized before use
  foregroundColor: string;
  /** Top active links snapshot for the back fields. */
  links: Array<{ title: string; url: string }>;
  savedOn: string;
}

/** All six env values present → the wallet button may render. */
export function parseAppleCreds(env: NodeJS.ProcessEnv): AppleWalletCreds | null {
  const { APPLE_WALLET_CERT_PEM, APPLE_WALLET_KEY_PEM, APPLE_WALLET_KEY_PASSPHRASE, APPLE_WALLET_WWDR_PEM, APPLE_WALLET_TEAM_ID, APPLE_WALLET_PASS_TYPE_ID } = env;
  if (
    !APPLE_WALLET_CERT_PEM?.trim() ||
    !APPLE_WALLET_KEY_PEM?.trim() ||
    !APPLE_WALLET_WWDR_PEM?.trim() ||
    !APPLE_WALLET_TEAM_ID?.trim() ||
    !APPLE_WALLET_PASS_TYPE_ID?.trim()
  ) {
    return null;
  }
  if (!APPLE_WALLET_PASS_TYPE_ID.trim().startsWith("pass.")) return null;
  return {
    signerCert: Buffer.from(APPLE_WALLET_CERT_PEM),
    signerKey: Buffer.from(APPLE_WALLET_KEY_PEM),
    ...(APPLE_WALLET_KEY_PASSPHRASE?.trim()
      ? { signerKeyPassphrase: APPLE_WALLET_KEY_PASSPHRASE.trim() }
      : {}),
    wwdr: Buffer.from(APPLE_WALLET_WWDR_PEM),
    teamId: APPLE_WALLET_TEAM_ID.trim(),
    passTypeId: APPLE_WALLET_PASS_TYPE_ID.trim(),
  };
}

/** Parse the notAfter date from a PEM certificate (expiry indicator).
 *  validToDate is Node 24+ only — fall back to the legacy `validTo` string
 *  (same instant, string form) so Node 20/22 LTS keeps working. */
export function certExpiry(pem: string): Date | null {
  try {
    const cert = new X509Certificate(pem);
    const date = cert.validToDate ?? new Date(cert.validTo);
    return Number.isNaN(date.getTime()) ? null : date;
  } catch {
    return null;
  }
}

/** #rrggbb → "rgb(r, g, b)" (passkit-generator validates comma-separated form). */
export function toRgbString(hex: string, fallback: string): string {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return fallback;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgb(${r}, ${g}, ${b})`;
}

const ICON_SIZE = 87; // 29pt @3x — Apple minimum-compliant icon source

/**
 * Build the .pkpass binary. Returns null when creds/input are unusable —
 * callers 503/404 accordingly.
 */
export async function buildApplePass(
  creds: AppleWalletCreds,
  input: ApplePassInput,
): Promise<Buffer | null> {
  try {
    const icon = await renderPassIcon(
      `${input.origin}/${input.slug}`,
      ICON_SIZE,
    );

    const pass = new PKPass(
      {
        "icon.png": icon,
        "icon@2x.png": icon,
        "icon@3x.png": icon,
      },
      {
        wwdr: creds.wwdr,
        signerCert: creds.signerCert,
        signerKey: creds.signerKey,
        ...(creds.signerKeyPassphrase
          ? { signerKeyPassphrase: creds.signerKeyPassphrase }
          : {}),
      },
      {
        formatVersion: 1,
        passTypeIdentifier: creds.passTypeId,
        teamIdentifier: creds.teamId,
        serialNumber: `linkbreeze-${input.slug}-${Date.now().toString(36)}`,
        organizationName: input.title || input.slug,
        description: `LinkBreeze card for ${input.slug}`,
        logoText: input.title || input.slug,
        backgroundColor: toRgbString(input.backgroundColor, "rgb(26 26 46)"),
        foregroundColor: toRgbString(input.foregroundColor, "rgb(255 255 255)"),
        labelColor: toRgbString(input.foregroundColor, "rgb(255 255 255)"),
        sharingProhibited: false,
      },
    );
    pass.type = "storeCard";

    // Front: the page identity. URL is the QR payload (rendered as icon).
    pass.primaryFields.push(
      { key: "page", label: "Links", value: `${input.origin}/${input.slug}` },
    );
    pass.secondaryFields.push(
      { key: "handle", label: "Handle", value: input.slug },
      { key: "saved", label: "Saved on", value: input.savedOn },
    );

    // Back: link snapshot (staleness is inherent — labeled on the card).
    for (const [i, l] of input.links.slice(0, 8).entries()) {
      pass.backFields.push({
        key: `link-${i}`,
        label: l.title.slice(0, 40),
        value: l.url,
      });
    }

    pass.setBarcodes({
      message: `${input.origin}/${input.slug}`,
      format: "PKBarcodeFormatQR",
    });

    return pass.getAsBuffer();
  } catch {
    return null;
  }
}
