"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useActionState } from "react";
import { verifyLoginTotp } from "@/server/actions/two-factor";
import { LanguageDropdown } from "@/components/language-dropdown";
import type { ActionResult } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Image from "next/image";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useTranslations } from "next-intl";

/**
 * #5: step 2 of the login when 2FA is enabled. The password form hands off
 * with ?u=<username>&p=<pending-token>; this step mints the session.
 */
export function TotpForm() {
  const t = useTranslations("login");
  const router = useRouter();
  const searchParams = useSearchParams();
  const username = searchParams.get("u") ?? "";
  const pending = searchParams.get("p") ?? "";
  // site-relative paths only - blocks "https://evil" and "//evil" open redirects
  const rawFrom = searchParams.get("from") || "/dashboard";
  const from = rawFrom.startsWith("/") && !rawFrom.startsWith("//") ? rawFrom : "/dashboard";

  const [state, formAction, isPending] = useActionState(
    async (_prev: unknown, formData: FormData) => {
      formData.set("username", username);
      formData.set("pending", pending);
      const result = await verifyLoginTotp(formData);
      if (result.success) {
        router.push(from);
        router.refresh();
      }
      return result;
    },
    null as ActionResult | null,
  );

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background p-4">
      <LanguageDropdown className="absolute end-4 top-4 sm:end-6 sm:top-6" align="end" />
      <div className="w-full max-w-sm">
        <Card className="w-full max-w-sm">
          <CardHeader className="items-center text-center">
            <Image src="/logo-mark.svg" alt="LinkBreeze" width={48} height={48} unoptimized className="mx-auto mb-2" />
            <CardTitle className="text-xl">{t("totpPrompt")}</CardTitle>
            <CardDescription>{t("totpDesc")}</CardDescription>
          </CardHeader>
          <form
            onSubmit={(e) => {
              // Opt out of React 19's post-action auto-reset: a wrong code
              // must keep the typed value for correction.
              e.preventDefault();
              formAction(new FormData(e.currentTarget));
            }}
          >
            <CardContent className="flex flex-col gap-4">
              <input type="hidden" name="username" value={username} />
              <input type="hidden" name="pending" value={pending} />
              <div className="flex flex-col gap-2">
                <Label htmlFor="code">{t("totpCode")}</Label>
                <Input
                  id="code"
                  name="code"
                  inputMode="text"
                  autoComplete="one-time-code"
                  placeholder="123456"
                  required
                  autoFocus
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <input type="checkbox" name="trust" className="size-4" />
                {t("totpTrust")}
              </label>
              {state && !state.success && (
                <p role="alert" className="text-sm text-destructive">
                  {state.errorCode === "validation" || state.errorCode === "unauthorized"
                    ? t("totpInvalid")
                    : state.errorCode === "rate_limit"
                      ? state.error
                      : t("totpExpired")}
                </p>
              )}
            </CardContent>
            <CardFooter className="mt-4 flex-col gap-3">
              <Button type="submit" className="w-full" disabled={isPending || !pending}>
                {isPending ? t("totpVerifying") : t("totpSubmit")}
              </Button>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}
