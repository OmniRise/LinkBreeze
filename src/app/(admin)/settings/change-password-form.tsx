"use client";

import * as React from "react";
import { localizeActionError } from "@/lib/action-error-i18n";
import { useTranslations } from "next-intl";
import { Lock } from "lucide-react";
import { changePassword } from "@/server/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function ChangePasswordForm() {
  const t = useTranslations("settings.security");
  const tErr = useTranslations("errors");
  const [pending, startTransition] = React.useTransition();
  const [result, setResult] = React.useState<
    { ok: true } | { ok: false; error: string } | null
  >(null);

  const handleSubmit = (formData: FormData) => {
    setResult(null);
    startTransition(async () => {
      const res = await changePassword(formData);
      setResult(res.success ? { ok: true } : { ok: false, error: localizeActionError(tErr, res.error) });
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Lock className="size-4" />{t("changePassword")}</CardTitle>
        <CardDescription>{t("desc")}</CardDescription>
      </CardHeader>
      <form
        onSubmit={(e) => {
          // Opt out of React 19's post-action auto-reset: a failed change
          // (wrong current password) must keep the typed passwords.
          e.preventDefault();
          handleSubmit(new FormData(e.currentTarget));
        }}
      >
        <CardContent className="flex flex-col gap-4">
          <FormField label={t("currentPassword")} htmlFor="currentPassword" required>
            <Input
              id="currentPassword"
              name="currentPassword"
              type="password"
              autoComplete="current-password"
              required
            />
          </FormField>
          <FormField
            label={t("newPassword")}
            htmlFor="newPassword"
            required
            hint={t("passwordHint")}
          >
            <Input
              id="newPassword"
              name="newPassword"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
            />
          </FormField>
          {result ? (
            result.ok ? (
              <p className="text-sm text-success">{t("updated")}</p>
            ) : (
              <p className="text-sm text-destructive">{result.error}</p>
            )
          ) : null}
        </CardContent>
        <CardFooter>
          <Button type="submit" disabled={pending}>
            {pending ? t("updating") : t("updatePassword")}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
