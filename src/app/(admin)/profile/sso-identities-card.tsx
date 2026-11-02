"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { KeyRound, Link2, Unlink } from "lucide-react";
import { startOidcLinkAction, unlinkOidcIdentityAction } from "@/server/actions/oidc";
import { localizeActionError } from "@/lib/action-error-i18n";
import type { ActionResult } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export interface SsoIdentity {
  issuer: string;
  subject: string;
  preferredUsername: string | null;
}

/** Issuer host for display ("https://idp.example.com/realms/x" → "idp.example.com"). */
function issuerHost(issuer: string): string {
  try {
    return new URL(issuer).host;
  } catch {
    return issuer;
  }
}

/**
 * Profile → "Single sign-on" (#124 3.4): shows the OIDC identities linked to
 * the signed-in account, with Connect (via the login authorize flow — the
 * callback binds to the live session) and Unlink (per identity, audited).
 */
export function SsoIdentitiesCard({
  identities,
  linkingSupported,
}: {
  identities: SsoIdentity[];
  linkingSupported: boolean;
}) {
  const t = useTranslations("profile.sso");
  const tErr = useTranslations("errors");
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [confirming, setConfirming] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const handleUnlink = (identity: SsoIdentity) => {
    setError(null);
    startTransition(async () => {
      const res: ActionResult = await unlinkOidcIdentityAction(identity.issuer, identity.subject);
      if (res.success) {
        setConfirming(null);
        router.refresh();
        return;
      }
      setConfirming(null);
      setError(localizeActionError(tErr, res.error));
    });
  };

  const handleConnect = () => {
    setError(null);
    startTransition(async () => {
      const res = await startOidcLinkAction();
      if (res.success) {
        window.location.href = res.authorizeUrl;
        return;
      }
      setError(localizeActionError(tErr, res.error));
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="size-4" />
          {t("title")}
        </CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {error !== null && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        {identities.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          <ul className="space-y-2">
            {identities.map((identity) => {
              const key = `${identity.issuer}|${identity.subject}`;
              return (
                <li
                  key={key}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {issuerHost(identity.issuer)}
                    </p>
                    {identity.preferredUsername && (
                      <p className="truncate text-xs text-muted-foreground">
                        {identity.preferredUsername}
                      </p>
                    )}
                  </div>
                  {confirming === key ? (
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {t("unlinkConfirm", { issuer: issuerHost(identity.issuer) })}
                      </span>
                      <Button
                        variant="destructive"
                        size="sm"
                        disabled={pending}
                        onClick={() => handleUnlink(identity)}
                      >
                        {t("unlink")}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={pending}
                        onClick={() => setConfirming(null)}
                      >
                        {t("cancel")}
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="shrink-0 text-destructive hover:text-destructive"
                      disabled={pending}
                      onClick={() => setConfirming(key)}
                    >
                      <Unlink className="size-4" />
                      {t("unlink")}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {linkingSupported && (
          <Button variant="outline" size="sm" disabled={pending} onClick={handleConnect}>
            <Link2 className="size-4" />
            {pending ? t("connecting") : t("connect")}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
