"use client";

import {
  BadgeDollarSign,
  BarChart3,
  Bell,
  Calculator,
  CalendarDays,
  CreditCard,
  FileKey2,
  LayoutDashboard,
  Settings,
  ShieldCheck,
  Trophy,
  UserRound,
  UsersRound,
  WalletCards,
} from "lucide-react";
import { usePathname } from "next/navigation";

import { NavigationLink } from "@/components/ui/navigation-link";
import { hasPermission } from "@/lib/auth/roles";
import { cn } from "@/lib/utils";
import type { AuthUser } from "@/types/auth";
import { navigationItems } from "@/utils/navigation";

interface MobileBottomNavProps {
  user: AuthUser;
}

const iconMap = {
  account: UserRound,
  api: FileKey2,
  audit: ShieldCheck,
  dashboard: LayoutDashboard,
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

export function MobileBottomNav({ user }: MobileBottomNavProps) {
  const pathname = usePathname();
  const visibleItems = navigationItems.filter((item) =>
    hasPermission(user, item.permission),
  );

  return (
    <nav className="border-border bg-card/95 fixed inset-x-0 bottom-0 z-50 border-t shadow-[0_-12px_30px_rgba(15,23,42,0.08)] backdrop-blur lg:hidden">
      <div className="flex gap-1 overflow-x-auto px-2 pt-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)]">
        {visibleItems.map((item) => {
          const Icon = iconMap[item.icon];
          const active = isActivePath(pathname, item.href);

          return (
            <NavigationLink
              key={item.href}
              href={item.href}
              loadingMessage={`Cargando ${item.label}...`}
              className={cn(
                "text-muted-foreground flex min-w-[4.75rem] flex-col items-center justify-center gap-1 rounded-md px-2 py-2 text-[0.7rem] leading-tight font-medium transition-colors",
                active && "bg-secondary text-primary",
              )}
            >
              <Icon className="size-5" aria-hidden="true" />
              <span className="line-clamp-1">{item.label}</span>
            </NavigationLink>
          );
        })}
      </div>
    </nav>
  );
}

function isActivePath(pathname: string, href: string) {
  if (href === "/") {
    return pathname === "/";
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}
