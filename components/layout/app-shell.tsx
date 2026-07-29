import { Navbar } from "@/components/layout/navbar";
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
        <div className="bg-background min-h-screen">
          <Sidebar
            user={user}
            className="border-border bg-card fixed inset-y-0 left-0 z-40 hidden w-72 border-r lg:flex"
          />
          <div className="lg:pl-72">
            <Navbar user={user} />
            <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
              {children}
            </div>
          </div>
        </div>
      </NavigationLoadingProvider>
    </AppSettingsProvider>
  );
}
