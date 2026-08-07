"use client";

import {
  Bell,
  Calculator,
  CalendarDays,
  CreditCard,
  FileKey2,
  BarChart3,
  BadgeDollarSign,
  House,
  LayoutDashboard,
  Settings,
  ShieldCheck,
  Trophy,
  UserRound,
  UsersRound,
  WalletCards,
} from "lucide-react";

import { LogoutButton } from "@/components/auth/logout-button";
import { useAppSettings } from "@/components/providers/app-settings-provider";
import { NavigationLink } from "@/components/ui/navigation-link";
import { getVisibleNavigationItems } from "@/utils/navigation";
import { cn } from "@/lib/utils";
import type { AuthUser } from "@/types/auth";

interface SidebarProps {
  className?: string;
  onNavigate?: () => void;
  user: AuthUser;
}

const iconMap = {
  account: UserRound,
  api: FileKey2,
  audit: ShieldCheck,
  dashboard: House,
  myFee: BadgeDollarSign,
  playerOfMatch: Trophy,
  fixture: CalendarDays,
  feeCalculator: Calculator,
  cashFlow: WalletCards,
  players: UsersRound,
  notifications: Bell,
  payments: CreditCard,
  users: UsersRound,
  reports: BarChart3,
  settings: Settings,
};

export function Sidebar({ className, onNavigate, user }: SidebarProps) {
  const { settings } = useAppSettings();
  const visibleItems = getVisibleNavigationItems(user);

  return (
    <aside className={cn("bg-card flex h-full flex-col", className)}>
      <div className="border-border flex h-16 items-center gap-3 border-b px-5">
        {settings.logoUrl ? (
          <div
            className="border-border bg-card size-9 rounded-md border bg-contain bg-center bg-no-repeat"
            role="img"
            aria-label={`Logo de ${settings.clubName}`}
            style={{
              backgroundImage: `url("${settings.logoUrl}")`,
            }}
          />
        ) : (
          <div className="bg-primary text-primary-foreground grid size-9 place-items-center rounded-md">
            <LayoutDashboard className="size-5" aria-hidden="true" />
          </div>
        )}
        <div>
          <p className="text-sm leading-none font-semibold">{settings.clubName}</p>
          <p className="text-muted-foreground mt-1 text-xs">Administración de cuotas</p>
        </div>
      </div>

      <nav className="grid gap-1 p-3">
        {visibleItems.map((item) => {
          const Icon = iconMap[item.icon];

          return (
            <NavigationLink
              key={item.href}
              href={item.href}
              loadingMessage={`Cargando ${item.label}...`}
              onClick={onNavigate}
              className="text-muted-foreground hover:bg-muted hover:text-foreground flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors"
            >
              <Icon className="size-4" aria-hidden="true" />
              {item.label}
            </NavigationLink>
          );
        })}
      </nav>

      <div className="border-border mt-auto grid gap-3 border-t p-4">
        <div>
          <p className="text-muted-foreground text-xs font-medium">Base preparada</p>
          <p className="text-muted-foreground mt-1 text-xs">
            GitHub, Vercel, ESLint y Prettier listos.
          </p>
        </div>
        <LogoutButton className="w-full justify-start" />
      </div>
    </aside>
  );
}
