import { NextRequest, NextResponse } from "next/server";

import {
  exportContentTypes,
  exportExtensions,
  renderCsvExport,
  renderExcelExport,
  renderPdfExport,
} from "@/lib/export/renderers";
import { getCurrentUser } from "@/lib/auth/session";
import { getDataService } from "@/services/data-service";
import type { ExportData, ExportDataset, ExportFormat } from "@/types/export";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const exportDatasets: ExportDataset[] = ["players", "fees", "income", "cash-flow"];
const exportFormats: ExportFormat[] = ["xlsx", "csv", "pdf"];

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  }

  const dataset = request.nextUrl.searchParams.get("dataset");
  const format = request.nextUrl.searchParams.get("format");

  if (!isExportDataset(dataset) || !isExportFormat(format)) {
    return NextResponse.json(
      { message: "Dataset o formato de exportacion invalido." },
      { status: 400 },
    );
  }

  const exportData = await getDataService().getExportData(dataset);
  const body = await renderExport(exportData, format);
  const fileName = `${exportData.fileName}-${formatDateForFile(new Date())}.${exportExtensions[format]}`;

  return new NextResponse(new Uint8Array(body), {
    headers: {
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Content-Type": exportContentTypes[format],
      "Cache-Control": "no-store",
    },
  });
}

async function renderExport(data: ExportData, format: ExportFormat) {
  if (format === "csv") {
    return renderCsvExport(data);
  }

  if (format === "xlsx") {
    return renderExcelExport(data);
  }

  return renderPdfExport(data);
}

function isExportDataset(value: string | null): value is ExportDataset {
  return exportDatasets.includes(value as ExportDataset);
}

function isExportFormat(value: string | null): value is ExportFormat {
  return exportFormats.includes(value as ExportFormat);
}

function formatDateForFile(date: Date) {
  return date.toISOString().slice(0, 10);
}
