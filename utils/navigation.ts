import { hasPermission } from "@/lib/auth/roles";
import type { AuthUser } from "@/types/auth";
import type { NavigationItem } from "@/types/navigation";

export const navigationItems: NavigationItem[] = [
  {
    label: "Home",
    href: "/",
    icon: "dashboard",
    permission: "dashboard:read",
  },
  {
    label: "Mi perfil",
    href: "/account",
    icon: "account",
    permission: "account:manage",
  },
  {
    label: "Mi cuota",
    href: "/mi-cuota",
    icon: "myFee",
    permission: "player:self:read",
  },
  {
    label: "MVP",
    href: "/player-of-match",
    icon: "playerOfMatch",
    permission: "player-of-match:vote",
  },
  {
    label: "Fixture",
    href: "/fixture",
    icon: "fixture",
    permission: "fixture:read",
  },
  {
    label: "Plantel",
    href: "/squad",
    icon: "players",
    permission: "squad:read",
  },
  {
    label: "Jugadores",
    href: "/players",
    icon: "players",
    permission: "players:read",
  },
  {
    label: "Equipos",
    href: "/teams",
    icon: "teams",
    permission: "teams:manage",
  },
  {
    label: "Cash Flow",
    href: "/cash-flow",
    icon: "cashFlow",
    permission: "cash-flow:read",
  },
  {
    label: "Calculador de cuota",
    href: "/fee-calculator",
    icon: "feeCalculator",
    permission: "fee-calculator:manage",
  },
  {
    label: "Registros DT",
    href: "/coach-records",
    icon: "coachRecords",
    permission: "coach-records:manage",
  },
  {
    label: "Pagos",
    href: "/payments",
    icon: "payments",
    permission: "payments:manage",
  },
  {
    label: "Notificaciones",
    href: "/notifications",
    icon: "notifications",
    permission: "notifications:manage",
  },
  {
    label: "Auditoria",
    href: "/audit",
    icon: "audit",
    permission: "audit:read",
  },
  {
    label: "API REST",
    href: "/api-docs",
    icon: "api",
    permission: "api:read",
  },
  {
    label: "Usuarios",
    href: "/users",
    icon: "users",
    permission: "users:manage",
  },
  {
    label: "Reportes",
    href: "/reports",
    icon: "reports",
    permission: "exports:read",
  },
  {
    label: "Configuracion",
    href: "/settings",
    icon: "settings",
    permission: "settings:write",
  },
];

const adminNavigationHrefs = new Set([
  "/",
  "/account",
  "/player-of-match",
  "/fixture",
  "/players",
  "/teams",
  "/cash-flow",
  "/fee-calculator",
  "/coach-records",
  "/payments",
  "/audit",
  "/api-docs",
  "/users",
  "/reports",
  "/settings",
]);

export function getVisibleNavigationItems(user: AuthUser) {
  const permittedItems = navigationItems.filter((item) =>
    hasPermission(user, item.permission),
  );

  if (user.role !== "admin") {
    return permittedItems;
  }

  return permittedItems.filter((item) => adminNavigationHrefs.has(item.href));
}
