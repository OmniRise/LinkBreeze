"use client";

import * as React from "react";
import { MarkdownLite } from "@/components/public/MarkdownLite";

/**
 * Live preview for #93 text popup bodies in the link dialog.
 *
 * Renders the exact same MarkdownLite component the public popup uses, inside
 * a card that mimics the popup chrome. The public page sets --lb-* theme
 * variables per theme; the admin shell doesn't, so this wrapper supplies
 * neutral fallbacks (admin accent violet, admin border token).
 */
export function PopupPreview({ content }: { content: string }) {
  const vars = {
    "--lb-font-size": "14px",
    "--lb-font-weight": "400",
    "--lb-letter-spacing": "normal",
    "--lb-card-border": "var(--border)",
    "--lb-accent": "var(--color-violet)",
    "--lb-font-mono": "var(--font-mono, ui-monospace, monospace)",
  } as React.CSSProperties;

  return (
    <div
      className="rounded-lg border border-border bg-muted/30 px-3 py-2"
      style={vars}
      aria-hidden="true"
    >
      {content.trim() ? (
        <div className="lb-popup-body max-h-64 overflow-y-auto">
          <MarkdownLite content={content} />
        </div>
      ) : (
        <p className="py-6 text-center text-xs text-muted-foreground">…</p>
      )}
    </div>
  );
}
