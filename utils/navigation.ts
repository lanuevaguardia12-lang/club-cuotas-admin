import type { NavigationItem } from "@/types/navigation";

export const navigationItems: NavigationItem[] = [
  {
    label: "Dashboard",
    href: "/",
    icon: "dashboard",
    permission: "dashboard:read",
  },
  {
    label: "Mi cuenta",
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
    label: "Jugador del partido",
    href: "/player-of-match",
    icon: "playerOfMatch",
    permission: "player-of-match:vote",
  },
  {
    label: "Jugadores",
    href: "/players",
    icon: "players",
    permission: "players:read",
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
