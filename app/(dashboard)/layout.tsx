import { redirect } from "next/navigation";

import { AppShell } from "@/components/layout/app-shell";
import { LOGIN_PATH } from "@/lib/auth/constants";
import { getCurrentUser } from "@/lib/auth/session";
import { getDataService } from "@/services/data-service";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await getCurrentUser();

  if (!user) {
    redirect(LOGIN_PATH);
  }

  const settingsData = await getDataService().getAppSettings();

  return (
    <AppShell user={user} settings={settingsData.settings}>
      {children}
    </AppShell>
  );
}
