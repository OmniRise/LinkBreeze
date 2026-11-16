import { describe, it, expect } from "vitest";
import { renderMarkdownLiteString } from "@/lib/markdown-lite-string";

describe("renderMarkdownLiteString (#93 popup bodies)", () => {
  it("escapes HTML before applying markdown", () => {
    const out = renderMarkdownLiteString('<img src=x onerror="alert(1)">');
    expect(out).not.toContain("<img");
    expect(out).toContain("&lt;img");
  });

  it("renders bold, italic, code", () => {
    const out = renderMarkdownLiteString("**b** *i* `c`");
    expect(out).toContain("<strong>b</strong>");
    expect(out).toContain("<em>i</em>");
    expect(out).toContain("<code>c</code>");
  });

  it("renders lists as a single ul", () => {
    const out = renderMarkdownLiteString("- a\n- b\n\npara");
    expect(out).toContain('<ul class="lb-md-list">');
    expect(out).toContain("<li>a</li>");
    expect(out).toContain("<li>b</li>");
    expect(out).toContain('<p class="lb-md-p">para</p>');
  });

  it("renders headings as styled paragraphs, not h1/h2", () => {
    const out = renderMarkdownLiteString("# Title\n## Sub");
    expect(out).toContain('<p class="lb-md-h1">Title</p>');
    expect(out).toContain('<p class="lb-md-h2">Sub</p>');
    expect(out).not.toMatch(/<h[12]/);
  });

  it("keeps inline markdown inside list items", () => {
    const out = renderMarkdownLiteString("- **bold** item");
    expect(out).toContain("<li><strong>bold</strong> item</li>");
  });

  it("closes a list interrupted by a blank line", () => {
    const out = renderMarkdownLiteString("- a\n\ntext");
    expect(out.indexOf("</ul>")).toBeLessThan(out.indexOf("lb-md-p"));
  });

  it("emits nothing for empty input", () => {
    expect(renderMarkdownLiteString("")).toBe("");
  });

  it("renders http(s) links as nofollow anchors", () => {
    const out = renderMarkdownLiteString("See [docs](https://example.com/x) now");
    expect(out).toContain(
      '<a class="lb-md-link" href="https://example.com/x" target="_blank" rel="noopener noreferrer nofollow">docs</a>',
    );
  });

  it("renders inline markers inside link labels", () => {
    const out = renderMarkdownLiteString("[**bold** link](https://example.com)");
    expect(out).toContain("<strong>bold</strong> link</a>");
  });

  it("never emits an href for non-http(s) schemes", () => {
    for (const url of ["javascript:alert(1)", "file:///etc/passwd", "data:text/html,x", "ftp://x"]) {
      const out = renderMarkdownLiteString(`[x](${url})`);
      expect(out).not.toContain("lb-md-link");
      expect(out).not.toContain("<a ");
      expect(out).toContain(url);
    }
  });

  it("keeps link-like text without a valid URL as plain text", () => {
    const out = renderMarkdownLiteString("[not a link](no-scheme)");
    expect(out).not.toContain("<a ");
    expect(out).toContain("[not a link](no-scheme)");
  });

  it("renders ordered lists as ol and switches list kinds", () => {
    const out = renderMarkdownLiteString("1. a\n2. b\n- c");
    expect(out).toContain('<ol class="lb-md-list lb-md-ol">');
    expect(out).toContain("<li>a</li>");
    expect(out.indexOf("</ol>")).toBeLessThan(out.indexOf('<ul class="lb-md-list">'));
    expect(out).toContain("<li>c</li>");
  });

  it("renders --- as a thematic break", () => {
    const out = renderMarkdownLiteString("a\n---\nb");
    expect(out).toContain('<hr class="lb-md-hr" />');
    expect(out).toContain('<p class="lb-md-p">a</p>');
    expect(out).toContain('<p class="lb-md-p">b</p>');
  });

  it("escapes angles inside a link URL after scheme validation", () => {
    const out = renderMarkdownLiteString("[x](https://example.com/<b>)");
    expect(out).not.toContain("<b>");
    expect(out).toContain("&lt;b&gt;");
  });

  it("composes italic wrapping a link (reported by @stuff-by-rene)", () => {
    // A flat marker parser emitted the inner [text](url) as dead literal
    // text whenever emphasis was the outermost marker.
    const out = renderMarkdownLiteString("*see [this](https://x.com) now*");
    expect(out).toContain("<em>see <a");
    expect(out).toContain('href="https://x.com"');
    expect(out).toContain("</a> now</em>");
    expect(out).not.toContain("[this]");
  });

  it("composes bold wrapping a link", () => {
    const out = renderMarkdownLiteString("**bold [link](https://x.com)**");
    expect(out).toContain("<strong>bold <a");
    expect(out).toContain("</a></strong>");
    expect(out).not.toContain("[link]");
  });

  it("composes an italic link alone inside emphasis", () => {
    const out = renderMarkdownLiteString("*[Link](https://x.com)*");
    expect(out).toContain("<em><a");
    expect(out).toContain("</a></em>");
    expect(out).not.toContain("[Link]");
  });

  it("keeps label markers composing inside links", () => {
    const out = renderMarkdownLiteString("[*cursive label*](https://x.com)");
    expect(out).toContain('<a class="lb-md-link" href="https://x.com"');
    expect(out).toContain("<em>cursive label</em>");
  });

  it("keeps code spans literal (no recursion inside code)", () => {
    const out = renderMarkdownLiteString("`*text* [x](https://x.com)`");
    expect(out).toContain("<code>*text* [x](https://x.com)</code>");
    expect(out).not.toContain("<a ");
    expect(out).not.toContain("<em>");
  });
});
