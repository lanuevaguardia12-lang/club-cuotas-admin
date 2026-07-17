export type ExportDataset = "players" | "fees" | "income" | "cash-flow";
export type ExportFormat = "xlsx" | "csv" | "pdf";

export type ExportCellValue = string | number | null;

export interface ExportColumn {
  key: string;
  header: string;
  type?: "text" | "number" | "currency" | "date";
}

export type ExportRow = Record<string, ExportCellValue>;

export interface ExportData {
  dataset: ExportDataset;
  title: string;
  fileName: string;
  generatedAt: string;
  columns: ExportColumn[];
  rows: ExportRow[];
}
