import { redirect } from "next/navigation";
import { UserRound } from "lucide-react";

import { AccountContent } from "@/components/account/account-content";
import { Badge } from "@/components/ui/badge";
import { LOGIN_PATH } from "@/lib/auth/constants";
import { getCurrentUser } from "@/lib/auth/session";
import { getDataService } from "@/services/data-service";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect(LOGIN_PATH);
  }

  const data = await getDataService().getAccountProfile(user);

  return (
    <main className="grid gap-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-muted-foreground text-sm font-medium">Perfil</p>
          <h1 className="mt-2 flex items-center gap-2 text-2xl font-semibold tracking-normal sm:text-3xl">
            <UserRound className="text-primary size-7" />
            Mi cuenta
          </h1>
          <p className="text-muted-foreground mt-2 max-w-2xl text-sm">
            Editá tu información personal, foto de perfil y contraseña de acceso.
          </p>
        </div>
        <Badge variant={data.source.status === "ready" ? "success" : "secondary"}>
          {data.source.status}
        </Badge>
      </header>

      <AccountContent profile={data.profile} />
    </main>
  );
}
