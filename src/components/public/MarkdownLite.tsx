"use client";

import * as React from "react";

/**
 * Minimal, safe markdown renderer for privacy policy text (and the link
 * dialog's live preview for #93 popup cards).
 *
 * Supports: # h1, ## h2, paragraphs, - lists, 1. ordered lists, --- dividers,
 * **bold**, *italic*, `code`, and [text](url) links (http(s) hrefs only —
 * anything else passes through as plain text).
 *
 * No dangerouslySetInnerHTML. All content is output as React children.
 * Only a controlled subset of markdown is parsed; unknown patterns pass through as plain text.
 *
 * Uses theme CSS variables (var(--lb-*)) so it matches the page's active theme.
 */

interface ParsedLine {
  type: "h1" | "h2" | "li" | "oli" | "hr" | "p" | "blank";
  children: React.ReactNode[];
}

/** Only http(s) hrefs become anchors; anything else renders as plain text. */
function isSafeHref(url: string): boolean {
  return /^https?:\/\/\S+$/i.test(url);
}

function renderMarkers(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  // Split on **bold**, *italic*, and `code` while keeping delimiters.
  const regex = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  const parts = text.split(regex).filter(Boolean);

  parts.forEach((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      nodes.push(
        <strong key={i} style={{ fontWeight: 700 }}>
          {part.slice(2, -2)}
        </strong>,
      );
    } else if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
      nodes.push(<em key={i}>{part.slice(1, -1)}</em>);
    } else if (part.startsWith("`") && part.endsWith("`")) {
      nodes.push(
        <code
          key={i}
          style={{
            borderRadius: "4px",
            padding: "1px 5px",
            fontSize: "0.85em",
            fontFamily: "var(--lb-font-mono, monospace)",
            background: "color-mix(in srgb, var(--lb-accent) 12%, transparent)",
          }}
        >
          {part.slice(1, -1)}
        </code>,
      );
    } else {
      nodes.push(part);
    }
  });

  return nodes;
}

function renderInline(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  // Link-first split so [text](url) wins over the plain markers inside it.
  const regex = /(\[[^\]]+\]\([^)\s]+\)|\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  const parts = text.split(regex).filter(Boolean);

  parts.forEach((part, i) => {
    const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(part);
    if (link && isSafeHref(link[2])) {
      nodes.push(
        <a
          key={i}
          href={link[2]}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="lb-md-link"
          style={{ color: "var(--lb-accent)", textDecoration: "underline" }}
        >
          {renderMarkers(link[1])}
        </a>,
      );
    } else {
      nodes.push(...renderMarkers(part));
    }
  });

  return nodes;
}

export function MarkdownLite({ content }: { content: string }) {
  const lines = content.split("\n");
  const parsed: ParsedLine[] = lines.map((line) => {
    const trimmed = line.trimEnd();
    if (trimmed.startsWith("# ")) {
      return { type: "h1", children: renderInline(trimmed.slice(2)) };
    }
    if (trimmed.startsWith("## ")) {
      return { type: "h2", children: renderInline(trimmed.slice(3)) };
    }
    if (/^\d+\. /.test(trimmed)) {
      return { type: "oli", children: renderInline(trimmed.slice(trimmed.indexOf(". ") + 2)) };
    }
    if (trimmed === "---") {
      return { type: "hr", children: [] };
    }
    if (trimmed.startsWith("- ")) {
      return { type: "li", children: renderInline(trimmed.slice(2)) };
    }
    if (trimmed === "") {
      return { type: "blank", children: [] };
    }
    return { type: "p", children: renderInline(trimmed) };
  });

  // Group consecutive "li"/"oli" lines into <ul>/<ol> elements.
  const blocks: React.ReactNode[] = [];
  let listItems: React.ReactNode[] = [];
  let listKind: "ul" | "ol" = "ul";

  const flushList = (key: number) => {
    if (listItems.length > 0) {
      const ListTag = listKind;
      blocks.push(
        <ListTag
          key={`list-${key}`}
          style={{
            margin: "0 0 16px 0",
            paddingLeft: "20px",
            listStyle: listKind === "ol" ? "decimal" : "disc",
            display: "flex",
            flexDirection: "column",
            gap: "4px",
          }}
        >
          {listItems}
        </ListTag>,
      );
      listItems = [];
    }
  };

  parsed.forEach((line, i) => {
    switch (line.type) {
      case "h1":
        flushList(i);
        blocks.push(
          <h1
            key={i}
            style={{
              fontSize: "calc(var(--lb-font-size) * 1.5)",
              fontWeight: "var(--lb-font-weight)",
              letterSpacing: "var(--lb-letter-spacing)",
              margin: "0 0 4px 0",
              lineHeight: 1.3,
            }}
          >
            {line.children}
          </h1>,
        );
        break;
      case "h2":
        flushList(i);
        blocks.push(
          <h2
            key={i}
            style={{
              fontSize: "calc(var(--lb-font-size) * 1.15)",
              fontWeight: "calc(var(--lb-font-weight) + 100)",
              letterSpacing: "var(--lb-letter-spacing)",
              margin: "24px 0 8px 0",
              paddingBottom: "6px",
              borderBottom: "1px solid var(--lb-card-border)",
              lineHeight: 1.3,
            }}
          >
            {line.children}
          </h2>,
        );
        break;
      case "li":
      case "oli": {
        const kind = line.type === "oli" ? "ol" : "ul";
        if (listItems.length > 0 && listKind !== kind) flushList(i);
        listKind = kind;
        listItems.push(
          <li key={i} style={{ fontSize: "var(--lb-font-size)", lineHeight: 1.6 }}>
            {line.children}
          </li>,
        );
        break;
      }
      case "hr":
        flushList(i);
        blocks.push(
          <hr
            key={i}
            style={{ border: "none", borderTop: "1px solid var(--lb-card-border)", margin: "16px 0" }}
          />,
        );
        break;
      case "p":
        flushList(i);
        blocks.push(
          <p key={i} style={{ fontSize: "var(--lb-font-size)", lineHeight: 1.6, margin: "0 0 12px 0" }}>
            {line.children}
          </p>,
        );
        break;
      case "blank":
        flushList(i);
        break;
    }
  });

  flushList(parsed.length);
  return <>{blocks}</>;
}
