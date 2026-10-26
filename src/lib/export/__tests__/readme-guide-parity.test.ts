import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * E.30 — README hosting-guide shape parity (docs/ not covered by
 * docs:check's hash gate: a mirror can carry the right hash line yet a
 * mangled section). The Static Export block added in E.6 must keep the
 * same structure across all 11 READMEs: one balanced <details> pair,
 * the 🌐 summary, five bullets, and the ?embed=1 mentions.
 */

const READMES = [
  "README.md",
  "README.es.md",
  "README.fr.md",
  "README.de.md",
  "README.zh.md",
  "README.ar.md",
  "README.pt-BR.md",
  "README.it.md",
  "README.ru.md",
  "README.tr.md",
  "README.ja.md",
];

function guideSection(file: string): string {
  const text = readFileSync(join(process.cwd(), file), "utf8");
  const lines = text.split("\n");
  const start = lines.findIndex((l) => l.startsWith("## 📦"));
  const end = lines.findIndex((l) => l.startsWith("## 📖"));
  expect(start, `${file}: no Static Export heading`).toBeGreaterThanOrEqual(0);
  expect(end, `${file}: no Docs heading after it`).toBeGreaterThan(start);
  return lines.slice(start, end).join("\n");
}

describe("README hosting-guide structure across all locales (E.30)", () => {
  for (const file of READMES) {
    it(`${file} keeps the guide shape`, () => {
      const seg = guideSection(file);
      expect(seg.match(/<details>/g) ?? []).toHaveLength(1);
      expect(seg.match(/<\/details>/g) ?? []).toHaveLength(1);
      expect(seg).toContain("<summary>🌐");
      expect(seg.match(/^- /gm) ?? []).toHaveLength(5);
      // get-the-file, stays-home (×2) and size bullets all cite embed=1
      expect(seg.match(/\?embed=1/g) ?? []).toHaveLength(4);
      // balanced section: heading opens, docs heading is the boundary
      expect(seg.startsWith("## 📦")).toBe(true);
    });
  }
});
