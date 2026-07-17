import { Download } from "lucide-react";

import { ExportPanel } from "@/components/reports/export-panel";

export default function ReportsPage() {
  return (
    <main className="grid gap-6">
      <header>
        <p className="text-muted-foreground text-sm font-medium">Reportes</p>
        <h1 className="mt-2 flex items-center gap-2 text-2xl font-semibold tracking-normal sm:text-3xl">
          <Download className="text-muted-foreground size-7" aria-hidden="true" />
          Exportaciones
        </h1>
        <p className="text-muted-foreground mt-2 max-w-2xl text-sm">
          Descarga informacion operativa y financiera en Excel, CSV o PDF.
        </p>
      </header>

      <ExportPanel />
    </main>
  );
}
