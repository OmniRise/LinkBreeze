"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import en from "@/locales/en";
import { localizeActionError } from "@/lib/action-error-i18n";
import { acceptInviteAction } from "@/server/actions/invites";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";

/**
 * Accept form for invitation links (#124 follow-up, stage 1). The (public)
 * layout has no NextIntlClientProvider (public pages are English-only by
 * design), so labels come straight from the `en` locale object. On success
 * the server action signs the new member in; router.push picks it up.
 */
export function InviteAcceptForm({ token }: { token: string }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("token", token);
    setError(null);
    startTransition(async () => {
      const res = await acceptInviteAction(fd);
      if (res.success) {
        // Client-side push: the RSC payload carries the fresh session cookie.
        router.push("/dashboard");
        return;
      }
      setError(localizeActionError((k) => en.errors[k] ?? k, (res as { error: string }).error));
      // Invalid/expired/used tokens: refresh the server-validated page shell.
      if ((res as { errorCode?: string }).errorCode === "not_found") {
        router.refresh();
      }
    });
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5">
      <FormField label={en.invite.username} htmlFor="invite-username">
        <Input
          id="invite-username"
          name="username"
          required
          minLength={2}
          maxLength={32}
          autoComplete="username"
          spellCheck={false}
        />
      </FormField>
      <FormField label={en.invite.password} htmlFor="invite-password" hint={en.invite.passwordHint}>
        <Input
          id="invite-password"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
        />
      </FormField>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? (
          <>
            <Loader2 className="size-4 animate-spin" aria-hidden />
            {en.invite.creating}
          </>
        ) : (
          en.invite.submit
        )}
      </Button>
    </form>
  );
}
