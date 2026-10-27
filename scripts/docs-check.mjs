#!/usr/bin/env node
/**
 * docs staleness check — same idea as i18n-check, for repo docs.
 *
 * docs/TRANSLATIONS.md records, per translation, the `git hash-object README.md`
 * value the translation was written against. When README.md changes, the
 * recorded hash no longer matches and this script fails with the file(s) that
 * need a re-sync.
 *
 * Usage:
 *   node scripts/docs-check.js            # check
 *   node scripts/docs-check.js --update   # rewrite hashes in TRANSLATIONS.md
 */
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const table = path.join(root, "docs", "TRANSLATIONS.md");
const update = process.argv.includes("--update");

const current = execSync("git hash-object README.md", { cwd: root })
  .toString()
  .trim();

let content = fs.readFileSync(table, "utf8");
const lines = content.split("\n");
const stale = [];

const out = lines.map((line) => {
  const m = line.match(/^(\|[^|]+\|[^|]+\|\s*)(`[0-9a-f]{40}`)(\s*\|[^|]+\|\s*)$/);
  if (!m) return line;
  const recorded = m[2].slice(1, -1);
  if (recorded === current) return line;
  const lang = line.split("|")[1].trim();
  if (update) {
    stale.push(lang);
    return line.replace(recorded, current);
  }
  stale.push(`${lang} (recorded ${recorded.slice(0, 8)}, current ${current.slice(0, 8)})`);
  return line;
});

if (update) {
  fs.writeFileSync(table, out.join("\n"));
  console.log(stale.length ? `Updated hashes for: ${stale.join(", ")}` : "Nothing to update.");
  process.exit(0);
}

// E.78 content rule: README endpoint tables use the `:id` placeholder
// convention, never the OpenAPI `{id}` template syntax (that lives only in
// the spec). A translator drifting into {id} fails here.
const readmes = fs.readdirSync(root).filter((f) => /^README(\.[^.]+)?\.md$/.test(f));
const badPlaceholders = readmes.filter((f) =>
  /\{id\}/.test(fs.readFileSync(path.join(root, f), "utf8")),
);
if (badPlaceholders.length) {
  console.error("OAS-style {id} placeholder leaked into README(s) — table convention is :id:");
  for (const f of badPlaceholders) console.error(`  - ${f}`);
  process.exit(1);
}

if (stale.length) {
  console.error("Stale translation(s) — README.md changed since they were synced:");
  for (const s of stale) console.error(`  - ${s}`);
  console.error("\nRe-sync the translation(s), then run: npm run docs:check -- --update");
  process.exit(1);
}

console.log("✓ all translations reference the current README.md");
