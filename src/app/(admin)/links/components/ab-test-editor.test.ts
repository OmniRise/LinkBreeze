/**
 * #81 E.46 — pure-unit tests for the editor's initial-state mapping.
 *
 * The E.40 fix (parse through the SHARED zod parser instead of a raw-JSON
 * typeof-guard) had no pin because the repo has no component harness. The
 * mapping is now an exported pure function, so the exact behaviors that
 * fixed are testable without rendering: a tampered or schema-invalid
 * config must produce null (editor starts disabled — consistent with
 * serve/scanner/restore), a valid config maps field-for-field, and
 * pre-E.2 configs lacking the window keys still map (schema optionality).
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { computeAbEditorInitial } from "./ab-test-editor";

const base = {
  v: 1,
  status: "running",
  labelA: "control",
  labelB: "short",
  urlB: "https://example.com/b",
  weightA: 70,
  weightB: 30,
  winner: null,
};

describe("computeAbEditorInitial (#81 E.40/E.46)", () => {
  it("maps a valid running config field-for-field", () => {
    const out = computeAbEditorInitial(JSON.stringify(base));
    expect(out).toEqual({
      urlB: "https://example.com/b",
      labelA: "control",
      labelB: "short",
      weightA: 70,
      startsAt: null,
      endsAt: null,
    });
  });

  it("carries the E.2 window verbatim when present", () => {
    const out = computeAbEditorInitial(
      JSON.stringify({ ...base, startsAt: "2026-11-01T10:00", endsAt: "2026-11-08T10:00" }),
    );
    expect(out?.startsAt).toBe("2026-11-01T10:00");
    expect(out?.endsAt).toBe("2026-11-08T10:00");
  });

  it("maps pre-E.2 configs that lack the window keys entirely", () => {
    // Schema fields are .optional() — a config saved before E.2 must still
    // open in the editor (it works everywhere else through the same parser).
    const out = computeAbEditorInitial(JSON.stringify(base));
    expect(out).not.toBeNull();
    expect(out?.startsAt).toBeNull();
    expect(out?.endsAt).toBeNull();
  });

  it("E.40 regression: a tampered out-of-range weight yields null (editor stays disabled)", () => {
    // The OLD raw parser accepted this and enabled the editor showing
    // "250 / -150" while every other surface treated the config as null.
    expect(computeAbEditorInitial(JSON.stringify({ ...base, weightA: 250 }))).toBeNull();
    expect(computeAbEditorInitial(JSON.stringify({ ...base, weightA: 50.5 }))).toBeNull();
  });

  it("E.40 regression: a config missing labelA yields null (zod requires it)", () => {
    const withoutLabelA: Record<string, unknown> = { ...base };
    delete withoutLabelA.labelA;
    expect(computeAbEditorInitial(JSON.stringify(withoutLabelA))).toBeNull();
  });

  it("null, empty, and garbage inputs all yield null", () => {
    expect(computeAbEditorInitial(null)).toBeNull();
    expect(computeAbEditorInitial("")).toBeNull();
    expect(computeAbEditorInitial("{not json")).toBeNull();
    expect(computeAbEditorInitial('"just a string"')).toBeNull();
  });

  it("E.107: one parser, one truth across the admin link surfaces (static source pin)", () => {
    // The list has NO A/B badge today (grounded: zero abConfig refs in
    // links-manager/sortable-link); the dialog is the ONLY client reader
    // and hands the RAW string to the editor, which parses through the
    // SHARED parseAbConfig. Pin all three so a future surface can't grow
    // its own hand-rolled config reader.
    const base = resolve(process.cwd(), "src/app/(admin)/links");
    const files = readdirSync(base, { recursive: true })
      .map(String)
      .filter((f) => (f.endsWith(".tsx") || f.endsWith(".ts")) && !f.includes(".test."));
    expect(files.length).toBeGreaterThan(5); // scan is real

    // (1) No hand-rolled JSON.parse anywhere in the admin link surfaces.
    for (const f of files) {
      const src = readFileSync(resolve(base, f), "utf8");
      expect(src.includes("JSON.parse"), `JSON.parse found in ${f}`).toBe(false);
    }

    // (2) The dialog passes the RAW stored string through unmodified.
    const dialog = readFileSync(resolve(base, "components/link-dialog.tsx"), "utf8");
    expect(dialog).toContain("<AbTestEditor storedConfig={editing.abConfig ?? null}");

    // (3) The editor parses via the ONE shared function (not inline).
    const editor = readFileSync(resolve(base, "components/ab-test-editor.tsx"), "utf8");
    expect(editor).toContain("parseAbConfig(storedConfig)");

    // (4) The list surface renders no A/B state — any future badge must
    // come through the shared parser, never an ad-hoc read.
    for (const f of ["links-manager.tsx", "components/sortable-link.tsx"]) {
      const src = readFileSync(resolve(base, f), "utf8");
      expect(src.includes("abConfig"), `abConfig reference in list file ${f}`).toBe(false);
    }
  });

  it("E.124: submit contract — dialog abData keys exactly equal the setAbTest reads", () => {
    // Grounded: the editor renders ab_* fields; link-dialog maps them into
    // a clean abData FormData (lines 345-354) handed to setAbTest, which
    // reads exactly 7 keys (links.ts:622-711). A rename on EITHER side
    // must fail here instead of silently submitting a value the action
    // coerces to its default.
    const dialog = readFileSync(
      resolve(process.cwd(), "src/app/(admin)/links/components/link-dialog.tsx"),
      "utf8",
    );
    const action = readFileSync(resolve(process.cwd(), "src/server/actions/links.ts"), "utf8");

    const setKeys = [...dialog.matchAll(/abData\.set\("([^"]+)"/g)].map((m) => m[1]).sort();
    expect(setKeys).toEqual(["endsAt", "id", "labelA", "labelB", "startsAt", "urlB", "weightA"]);

    const start = action.indexOf("export async function setAbTest(");
    const end = action.indexOf("export async function setAbTestStatus(");
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const body = action.slice(start, end);
    const readKeys = [...body.matchAll(/formData\.get\("([^"]+)"/g)].map((m) => m[1]);
    // Same SET both ways: nothing extra read, nothing set-but-unread.
    expect(new Set(readKeys)).toEqual(new Set(setKeys));
    for (const k of readKeys) expect(setKeys).toContain(k);
  });

  it("E.130: weight input client bounds match the schema (1-99, integer, B = 100 − A)", () => {
    // Grounded: the slider is type="range" min={1} max={99} (range default
    // step = 1 → integers only), B is displayed/derived as 100 − weightA,
    // and the schema demands z.number().int().min(1).max(99) + sum === 100.
    // A UI loosening (e.g. max=100) would submit values the schema rejects
    // (weightB would hit 0) — this pins both sides together.
    const editor = readFileSync(
      resolve(process.cwd(), "src/app/(admin)/links/components/ab-test-editor.tsx"),
      "utf8",
    );
    const lib = readFileSync(resolve(process.cwd(), "src/lib/ab-test.ts"), "utf8");

    const anchor = editor.indexOf('name="ab_weightA"');
    expect(anchor).toBeGreaterThan(-1);
    const block = editor.slice(anchor, anchor + 240);
    expect(block).toContain('type="range"');
    expect(block).toContain("min={1}");
    expect(block).toContain("max={99}");

    // The B side is always derived, never independently editable.
    expect(editor).toContain("100 - weightA");

    // Schema side of the same contract.
    expect(lib).toContain("weightA: z.number().int().min(1).max(99)");
    expect(lib).toContain("c.weightA + c.weightB === 100");
  });

  it("E.134: a failed setAbTest surfaces the error and returns BEFORE closing — values persist", () => {
    // Grounded (link-dialog.tsx:355-364): on abResult.success===false the
    // handler sets the error and `return`s — onOpenChange(false) + the
    // router.refresh() live only AFTER that guard, so the dialog (and its
    // typed values / editor state) stays put for a correction retry.
    const dialog = readFileSync(
      resolve(process.cwd(), "src/app/(admin)/links/components/link-dialog.tsx"),
      "utf8",
    );
    const start = dialog.indexOf("const abResult = await savedAction.run(setAbTest, abData)");
    expect(start).toBeGreaterThan(-1);
    const end = dialog.indexOf("setActionError(null);", start); // success-path clear
    expect(end).toBeGreaterThan(start);
    const guard = dialog.slice(start, end);

    expect(guard).toContain("if (!abResult.success)");
    expect(guard).toContain("setActionError(abResult.error ?? null)");
    expect(guard).toContain("return;");
    // Nothing that closes/refreshes may sit INSIDE the failure guard path:
    expect(guard).not.toContain("onOpenChange(false)");
    expect(guard).not.toContain("router.refresh()");
    // ...and the close DOES happen after the guard, on the success path.
    const afterGuard = dialog.slice(end, end + 200);
    expect(afterGuard).toContain("onOpenChange(false)");
  });

  it("E.136: window inputs are datetime-local with empty-by-default (unbounded) values", () => {
    // Grounded (ab-test-editor.tsx:151-166): both bounds are
    // type="datetime-local" (emits "YYYY-MM-DDTHH:mm" — Date.parse-able,
    // which abConfigSchema's window refine requires) with
    // defaultValue = initial?.X ?? "" so a new test starts UNBOUNDED
    // rather than implicitly windowed at load time.
    const editor = readFileSync(
      resolve(process.cwd(), "src/app/(admin)/links/components/ab-test-editor.tsx"),
      "utf8",
    );
    for (const [anchor, initialKey] of [
      ['name="ab_startsAt"', "startsAt"],
      ['name="ab_endsAt"', "endsAt"],
    ] as const) {
      const at = editor.indexOf(anchor);
      expect(at, anchor).toBeGreaterThan(-1);
      const block = editor.slice(at, at + 220);
      expect(block, anchor).toContain('type="datetime-local"');
      expect(block, anchor).toContain(`defaultValue={initial?.${initialKey} ?? ""}`);
    }
  });
});
