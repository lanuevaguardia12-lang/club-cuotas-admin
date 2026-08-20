import { redirect } from "next/navigation";
import { ShieldCheck, UserCog, UsersRound } from "lucide-react";

import { EmptySection } from "@/components/layout/empty-section";
import { UserPasswordForm } from "@/components/users/user-password-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getRolePermissions,
  hasPermission,
  roleDescriptions,
  roleLabels,
} from "@/lib/auth/roles";
import { getCurrentUser } from "@/lib/auth/session";
import { getConfiguredAuthUsers } from "@/services/auth/env-admin-user-store";
import { getDataService } from "@/services/data-service";
import type { AccountUser } from "@/types/account";
import type { AuthRole } from "@/types/auth";

const roles: AuthRole[] = ["admin", "treasurer", "coach", "player", "fan"];

export const dynamic = "force-dynamic";

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

  const users = await getUsersForAdmin();

  return (
    <main className="grid gap-6">
      <header>
        <p className="text-muted-foreground text-sm font-medium">Seguridad</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-normal sm:text-3xl">
          Usuarios y roles
        </h1>
        <p className="text-muted-foreground mt-2 max-w-2xl text-sm">
          Administrá accesos, cuentas fan y cambios de contraseña sin exponer credenciales
          en el código.
        </p>
      </header>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
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
          <CardTitle>Listado de usuarios</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          {users.length > 0 ? (
            users.map((account) => (
              <article
                key={`${account.source}-${account.userId}-${account.username}`}
                className="border-border bg-muted/20 grid gap-4 rounded-md border p-4"
              >
                <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-base font-semibold">{account.name}</h2>
                      <Badge variant="secondary">{roleLabels[account.role]}</Badge>
                      <Badge variant={account.hasPassword ? "success" : "outline"}>
                        {account.hasPassword ? "Password propio" : "Password env"}
                      </Badge>
                    </div>
                    <div className="text-muted-foreground mt-2 grid gap-1 text-sm sm:grid-cols-2 xl:grid-cols-4">
                      <p>
                        Usuario:{" "}
                        <span className="text-foreground font-medium">
                          {account.username}
                        </span>
                      </p>
                      <p>
                        ID:{" "}
                        <span className="text-foreground font-medium">
                          {account.userId}
                        </span>
                      </p>
                      <p>Origen: {formatSource(account.source)}</p>
                      <p>
                        Último cambio:{" "}
                        {account.passwordUpdatedAt
                          ? formatDateTime(account.passwordUpdatedAt)
                          : "-"}
                      </p>
                    </div>
                  </div>
                  <div className="text-muted-foreground text-sm lg:text-right">
                    <p>{account.email || "Sin email"}</p>
                    <p>{account.phone || "Sin teléfono"}</p>
                  </div>
                </div>
                <UserPasswordForm user={account} />
              </article>
            ))
          ) : (
            <EmptySection
              eyebrow="Sin usuarios"
              title="Todavía no hay cuentas visibles"
              description="Revisá AUTH_USERS_JSON o la hoja CuentasUsuario."
            />
          )}
        </CardContent>
      </Card>
    </main>
  );
}

async function getUsersForAdmin(): Promise<AccountUser[]> {
  const configuredUsers = getConfiguredAuthUsers();
  const sheetUsers = await getDataService()
    .getAccountUsers()
    .catch(() => []);
  const merged = new Map<string, AccountUser>();

  configuredUsers.forEach((user) => {
    merged.set(user.username, {
      userId: user.id,
      username: user.username,
      role: user.role,
      playerId: user.playerId,
      name: user.name,
      birthDate: "",
      email: "",
      phone: "",
      hasPassword: false,
      passwordUpdatedAt: "",
      updatedAt: "",
      source: "env",
    });
  });

  sheetUsers.forEach((sheetUser) => {
    const existing = merged.get(sheetUser.username);

    if (!existing) {
      merged.set(sheetUser.username, sheetUser);
      return;
    }

    merged.set(sheetUser.username, {
      ...existing,
      birthDate: sheetUser.birthDate || existing.birthDate,
      email: sheetUser.email || existing.email,
      hasPassword: sheetUser.hasPassword,
      name: sheetUser.name || existing.name,
      passwordUpdatedAt: sheetUser.passwordUpdatedAt,
      phone: sheetUser.phone || existing.phone,
      updatedAt: sheetUser.updatedAt,
      source: "env+sheet",
    });
  });

  return Array.from(merged.values()).sort((left, right) => {
    const roleComparison = roles.indexOf(left.role) - roles.indexOf(right.role);

    if (roleComparison !== 0) {
      return roleComparison;
    }

    return left.name.localeCompare(right.name, "es");
  });
}

function formatSource(source: AccountUser["source"]) {
  if (source === "env+sheet") {
    return "Env + Sheet";
  }

  return source === "env" ? "Env" : "Sheet";
}

function formatDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}
