import { redirect } from "next/navigation";
import { UserRound } from "lucide-react";

import { AccountContent } from "@/components/account/account-content";
import { Badge } from "@/components/ui/badge";
import { LOGIN_PATH } from "@/lib/auth/constants";
import { getCurrentUser } from "@/lib/auth/session";
import { getDataService } from "@/services/data-service";
import type { AccountProfileData } from "@/types/account";
import type { AuthUser } from "@/types/auth";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect(LOGIN_PATH);
  }

  const data = await loadAccountProfile(user);

  return (
    <main className="grid gap-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-muted-foreground text-sm font-medium">Perfil</p>
          <h1 className="mt-2 flex items-center gap-2 text-2xl font-semibold tracking-normal sm:text-3xl">
            <UserRound className="text-primary size-7" />
            Mi perfil
          </h1>
          <p className="text-muted-foreground mt-2 max-w-2xl text-sm">
            Tu ficha futbolera, datos de contacto y opciones de acceso.
          </p>
        </div>
        <Badge variant={data.source.status === "ready" ? "success" : "secondary"}>
          {data.source.status}
        </Badge>
      </header>

      {data.source.status === "error" ? (
        <div className="rounded-md border border-yellow-300 bg-yellow-50 p-4 text-sm text-yellow-950 dark:border-yellow-500/40 dark:bg-yellow-500/10 dark:text-yellow-100">
          <p className="font-semibold">No pudimos cargar algunos datos del perfil.</p>
          <p className="text-muted-foreground mt-1">
            Podés seguir usando la app. Revisá la hoja de usuarios si falta la foto o
            algún dato personal.
          </p>
          {data.source.message ? (
            <p className="text-muted-foreground mt-2 break-words text-xs">
              Detalle: {data.source.message}
            </p>
          ) : null}
        </div>
      ) : null}

      <AccountContent profile={data.profile} />
    </main>
  );
}

async function loadAccountProfile(user: AuthUser): Promise<AccountProfileData> {
  try {
    return await getDataService().getAccountProfile(user);
  } catch (error) {
    return {
      profile: {
        userId: user.id,
        username: user.username,
        role: user.role,
        playerId: user.playerId,
        name: user.name,
        birthDate: "",
        email: "",
        phone: "",
        profilePhotoDataUrl: "",
        updatedAt: "",
        passwordUpdatedAt: "",
      },
      source: {
        provider: getFallbackProvider(),
        status: "error",
        message: getAccountProfileErrorMessage(error),
        cachedAt: new Date().toISOString(),
        revalidateSeconds: 0,
      },
    };
  }
}

function getFallbackProvider() {
  const source = process.env.DATA_SOURCE ?? "google-sheets";

  return source === "database" || source === "postgresql"
    ? ("postgresql" as const)
    : ("google-sheets" as const);
}

function getAccountProfileErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "No se pudo abrir el perfil.";
}
