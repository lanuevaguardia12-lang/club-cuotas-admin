"use client";

import { Menu, Search } from "lucide-react";
import { useState } from "react";

import { BrandMark } from "@/components/brand/brand-mark";
import { Sidebar } from "@/components/layout/sidebar";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { useAppSettings } from "@/components/providers/app-settings-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { roleLabels } from "@/lib/auth/roles";
import type { AuthUser } from "@/types/auth";

interface NavbarProps {
  user: AuthUser;
}

export function Navbar({ user }: NavbarProps) {
  const { settings } = useAppSettings();
  const [adminMenuOpen, setAdminMenuOpen] = useState(false);

  return (
    <header className="border-border bg-card/95 sticky top-0 z-30 border-b backdrop-blur">
      <div className="flex h-16 items-center gap-3 px-4 sm:px-6 lg:px-8">
        {user.role === "admin" ? (
          <Sheet open={adminMenuOpen} onOpenChange={setAdminMenuOpen}>
            <SheetTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="lg:hidden"
                aria-label="Abrir menú"
              >
                <Menu className="size-5" aria-hidden="true" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0">
              <SheetTitle className="sr-only">Menú principal</SheetTitle>
              <Sidebar
                user={user}
                className="h-full"
                onNavigate={() => setAdminMenuOpen(false)}
              />
            </SheetContent>
          </Sheet>
        ) : null}

        <div className="flex min-w-0 items-center gap-2 lg:hidden">
          <BrandMark
            className="size-9 rounded-full"
            alt={`Escudo de ${settings.clubName}`}
          />
          <span className="truncate text-sm font-semibold">{settings.clubName}</span>
        </div>

        <div className="border-input bg-background text-muted-foreground hidden min-w-0 flex-1 items-center gap-2 rounded-md border px-3 py-2 text-sm md:flex">
          <Search className="size-4" aria-hidden="true" />
          <span>Buscar...</span>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <div className="hidden text-right sm:block">
            <p className="text-sm leading-none font-medium">{user.name}</p>
            <p className="text-muted-foreground mt-1 text-xs">{roleLabels[user.role]}</p>
          </div>
          <ThemeToggle />
          <NotificationBell
            user={user}
            hydrateDelayMs={user.role === "player" ? 1200 : 0}
          />
        </div>
      </div>
    </header>
  );
}
