"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { Switch } from "@/components/ui/switch";
import { parseAbConfig } from "@/lib/ab-test";
import { ExternalLink } from "lucide-react";

/**
 * #81 A/B test editor — lives inside the link dialog (URL links only, and
 * only when editing an existing link: setAbTest needs a saved row, so a new
 * link gets its test on the first edit).
 *
 * Fields are UNCONTROLLED named inputs (the UTM-builder pattern): the parent
 * form's handleSubmit reads them from FormData and chains setAbTest /
 * removeAbTest after the link save. Local state exists only for the toggle
 * and the live resolved-URL preview + "open both" action (#81: the operator
 * must see where each variant goes before saving).
 */
export interface AbTestEditorProps {
  /** Stored ab_config JSON from the row (null = no test yet). */
  storedConfig: string | null;
  /** Variant A's resolved destination (the link's saved url). */
  urlA: string;
}

/** Fields the editor form seeds from a stored config — null = no test. */
export type AbEditorInitial = {
  urlB: string;
  labelA: string;
  labelB: string;
  weightA: number;
  startsAt: string | null;
  endsAt: string | null;
};

/**
 * Map stored ab_config JSON to the editor's initial fields — null when the
 * config is absent or does not survive the SHARED zod parser (serve /
 * scanner / restore all use it). The old raw-JSON typeof-guard let a
 * tampered config (weightA=250, missing labelA) enable + mislabel the
 * editor while parseAbConfig treated it as null everywhere else — one
 * parser, one truth (E.40). Pure + exported so the mapping is unit-testable
 * without a component harness (E.46).
 */
export function computeAbEditorInitial(storedConfig: string | null): AbEditorInitial | null {
  if (!storedConfig) return null;
  const c = parseAbConfig(storedConfig);
  if (!c) return null;
  return {
    urlB: c.urlB,
    labelA: c.labelA ?? "",
    labelB: c.labelB ?? "",
    weightA: c.weightA,
    startsAt: c.startsAt ?? null,
    endsAt: c.endsAt ?? null,
  };
}

export function AbTestEditor({ storedConfig, urlA }: AbTestEditorProps) {
  const t = useTranslations("linksPage");
  const initial = computeAbEditorInitial(storedConfig);

  const [enabled, setEnabled] = React.useState(!!initial);
  const [urlB, setUrlB] = React.useState(initial?.urlB ?? "");
  const [weightA, setWeightA] = React.useState(initial?.weightA ?? 50);

  const openBoth = () => {
    // Preview only needs to be good enough to eyeball; the server re-validates
    // everything at save. Never open an empty/invalid B target.
    if (urlA) window.open(urlA, "_blank", "noopener,noreferrer");
    if (urlB) window.open(urlB, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="flex flex-col gap-3 rounded-md border border-border p-3">
      <label className="flex items-center gap-2 text-sm">
        <Switch
          checked={enabled}
          onCheckedChange={setEnabled}
          aria-describedby={enabled ? "ab-test-hint" : undefined}
        />
        {t("abTest")}
      </label>
      {enabled ? (
        <>
          <p id="ab-test-hint" className="text-xs text-muted-foreground">
            {t("abTestHint")}
          </p>
          <FormField label={t("abVariantBUrl")} htmlFor="ab_urlB">
            <Input
              id="ab_urlB"
              name="ab_urlB"
              value={urlB}
              onChange={(e) => setUrlB(e.target.value)}
              required
              maxLength={2048}
              placeholder="https://example.com/variant-b"
            />
          </FormField>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_1fr]">
            <FormField label={t("abLabelA")} htmlFor="ab_labelA">
              <Input
                id="ab_labelA"
                name="ab_labelA"
                defaultValue={initial?.labelA ?? ""}
                maxLength={60}
                placeholder="control"
              />
            </FormField>
            <FormField label={t("abLabelB")} htmlFor="ab_labelB">
              <Input
                id="ab_labelB"
                name="ab_labelB"
                defaultValue={initial?.labelB ?? ""}
                maxLength={60}
                placeholder="variant"
              />
            </FormField>
          </div>
          <FormField label={t("abWeightA")} hint={t("abWeightHint")} htmlFor="ab_weightA">
            <div className="flex items-center gap-3">
              <input
                id="ab_weightA"
                name="ab_weightA"
                type="range"
                min={1}
                max={99}
                value={weightA}
                onChange={(e) => setWeightA(Number(e.target.value))}
                className="h-2 flex-1 cursor-pointer accent-[var(--color-violet,#8b5cf6)]"
                aria-valuetext={`${weightA} / ${100 - weightA}`}
              />
              <span
                aria-hidden="true"
                className="w-16 shrink-0 text-right text-sm tabular-nums text-muted-foreground"
              >
                {weightA} / {100 - weightA}
              </span>
            </div>
          </FormField>
          {/* E.2 time box — optional start/end bounds (empty = unbounded).
              Values stored as-is (local wall-clock); the server schema
              rejects unparseable bounds and end-before-start. */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_1fr]">
            <FormField label={t("abStartsAt")} htmlFor="ab_startsAt">
              <Input
                id="ab_startsAt"
                name="ab_startsAt"
                type="datetime-local"
                defaultValue={initial?.startsAt ?? ""}
              />
            </FormField>
            <FormField label={t("abEndsAt")} htmlFor="ab_endsAt">
              <Input
                id="ab_endsAt"
                name="ab_endsAt"
                type="datetime-local"
                defaultValue={initial?.endsAt ?? ""}
              />
            </FormField>
          </div>
          {/* Resolved-URL preview + open-both (#81): eyeball both targets
              before saving. Variant A is the link's SAVED url — the dialog's
              url field may hold unsaved edits, which are not this test's A. */}
          <div className="flex flex-col gap-1 rounded-md bg-muted/40 px-3 py-2 text-xs">
            <span className="truncate text-muted-foreground">
              <span className="font-medium text-foreground">A:</span> {urlA}
            </span>
            <span className="truncate text-muted-foreground">
              <span className="font-medium text-foreground">B:</span> {urlB || "…"}
            </span>
          </div>
          <div>
            <Button type="button" variant="outline" size="sm" onClick={openBoth}>
              <ExternalLink className="size-3.5" />
              {t("abOpenBoth")}
            </Button>
          </div>
        </>
      ) : null}
      {/* Submitted with the parent form: handleSubmit branches on these. */}
      <input type="hidden" name="ab_enabled" value={enabled ? "on" : "off"} />
    </div>
  );
}
