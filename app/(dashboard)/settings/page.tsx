import { ClubSettingsPanel } from "@/components/settings/club-settings-panel";
import { getDataService } from "@/services/data-service";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const settingsData = await getDataService().getAppSettings();

  return (
    <main className="grid gap-6">
      <header>
        <p className="text-muted-foreground text-sm font-medium">Configuración</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-normal sm:text-3xl">
          Configuración
        </h1>
        <p className="text-muted-foreground mt-2 max-w-2xl text-sm">
          Ajustes operativos del sistema.
        </p>
      </header>

      <ClubSettingsPanel initialSettings={settingsData.settings} />

      {settingsData.source.status === "error" ? (
        <section className="border-destructive/30 bg-destructive/10 text-destructive rounded-lg border p-4 text-sm">
          {settingsData.source.message}
        </section>
      ) : null}
    </main>
  );
}
