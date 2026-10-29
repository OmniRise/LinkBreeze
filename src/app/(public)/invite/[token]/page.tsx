import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { getRoleById, getValidInvite } from "@/server/queries";
import { hashInviteToken } from "@/lib/invite-token";

import { InviteAcceptForm } from "./invite-accept-form";

export const dynamic = "force-dynamic";

/**
 * Public invitation acceptance (#124 follow-up, stage 1). Validates the token
 * server-side before rendering the form; an invalid/expired/used token gets
 * a neutral 404 — no information leak about which invitations exist.
 */
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = await getValidInvite(hashInviteToken(token));
  if (!invite) notFound();

  const t = await getTranslations("invite");
  const role = invite.roleId ? await getRoleById(invite.roleId) : null;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-4 py-10">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">
          {role ? t("invitedAs", { role: role.name }) : t("invitedGeneric")}
        </p>
      </div>
      <InviteAcceptForm token={token} />
    </main>
  );
}
