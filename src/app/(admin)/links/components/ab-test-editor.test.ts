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
});
