"use client";

import * as React from "react";
import { localizeActionError } from "@/lib/action-error-i18n";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { ArrowLeft, Plus } from "lucide-react";
import { createPageAction } from "@/server/actions/pages";
import { useSavedAction } from "@/hooks/use-saved-action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import Link from "next/link";

export default function NewPageForm() {
  const t = useTranslations("pages");
  const tErr = useTranslations("errors");
  const router = useRouter();
  const savedAction = useSavedAction();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  const handleSubmit = (formData: FormData) => {
    setError(null);
    startTransition(async () => {
      const res = await savedAction.run(createPageAction, formData);
      if (res.success) {
        router.push(`/links?page=${res.pageId}`);
      } else {
        setError(localizeActionError(tErr, res.error));
      }
    });
  };

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div>
        <Link
          href="/links"
          className="mb-2 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />{t("backToLinks")}</Link>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">{t("newPage")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("newPageDesc")}
        </p>
      </div>

      <form
        onSubmit={(e) => {
          // Opt out of React 19's post-action auto-reset of uncontrolled
          // inputs: a failed create must keep the typed slug/title/bio.
          // Native constraint validation still runs before the submit event.
          e.preventDefault();
          handleSubmit(new FormData(e.currentTarget));
        }}
        className="flex flex-col gap-6"
      >
        <Card>
          <CardHeader>
            <CardTitle>{t("detailsTitle")}</CardTitle>
            <CardDescription>{t("slugHint")}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="slug">{t("slug")}</Label>
              <Input
                id="slug"
                name="slug"
                required
                maxLength={80}
                placeholder="music"
                className="max-w-xs"
              />
              <p className="text-xs text-muted-foreground">{t("slugCharsHint")}</p>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="title">{t("titleOptional")}</Label>
              <Input
                id="title"
                name="title"
                maxLength={80}
                placeholder={t("titlePagePlaceholder")}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="bio">{t("bioOptional")}</Label>
              <Input
                id="bio"
                name="bio"
                maxLength={300}
                placeholder={t("bioPlaceholder")}
              />
            </div>
          </CardContent>
          <CardFooter className="gap-3">
            <Button type="submit" disabled={pending}>
              <Plus className="size-4" />
              {pending ? t("creating") : t("create")}
            </Button>
            {error ? (
              <span className="text-sm text-destructive">{error}</span>
            ) : null}
          </CardFooter>
        </Card>
      </form>
    </div>
  );
}
