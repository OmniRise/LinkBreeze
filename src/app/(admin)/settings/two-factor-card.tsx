"use client";

import * as React from "react";
import Image from "next/image";
import { localizeActionError } from "@/lib/action-error-i18n";
import { useTranslations } from "next-intl";
import { ShieldCheck, ShieldOff, KeyRound, Copy, Check } from "lucide-react";
import {
  startTotpSetup,
  confirmTotpSetup,
  disableTotp,
} from "@/server/actions/two-factor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type Phase =
  | { kind: "idle" }
  | { kind: "enabling"; uri: string; manualSecret: string }
  | { kind: "recovery"; codes: string[] };

export function TwoFactorCard({ enabled }: { enabled: boolean }) {
  const t = useTranslations("settings.security");
  const tErr = useTranslations("errors");
  const [pending, startTransition] = React.useTransition();
  const [phase, setPhase] = React.useState<Phase>({ kind: "idle" });
  const [error, setError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  const handleStart = () => {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const res = await startTotpSetup();
      if (res.success) {
        setPhase({ kind: "enabling", uri: res.uri, manualSecret: res.secret });
      } else {
        setError(localizeActionError(tErr, res.error));
      }
    });
  };

  const handleConfirm = (formData: FormData) => {
    setError(null);
    startTransition(async () => {
      const res = await confirmTotpSetup(formData);
      if (res.success) {
        setPhase({ kind: "recovery", codes: res.recoveryCodes });
        setSaved(true);
      } else {
        setError(localizeActionError(tErr, res.error));
      }
    });
  };

  const handleDisable = (formData: FormData) => {
    setError(null);
    startTransition(async () => {
      const res = await disableTotp(formData);
      if (res.success) {
        setPhase({ kind: "idle" });
        setSaved(true);
      } else {
        setError(localizeActionError(tErr, res.error));
      }
    });
  };

  // ── Enabled view: show code + recovery-codes count, offer disable ──
  if (enabled && phase.kind !== "recovery") {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="size-4" />
            {t("twoFactor.title")}
          </CardTitle>
          <CardDescription>{t("twoFactor.enabledDesc")}</CardDescription>
        </CardHeader>
        <form
          onSubmit={(e) => {
            // Opt out of React 19's post-action auto-reset: a wrong code must
            // keep the typed value (retyping on error loses work).
            e.preventDefault();
            handleDisable(new FormData(e.currentTarget));
          }}
        >
          <CardContent className="flex flex-col gap-4">
            <FormField
              label={t("twoFactor.codeLabel")}
              htmlFor="totp-disable-code"
              required
            >
              <Input
                id="totp-disable-code"
                name="code"
                inputMode="text"
                autoComplete="one-time-code"
                placeholder="123456"
                required
              />
            </FormField>
            <p className="text-sm text-muted-foreground">{t("twoFactor.disableHint")}</p>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            {saved && !error && (
              <p role="status" className="text-sm text-success">
                {t("twoFactor.disabled")}
              </p>
            )}
            <div>
              <Button type="submit" variant="destructive" disabled={pending}>
                <ShieldOff className="size-4" />
                {pending ? t("twoFactor.working") : t("twoFactor.disable")}
              </Button>
            </div>
          </CardContent>
        </form>
      </Card>
    );
  }

  // ── Recovery codes view (shown exactly once, after enabling) ──
  if (phase.kind === "recovery") {
    const copyAll = async () => {
      try {
        await navigator.clipboard.writeText(phase.codes.join("\n"));
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        // clipboard API unavailable (permissions/insecure context) — codes stay selectable
      }
    };
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="size-4" />
            {t("twoFactor.recoveryTitle")}
          </CardTitle>
          <CardDescription>{t("twoFactor.recoveryDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="relative">
            <div className="grid grid-cols-2 gap-2 rounded-md border bg-muted/40 p-4 pr-12 font-mono text-sm select-all">
              {phase.codes.map((c) => (
                <span key={c}>{c}</span>
              ))}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute top-2 right-2"
              onClick={copyAll}
              aria-label={copied ? t("twoFactor.recoveryCopied") : t("twoFactor.recoveryCopy")}
              title={copied ? t("twoFactor.recoveryCopied") : t("twoFactor.recoveryCopy")}
            >
              {copied ? <Check className="size-4 text-success" /> : <Copy className="size-4" />}
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">{t("twoFactor.recoveryWarn")}</p>
          <div>
            <Button type="button" onClick={() => setPhase({ kind: "idle" })}>
              {t("twoFactor.recoveryDone")}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ── Setup: scan QR → enter code ──
  if (phase.kind === "enabling") {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="size-4" />
            {t("twoFactor.setupTitle")}
          </CardTitle>
          <CardDescription>{t("twoFactor.setupDesc")}</CardDescription>
        </CardHeader>
        <form
          onSubmit={(e) => {
            // Opt out of React 19's post-action auto-reset: a wrong code must
            // keep the typed value (retyping on error loses work).
            e.preventDefault();
            handleConfirm(new FormData(e.currentTarget));
          }}
        >
          <CardContent className="flex flex-col gap-4">
            {/* SVG from our own API route — never a remote image */}
            <Image
              src="/api/totp-qr"
              alt={t("twoFactor.qrAlt")}
              width={180}
              height={180}
              unoptimized
              className="self-center rounded-md border bg-white p-2"
            />
            <details className="text-sm">
              <summary className="cursor-pointer text-muted-foreground">
                {t("twoFactor.manualEntry")}
              </summary>
              <code className="mt-2 block break-all rounded bg-muted px-2 py-1 font-mono text-xs">
                {phase.manualSecret}
              </code>
            </details>
            <FormField
              label={t("twoFactor.codeLabel")}
              htmlFor="totp-confirm-code"
              required
            >
              <Input
                id="totp-confirm-code"
                name="code"
                inputMode="text"
                autoComplete="one-time-code"
                placeholder="123456"
                required
                autoFocus
              />
            </FormField>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <div>
              <Button type="submit" disabled={pending}>
                {pending ? t("twoFactor.working") : t("twoFactor.verify")}
              </Button>
            </div>
          </CardContent>
        </form>
      </Card>
    );
  }

  // ── Idle + not enabled: the enable pitch ──
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="size-4" />
          {t("twoFactor.title")}
        </CardTitle>
        <CardDescription>{t("twoFactor.idleDesc")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {saved && !error && (
          <p role="status" className="text-sm text-success">
            {t("twoFactor.disabled")}
          </p>
        )}
        <div>
          <Button type="button" onClick={handleStart} disabled={pending}>
            {pending ? t("twoFactor.working") : t("twoFactor.enable")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
