"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useActionState } from "react";
import { login } from "@/server/actions/auth";
import { startOidcLoginAction } from "@/server/actions/oidc";
import { LanguageDropdown } from "@/components/language-dropdown";
import type { ActionResult } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Image from "next/image";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useTranslations } from "next-intl";
import * as React from "react";

/** Map the callback's ?sso= reason to a user-facing message. */
function ssoErrorMessage(t: ReturnType<typeof useTranslations<"login">>, reason: string | null): string {
  switch (reason) {
    case "disabled":
      return t("ssoErrorDisabled");
    case "bound":
      return t("ssoErrorBound");
    case "expired":
    case "invalid":
      return t("ssoErrorRetry");
    default:
      return t("ssoError");
  }
}

export function LoginForm({
  ssoAvailable,
  ssoReplacesLocal,
}: {
  ssoAvailable: boolean;
  ssoReplacesLocal: boolean;
}) {
  const t = useTranslations("login");
  const router = useRouter();
  const searchParams = useSearchParams();
  // site-relative paths only - blocks "https://evil" and "//evil" open redirects
  const rawFrom = searchParams.get("from") || "/dashboard";
  const from = rawFrom.startsWith("/") && !rawFrom.startsWith("//") ? rawFrom : "/dashboard";

  const ssoReason = searchParams.get("sso");
  const [ssoPending, startSsoTransition] = React.useTransition();
  const [ssoError, setSsoError] = React.useState<string | null>(null);

  const startSso = () => {
    setSsoError(null);
    startSsoTransition(async () => {
      const res = await startOidcLoginAction(from);
      if (res.success) {
        window.location.href = res.authorizeUrl;
        return;
      }
      setSsoError(t("ssoError"));
    });
  };

  const [state, formAction, isPending] = useActionState(
    async (_prev: unknown, formData: FormData) => {
      const result = await login(formData);
      if (result.success) {
        router.push(from);
        router.refresh();
      } else if (
        result.errorCode === "totp_required" &&
        "pending" in result
      ) {
        // #5: 2FA handoff — carry username + pending token to the code step.
        const username = String(formData.get("username") ?? "");
        router.push(
          `/login/totp?u=${encodeURIComponent(username)}&p=${encodeURIComponent(result.pending as string)}&from=${encodeURIComponent(from)}`,
        );
        router.refresh();
      }
      return result;
    },
    null as ActionResult | null,
  );

  const ssoBlock = ssoAvailable ? (
    <div className="flex flex-col gap-3">
      <Button type="button" variant="outline" className="w-full" disabled={ssoPending} onClick={startSso}>
        {ssoPending ? t("ssoConnecting") : t("ssoButton")}
      </Button>
      {ssoError && (
        <p role="alert" className="text-sm text-destructive">
          {ssoError}
        </p>
      )}
      {ssoReason && !ssoError && (
        <p role="alert" className="text-sm text-destructive">
          {ssoErrorMessage(t, ssoReason)}
        </p>
      )}
    </div>
  ) : null;

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background p-4">
      <LanguageDropdown className="absolute end-4 top-4 sm:end-6 sm:top-6" align="end" />
      <div className="w-full max-w-sm">
        <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <Image src="/logo-mark.svg" alt="LinkBreeze" width={48} height={48} unoptimized className="mx-auto mb-2" />
          <CardTitle className="text-xl">{t("welcomeBack")}</CardTitle>
          <CardDescription>{t("subtitle")}</CardDescription>
        </CardHeader>
        {ssoReplacesLocal ? (
          // #124: SSO-only mode — the instance admin replaced local login.
          <CardContent className="flex flex-col gap-4">
            {ssoBlock ?? (
              <p role="alert" className="text-sm text-destructive">
                {t("ssoError")}
              </p>
            )}
            <Link
              href="/"
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              ← {t("backToPage")}
            </Link>
          </CardContent>
        ) : (
        <form action={formAction}>
          <CardContent className="flex flex-col gap-4">
            {ssoBlock}
            {ssoBlock && <div className="flex items-center gap-3 text-xs text-muted-foreground"><span className="h-px flex-1 bg-border" />{t("orDivider")}<span className="h-px flex-1 bg-border" /></div>}
            <div className="flex flex-col gap-2">
              <Label htmlFor="username">{t("username")}</Label>
              <Input
                id="username"
                name="username"
                type="text"
                autoComplete="username"
                required
                autoFocus
              />
            </div>
            <div className="flex flex-col gap-2 mb-4">
              <Label htmlFor="password">{t("password")}</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
              />
            </div>
            {state && !state.success ? (
              <p className="text-sm text-destructive">
                {state.errorCode === "unauthorized"
                  ? t("invalidCredentials")
                  : state.error}
              </p>
            ) : null}
          </CardContent>
          <CardFooter className="flex flex-col gap-3">
            <Button type="submit" className="w-full" disabled={isPending}>
              {isPending ? t("submitPending") : t("submit")}
            </Button>
            <Link
              href="/"
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              ← {t("backToPage")}
            </Link>
          </CardFooter>
        </form>
        )}
      </Card>
      </div>
    </div>
  );
}
