import { redirect } from "next/navigation";
import { ShieldCheck, UserCog, UsersRound } from "lucide-react";

import { EmptySection } from "@/components/layout/empty-section";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getRolePermissions,
  hasPermission,
  roleDescriptions,
  roleLabels,
} from "@/lib/auth/roles";
import { getCurrentUser } from "@/lib/auth/session";
import type { AuthRole } from "@/types/auth";

const roles: AuthRole[] = ["admin", "treasurer", "coach"];

export default async function UsersPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (!hasPermission(user, "users:manage")) {
    return (
      <EmptySection
        eyebrow="Acceso restringido"
        title="Usuarios"
        description="Tu rol no tiene permisos para administrar usuarios."
      />
    );
  }

  return (
    <main className="grid gap-6">
      <header>
        <p className="text-muted-foreground text-sm font-medium">Seguridad</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-normal sm:text-3xl">
          Usuarios y roles
        </h1>
        <p className="text-muted-foreground mt-2 max-w-2xl text-sm">
          Base RBAC preparada para multiples usuarios. Hoy se alimenta desde variables de
          entorno y luego puede migrar a PostgreSQL.
        </p>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        {roles.map((role) => (
          <Card key={role}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-base">{roleLabels[role]}</CardTitle>
              <div className="bg-primary/10 text-primary rounded-md p-2">
                {role === "admin" ? (
                  <ShieldCheck className="size-4" aria-hidden="true" />
                ) : role === "treasurer" ? (
                  <UserCog className="size-4" aria-hidden="true" />
                ) : (
                  <UsersRound className="size-4" aria-hidden="true" />
                )}
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-sm">{roleDescriptions[role]}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {getRolePermissions(role).map((permission) => (
                  <Badge key={permission} variant="secondary">
                    {permission}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Configuracion actual</CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground grid gap-2 text-sm">
          <p>
            Usuario conectado:{" "}
            <span className="text-foreground font-medium">{user.name}</span>
          </p>
          <p>
            Rol:{" "}
            <span className="text-foreground font-medium">{roleLabels[user.role]}</span>
          </p>
          <p>
            Para multiples usuarios usar <code>AUTH_USERS_JSON</code> con usuarios,
            contraseña y rol. No guardar credenciales en el codigo.
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
