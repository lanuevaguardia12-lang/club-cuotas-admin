"use client";

import {
  CircleDollarSign,
  CreditCard,
  FileSpreadsheet,
  FileText,
  TableProperties,
  UsersRound,
  WalletCards,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ExportDataset, ExportFormat } from "@/types/export";

const datasets: Array<{
  description: string;
  icon: typeof UsersRound;
  title: string;
  value: ExportDataset;
}> = [
  {
    description: "Listado de jugadores con categoria, telefono, cuota, alta y baja.",
    icon: UsersRound,
    title: "Jugadores",
    value: "players",
  },
  {
    description: "Detalle completo de cuotas, periodo, estado, vencimiento y pago.",
    icon: CreditCard,
    title: "Cuotas",
    value: "fees",
  },
  {
    description: "Ingresos cobrados desde cuotas pagadas.",
    icon: CircleDollarSign,
    title: "Ingresos",
    value: "income",
  },
  {
    description: "Movimientos financieros de ingresos y gastos.",
    icon: WalletCards,
    title: "Cash Flow",
    value: "cash-flow",
  },
];

const formats: Array<{
  icon: typeof FileSpreadsheet;
  label: string;
  value: ExportFormat;
}> = [
  { icon: FileSpreadsheet, label: "Excel", value: "xlsx" },
  { icon: TableProperties, label: "CSV", value: "csv" },
  { icon: FileText, label: "PDF", value: "pdf" },
];

export function ExportPanel() {
  return (
    <section className="grid gap-4 md:grid-cols-2">
      {datasets.map((dataset) => {
        const Icon = dataset.icon;

        return (
          <Card key={dataset.value}>
            <CardHeader>
              <div className="flex items-start gap-3">
                <div className="bg-primary text-primary-foreground grid size-10 place-items-center rounded-md">
                  <Icon className="size-5" aria-hidden="true" />
                </div>
                <div>
                  <CardTitle className="text-base">{dataset.title}</CardTitle>
                  <p className="text-muted-foreground mt-1 text-sm">
                    {dataset.description}
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid gap-2 sm:grid-cols-3">
                {formats.map((format) => {
                  const FormatIcon = format.icon;

                  return (
                    <Button key={format.value} asChild variant="outline" size="sm">
                      <a href={buildExportHref(dataset.value, format.value)}>
                        <FormatIcon />
                        {format.label}
                      </a>
                    </Button>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </section>
  );
}

function buildExportHref(dataset: ExportDataset, format: ExportFormat) {
  const params = new URLSearchParams({
    dataset,
    format,
  });

  return `/api/exports?${params.toString()}`;
}
