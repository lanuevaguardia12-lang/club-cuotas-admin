import { Navbar } from "@/components/layout/navbar";
import { MobileBottomNav } from "@/components/layout/mobile-bottom-nav";
import { Sidebar } from "@/components/layout/sidebar";
import { AppSettingsProvider } from "@/components/providers/app-settings-provider";
import { NavigationLoadingProvider } from "@/components/providers/navigation-loading-provider";
import type { AuthUser } from "@/types/auth";
import type { AppSettings } from "@/types/settings";

interface AppShellProps {
  children: React.ReactNode;
  settings: AppSettings;
  user: AuthUser;
}

export function AppShell({ children, settings, user }: AppShellProps) {
  return (
    <AppSettingsProvider initialSettings={settings}>
      <NavigationLoadingProvider>
        <div className="bg-background min-h-dvh overflow-x-clip">
          <Sidebar
            user={user}
            className="border-border bg-card fixed inset-y-0 left-0 z-40 hidden w-72 border-r lg:flex"
          />
          <div className="min-w-0 lg:pl-72">
            <Navbar user={user} />
            <div className="mx-auto w-full max-w-7xl min-w-0 px-4 pt-5 pb-28 sm:px-6 sm:pt-6 sm:pb-28 lg:px-8 lg:py-6">
              {children}
            </div>
          </div>
          <MobileBottomNav user={user} />
        </div>
      </NavigationLoadingProvider>
    </AppSettingsProvider>
  );
}
