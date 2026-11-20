"use server";

import { getSession } from "@/lib/auth";
import { fetchOgData } from "@/lib/og-fetcher";

/**
 * Rich-card live preview (#link-dialog): resolve the Open Graph image +
 * description for a URL the operator is CURRENTLY TYPING in the Add/Edit
 * link dialog, so the card preview can show the rich layout before the
 * link is saved (the save-time fetch in actions/links.ts only runs once).
 *
 * Read-only surface: session-gated (an unauthenticated caller gets null
 * fields, never an error shape to distinguish), http(s)-only (the same
 * scheme gate the public page's href validation applies — file:/data: and
 * friends never reach fetch), and every failure mode degrades to null
 * fields so the preview silently keeps the compact fallback, exactly like
 * the public page renders a rich card whose OG fetch found no image.
 *
 * The returned imageUrl is the LOCALLY CACHED path (/api/uploads/og-<hash>)
 * from the shared og-fetcher — the save-time fetch hits the same cache, so
 * a previewed link does not re-download the image when it is saved.
 */
export async function previewOgData(
  url: string,
): Promise<{ imageUrl: string | null; description: string | null }> {
  const session = await getSession();
  if (!session) {
    return { imageUrl: null, description: null };
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { imageUrl: null, description: null };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { imageUrl: null, description: null };
  }

  try {
    const og = await fetchOgData(url);
    return { imageUrl: og.imageUrl, description: og.description };
  } catch {
    return { imageUrl: null, description: null };
  }
}
