import type { Permission } from "@/lib/auth/roles";

export type NavigationIcon =
  | "dashboard"
  | "myFee"
  | "players"
  | "cashFlow"
  | "feeCalculator"
  | "users"
  | "reports"
  | "settings"
  | "audit"
  | "notifications"
  | "payments"
  | "api";

export interface NavigationItem {
  label: string;
  href: string;
  icon: NavigationIcon;
  permission: Permission;
}
