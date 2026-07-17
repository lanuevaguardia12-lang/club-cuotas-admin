import type { AuthRole, AuthUser } from "@/types/auth";

export type Permission =
  | "dashboard:read"
  | "players:read"
  | "players:write"
  | "cash-flow:read"
  | "cash-flow:write"
  | "fee-calculator:manage"
  | "exports:read"
  | "settings:write"
  | "users:manage"
  | "audit:read"
  | "notifications:manage"
  | "payments:manage"
  | "api:read"
  | "api:write";

export const roleLabels: Record<AuthRole, string> = {
  admin: "Administrador",
  coach: "Profesor",
  treasurer: "Tesorero",
};

export const roleDescriptions: Record<AuthRole, string> = {
  admin: "Acceso total al sistema, configuracion, usuarios, auditoria e integraciones.",
  coach: "Acceso operativo a jugadores, fichas, cuotas y recordatorios.",
  treasurer: "Acceso financiero a cuotas, cash flow, pagos, reportes y auditoria.",
};

const rolePermissions: Record<AuthRole, Permission[]> = {
  admin: [
    "dashboard:read",
    "players:read",
    "players:write",
    "cash-flow:read",
    "cash-flow:write",
    "fee-calculator:manage",
    "exports:read",
    "settings:write",
    "users:manage",
    "audit:read",
    "notifications:manage",
    "payments:manage",
    "api:read",
    "api:write",
  ],
  coach: ["dashboard:read", "players:read", "players:write", "notifications:manage"],
  treasurer: [
    "dashboard:read",
    "players:read",
    "cash-flow:read",
    "cash-flow:write",
    "fee-calculator:manage",
    "exports:read",
    "audit:read",
    "notifications:manage",
    "payments:manage",
    "api:read",
    "api:write",
  ],
};

export function getRolePermissions(role: AuthRole) {
  return rolePermissions[role];
}

export function hasPermission(user: AuthUser | null | undefined, permission: Permission) {
  if (!user) {
    return false;
  }

  return rolePermissions[user.role].includes(permission);
}

export function canAccessRoute(user: AuthUser, href: string) {
  if (href.startsWith("/settings")) {
    return hasPermission(user, "settings:write");
  }

  if (href.startsWith("/users")) {
    return hasPermission(user, "users:manage");
  }

  if (href.startsWith("/audit")) {
    return hasPermission(user, "audit:read");
  }

  if (href.startsWith("/payments")) {
    return hasPermission(user, "payments:manage");
  }

  if (href.startsWith("/reports")) {
    return hasPermission(user, "exports:read");
  }

  if (href.startsWith("/cash-flow")) {
    return hasPermission(user, "cash-flow:read");
  }

  if (href.startsWith("/fee-calculator")) {
    return hasPermission(user, "fee-calculator:manage");
  }

  if (href.startsWith("/notifications")) {
    return hasPermission(user, "notifications:manage");
  }

  if (href.startsWith("/api-docs")) {
    return hasPermission(user, "api:read");
  }

  return hasPermission(user, "dashboard:read");
}

export function assertPermission(
  user: AuthUser | null | undefined,
  permission: Permission,
) {
  if (!hasPermission(user, permission)) {
    throw new Error("FORBIDDEN");
  }
}
