"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { KeyRound, Copy, Check, Trash2 } from "lucide-react";
import { localizeActionError } from "@/lib/action-error-i18n";
import {
  generateApiKeyAction,
  revokeApiKeyAction,
} from "@/server/actions/api-keys";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export interface ApiKeyCardRecord {
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
}

/** E.4 in-process usage counters (see src/lib/api-usage.ts). */
export interface ApiKeyCardUsage {
  calls: number;
  authFails: number;
  rateLimited: number;
}

/**
 * #4 — API key management (Settings → Security). The plaintext key exists
 * exactly once, in this card's transient state right after generation; a
 * refresh (or page reload) can never bring it back — only the hash is stored.
 */
export function ApiKeyCard({
  record,
  usage,
}: {
  record: ApiKeyCardRecord | null;
  usage?: ApiKeyCardUsage;
}) {
  const t = useTranslations("settings.security.apiKey");
  const tErr = useTranslations("errors");
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [oneTimeKey, setOneTimeKey] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);
  const [revoked, setRevoked] = React.useState(false);
  // E.2 rotation grace: keep the old key alive for 1h while callers migrate.
  const [keepPrevious, setKeepPrevious] = React.useState(false);

  const handleGenerate = () => {
    setError(null);
    setRevoked(false);
    startTransition(async () => {
      const res = await generateApiKeyAction({ keepPrevious });
      if (res.success) {
        setOneTimeKey(res.key);
      } else {
        setError(localizeActionError(tErr, res.error));
      }
    });
  };

  const handleRevoke = () => {
    setError(null);
    startTransition(async () => {
      const res = await revokeApiKeyAction();
      if (res.success) {
        setOneTimeKey(null);
        setRevoked(true);
      } else {
        setError(localizeActionError(tErr, res.error));
      }
    });
  };

  const copyKey = async () => {
    if (!oneTimeKey) return;
    try {
      await navigator.clipboard.writeText(oneTimeKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard unavailable — the key stays selectable in the box below
    }
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="size-4" />
          {t("title")}
        </CardTitle>
        <CardDescription>{t("desc")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {revoked && !error && (
          <p role="status" className="text-sm text-success">
            {t("revoked")}
          </p>
        )}

        {/* One-time plaintext reveal (shown exactly once, after generation) */}
        {oneTimeKey && (
          <div className="flex flex-col gap-2">
            <div className="relative">
              <div className="rounded-md border bg-muted/40 p-4 pr-12 font-mono text-sm select-all break-all">
                {oneTimeKey}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute top-2 right-2"
                onClick={copyKey}
                aria-label={copied ? t("copied") : t("copy")}
                title={copied ? t("copied") : t("copy")}
              >
                {copied ? (
                  <Check className="size-4 text-success" />
                ) : (
                  <Copy className="size-4" />
                )}
              </Button>
            </div>
            <p role="status" className="text-sm text-warning">
              {t("warning")}
            </p>
          </div>
        )}

        {/* Existing key info — prefix only, never the secret */}
        {record && !oneTimeKey && (
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-muted-foreground">{t("keyLabel")}</dt>
            <dd className="font-mono break-all">
              {record.prefix}
              {"…"}
            </dd>
            <dt className="text-muted-foreground">{t("createdAt")}</dt>
            <dd>{formatDate(record.createdAt)}</dd>
            <dt className="text-muted-foreground">{t("lastUsed")}</dt>
            <dd>
              {record.lastUsedAt
                ? formatDate(record.lastUsedAt)
                : t("neverUsed")}
            </dd>
          </dl>
        )}

        <p className="text-sm text-muted-foreground">{t("docsHint")}</p>

        {/* E.4: in-process activity counters (honest process-lifetime scope). */}
        {usage && usage.calls > 0 && (
          <p className="text-sm text-muted-foreground">
            {t("usageToday", {
              calls: usage.calls,
              authFails: usage.authFails,
              rateLimited: usage.rateLimited,
            })}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={handleGenerate} disabled={pending}>
            {pending
              ? t("working")
              : record
                ? t("regenerate")
                : t("generate")}
          </Button>
          {record && (
            <Button
              type="button"
              variant="destructive"
              onClick={handleRevoke}
              disabled={pending}
            >
              <Trash2 className="size-4" />
              {t("revoke")}
            </Button>
          )}
        </div>

        {/* E.2: rotation grace — opt-in, default off (instant invalidate). */}
        {record && (
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={keepPrevious}
              onChange={(e) => setKeepPrevious(e.target.checked)}
              disabled={pending}
              className="size-4"
            />
            {t("graceLabel")}
          </label>
        )}
      </CardContent>
    </Card>
  );
}
