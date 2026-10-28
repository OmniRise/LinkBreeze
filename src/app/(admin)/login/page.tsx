import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getSession } from "@/lib/auth";
import { getOidcConfig } from "@/server/queries";
import { getOidcClientSecret } from "@/server/oidc-flow";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  // If already logged in, skip the login screen entirely. Without this,
  // the admin layout wraps /login in the full sidebar chrome.
  const session = await getSession();
  if (session) {
    redirect("/dashboard");
  }

  // #124 SSO: the button renders when issuer + client id are configured and
  // the env secret exists (a config without its secret cannot complete).
  const oidc = await getOidcConfig();
  const ssoAvailable = oidc !== null && getOidcClientSecret() !== null;

  return (
    <Suspense fallback={null}>
      <LoginForm ssoAvailable={ssoAvailable} ssoReplacesLocal={oidc?.mode === "replaces_local"} />
    </Suspense>
  );
}
