import type { Metadata } from "next";
import { LayoutDashboard } from "lucide-react";

import { LoginForm } from "@/components/auth/login-form";
import { appConfig } from "@/lib/env";

export const metadata: Metadata = {
  title: "Login",
};

interface LoginPageProps {
  searchParams: Promise<{
    redirectTo?: string;
  }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;

  return (
    <main className="grid min-h-screen place-items-center px-4 py-10">
      <section className="border-border bg-card text-card-foreground w-full max-w-md rounded-lg border p-6 shadow-sm">
        <div className="mb-6 flex items-start gap-3">
          <div className="bg-primary text-primary-foreground grid size-10 place-items-center rounded-md">
            <LayoutDashboard className="size-5" aria-hidden="true" />
          </div>
          <div>
            <p className="text-muted-foreground text-sm font-medium">{appConfig.name}</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-normal">
              Iniciar sesion
            </h1>
          </div>
        </div>

        <LoginForm redirectTo={params.redirectTo} />
      </section>
    </main>
  );
}
