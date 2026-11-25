import type { Metadata } from "next";

import { BrandMark } from "@/components/brand/brand-mark";
import { LoginForm } from "@/components/auth/login-form";
import { appConfig } from "@/lib/env";
import { GoogleButton } from "@/components/auth/google-button";
import { googleAuthEnabled } from "@/lib/auth/google-config";
import { GOOGLE_MESSAGES } from "@/lib/auth/google-messages";
import { getSafeRedirectPath } from "@/lib/auth/redirects";

export const metadata: Metadata = {
  title: "Login",
};

interface LoginPageProps {
  searchParams: Promise<{
    redirectTo?: string;
    google?: string;
  }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;

  return (
    <main className="grid min-h-screen place-items-center px-4 py-10">
      <section className="club-card-enter border-border bg-card text-card-foreground w-full max-w-md rounded-lg border p-6 shadow-sm">
        <div className="mb-6 flex items-start gap-3">
          <BrandMark className="size-12 rounded-full" />
          <div>
            <p className="text-muted-foreground text-sm font-medium">{appConfig.name}</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-normal">
              Iniciar sesion
            </h1>
          </div>
        </div>

        {params.google && GOOGLE_MESSAGES[params.google] ? (
          <p role="status" className="mb-4 rounded-md border p-3 text-sm">
            {GOOGLE_MESSAGES[params.google]}
          </p>
        ) : null}
        {googleAuthEnabled() ? (
          <div className="mb-5 grid gap-4">
            <GoogleButton
              mode="login"
              redirectTo={getSafeRedirectPath(params.redirectTo)}
            />
            <p className="text-muted-foreground text-center text-xs">
              O ingresá con tu usuario y contraseña
            </p>
          </div>
        ) : null}
        <LoginForm redirectTo={params.redirectTo} />
      </section>
    </main>
  );
}
