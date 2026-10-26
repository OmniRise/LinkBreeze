"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  setAbTestStatus,
  promoteAbVariant,
  removeAbTest,
} from "@/server/actions/links";
import type { AbConfig, AbVariant } from "@/lib/ab-test";
import { variantLift, variantConfidence } from "@/lib/ab-test";
import { FlaskConical } from "lucide-react";

interface AbTestCardProps {
  linkId: number;
  /** Parsed ab_config (server-side; client only renders from it). */
  config: AbConfig;
  /** Range-scoped per-variant clicks from getLinkStats. */
  clicksA: number;
  clicksB: number;
}

/**
 * #81 per-variant analytics + lifecycle controls (link detail page).
 *
 * Renders under the clicks chart when the link has a test (running, paused
 * or archived). Totals everywhere else stay unified — this card is the only
 * per-variant surface. Promote asks for explicit confirmation and spells out
 * exactly what changes (pin destination + archive). Remove is a separate
 * destructive action with its own confirmation (history is kept either way).
 */
export function AbTestCard({ linkId, config, clicksA, clicksB }: AbTestCardProps) {
  const t = useTranslations("linkDetail");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  // Two-step confirmations: null | "promoteA" | "promoteB" | "remove".
  const [confirming, setConfirming] = React.useState<
    null | "promoteA" | "promoteB" | "remove"
  >(null);
  const [error, setError] = React.useState<string | null>(null);
  // #81 E.4 a11y: when a confirm region mounts it replaces the button that
  // was focused — move focus INTO the region (to Confirm) so keyboard users
  // aren't dumped back on <body>. Escape cancels (handled on the region).
  const confirmBtnRef = React.useRef<HTMLButtonElement | null>(null);
  React.useEffect(() => {
    if (confirming) confirmBtnRef.current?.focus();
  }, [confirming]);
  const confirmKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") setConfirming(null);
  };

  const total = clicksA + clicksB;
  const shareA = total > 0 ? Math.round((clicksA / total) * 100) : 50;
  const shareB = total > 0 ? 100 - shareA : 50;
  const lift = variantLift(clicksA, clicksB);
  const conf = variantConfidence(clicksA, clicksB, config.weightA);

  const labelA = config.labelA || "A";
  const labelB = config.labelB || "B";
  const statusLabel =
    config.status === "running"
      ? t("abStatusRunning")
      : config.status === "paused"
        ? t("abStatusPaused")
        : t("abStatusArchived");

  const run = (action: () => Promise<{ success: boolean; error?: string }>) => {
    startTransition(async () => {
      const res = await action();
      if (!res.success) {
        setError(res.error ?? null);
        return;
      }
      setError(null);
      setConfirming(null);
      router.refresh();
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FlaskConical className="size-4 text-lavender" />
          {t("abTitle")}
          <span className="ml-1 rounded-full border border-border px-2 py-0.5 text-xs font-normal text-muted-foreground">
            {statusLabel}
          </span>
        </CardTitle>
        <CardDescription>
          {config.status === "archived" && config.winner
            ? t("abArchivedNote", { variant: config.winner })
            : config.status === "paused"
              ? t("abPausedNote")
              : conf.significant
                ? t("abSignificant")
                : t("abNotSignificant")}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {(["A", "B"] as const).map((v) => {
            const clicks = v === "A" ? clicksA : clicksB;
            const pct = v === "A" ? shareA : shareB;
            const label = v === "A" ? labelA : labelB;
            const url = v === "A" ? null : config.urlB;
            return (
              <div key={v} className="flex flex-col gap-1 rounded-md border border-border p-3">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate font-medium">
                    {v} · {label}
                  </span>
                  <span className="shrink-0 tabular-nums">{clicks}</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full rounded-full ${v === "A" ? "bg-[var(--aurora-grad)]" : "bg-lavender"}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{pct}% {t("abShareCol")}</span>
                  {url ? <span className="max-w-[60%] truncate" title={url}>{url}</span> : null}
                </div>
              </div>
            );
          })}
        </div>

        {total > 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("abLiftB")}:{" "}
            <span className="font-medium text-foreground tabular-nums">
              {lift === null ? "—" : `${lift > 0 ? "+" : ""}${lift.toFixed(1)}%`}
            </span>
            {" · "}
            {conf.significant ? t("abSignificant") : t("abNotSignificant")}
          </p>
        ) : null}

        {config.status !== "archived" ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() =>
                run(() =>
                  setAbTestStatus(
                    statusFormData(linkId, config.status === "running" ? "paused" : "running"),
                  ),
                )
              }
            >
              {config.status === "running" ? t("abPause") : t("abResume")}
            </Button>
          </div>
        ) : null}

        {config.status !== "archived" ? (
          <div className="flex flex-wrap items-center gap-2">
            {(["A", "B"] as const).map((v) => (
              <React.Fragment key={v}>
                {confirming === `promote${v}` ? (
                  <span
                    className="flex items-center gap-2 text-sm"
                    onKeyDown={confirmKeyDown}
                  >
                    <span className="text-muted-foreground" aria-live="polite">
                      {v === "A" ? t("abPromoteAConfirm") : t("abPromoteBConfirm")}
                    </span>
                    <Button
                      ref={confirmBtnRef}
                      size="sm"
                      disabled={pending}
                      onClick={() => run(() => promoteAbVariant(promoteFormData(linkId, v)))}
                    >
                      {t("abConfirm")}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={pending}
                      onClick={() => setConfirming(null)}
                    >
                      {tCommon("cancel")}
                    </Button>
                  </span>
                ) : (
                  <Button
                    variant={v === "B" ? "default" : "outline"}
                    size="sm"
                    disabled={pending || !!confirming}
                    onClick={() => setConfirming(`promote${v}`)}
                  >
                    {t("abPromote", { variant: `${v} · ${v === "A" ? labelA : labelB}` })}
                  </Button>
                )}
              </React.Fragment>
            ))}
          </div>
        ) : null}

        {config.status === "archived" ? (
          <div className="flex flex-wrap items-center gap-2">
            {confirming === "remove" ? (
              <span
                className="flex items-center gap-2 text-sm"
                onKeyDown={confirmKeyDown}
              >
                <span className="text-muted-foreground" aria-live="polite">
                  {t("abRemoveConfirm")}
                </span>
                <Button
                  ref={confirmBtnRef}
                  size="sm"
                  disabled={pending}
                  onClick={() => run(() => removeAbTest(idFormData(linkId)))}
                >
                  {t("abConfirm")}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={pending}
                  onClick={() => setConfirming(null)}
                >
                  {tCommon("cancel")}
                </Button>
              </span>
            ) : (
              <Button
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() => setConfirming("remove")}
              >
                {t("abRemove")}
              </Button>
            )}
          </div>
        ) : null}

        {error ? (
          <p role="alert" className="text-sm text-destructive">{error}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function idFormData(linkId: number): FormData {
  const fd = new FormData();
  fd.set("id", String(linkId));
  return fd;
}

function statusFormData(linkId: number, status: "running" | "paused"): FormData {
  const fd = idFormData(linkId);
  fd.set("status", status);
  return fd;
}

function promoteFormData(linkId: number, winner: AbVariant): FormData {
  const fd = idFormData(linkId);
  fd.set("winner", winner);
  return fd;
}
