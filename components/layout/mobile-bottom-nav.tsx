"use client";

import {
  BadgeDollarSign,
  BarChart3,
  Bell,
  Calculator,
  CalendarDays,
  CreditCard,
  FileKey2,
  House,
  Settings,
  ShieldCheck,
  Trophy,
  UserRound,
  UsersRound,
  WalletCards,
} from "lucide-react";
import { usePathname } from "next/navigation";

import { NavigationLink } from "@/components/ui/navigation-link";
import { cn } from "@/lib/utils";
import type { AuthUser } from "@/types/auth";
import { getVisibleNavigationItems } from "@/utils/navigation";

interface MobileBottomNavProps {
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

export function MobileBottomNav({ user }: MobileBottomNavProps) {
  const pathname = usePathname();
  const visibleItems = getVisibleNavigationItems(user);
  const orderedItems = centerHomeItem(visibleItems);

  return (
    <nav className="bg-primary text-primary-foreground border-primary fixed inset-x-0 bottom-0 z-50 border-t shadow-[0_-12px_30px_rgba(1,47,119,0.2)] backdrop-blur lg:hidden">
      <div className="flex gap-1 overflow-x-auto px-2 pt-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)]">
        {orderedItems.map((item) => {
          const Icon = iconMap[item.icon];
          const active = isActivePath(pathname, item.href);

          return (
            <NavigationLink
              key={item.href}
              href={item.href}
              loadingMessage={`Cargando ${item.label}...`}
              className={cn(
                "flex min-w-[4.75rem] flex-col items-center justify-center gap-1 rounded-md px-2 py-2 text-[0.7rem] leading-tight font-medium text-white/75 transition-colors hover:bg-white/10 hover:text-white",
                active && "text-primary hover:text-primary bg-white hover:bg-white",
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

function centerHomeItem<T extends { href: string }>(items: T[]) {
  const homeItem = items.find((item) => item.href === "/");

  if (!homeItem) {
    return items;
  }

  const otherItems = items.filter((item) => item.href !== "/");
  const centerIndex = Math.ceil(otherItems.length / 2);

  return [
    ...otherItems.slice(0, centerIndex),
    homeItem,
    ...otherItems.slice(centerIndex),
  ];
}

function isActivePath(pathname: string, href: string) {
  if (href === "/") {
    return pathname === "/";
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}
