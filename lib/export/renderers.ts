import "server-only";

import { strToU8, zipSync } from "fflate";
import PDFDocument from "pdfkit";

import type { ExportData, ExportFormat } from "@/types/export";

export const exportContentTypes: Record<ExportFormat, string> = {
  csv: "text/csv; charset=utf-8",
  pdf: "application/pdf",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

export const exportExtensions: Record<ExportFormat, string> = {
  csv: "csv",
  pdf: "pdf",
  xlsx: "xlsx",
};

export function renderCsvExport(data: ExportData) {
  const header = data.columns.map((column) => escapeCsvCell(column.header)).join(",");
  const rows = data.rows.map((row) =>
    data.columns
      .map((column) => escapeCsvCell(formatExportValue(row[column.key])))
      .join(","),
  );

  return Buffer.from(`\ufeff${[header, ...rows].join("\n")}`, "utf8");
}

export function renderExcelExport(data: ExportData) {
  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(buildContentTypesXml()),
    "_rels/.rels": strToU8(buildRootRelsXml()),
    "xl/workbook.xml": strToU8(buildWorkbookXml(data.title)),
    "xl/_rels/workbook.xml.rels": strToU8(buildWorkbookRelsXml()),
    "xl/styles.xml": strToU8(buildStylesXml()),
    "xl/worksheets/sheet1.xml": strToU8(buildWorksheetXml(data)),
  };

  return Buffer.from(zipSync(files));
}

export async function renderPdfExport(data: ExportData) {
  const document = new PDFDocument({
    layout: "landscape",
    margin: 32,
    size: "A4",
  });
  const chunks: Buffer[] = [];

  document.on("data", (chunk: Buffer) => chunks.push(chunk));

  const finished = new Promise<Buffer>((resolve) => {
    document.on("end", () => resolve(Buffer.concat(chunks)));
  });

  writePdfHeader(document, data);
  writePdfTable(document, data);
  document.end();

  return finished;
}

function writePdfHeader(document: PDFKit.PDFDocument, data: ExportData) {
  document.fontSize(18).text(data.title, { continued: false });
  document
    .moveDown(0.25)
    .fontSize(9)
    .fillColor("#64748b")
    .text(`Generado: ${formatExportValue(data.generatedAt)}`)
    .text(`Registros: ${data.rows.length}`)
    .moveDown(1)
    .fillColor("#111827");
}

function writePdfTable(document: PDFKit.PDFDocument, data: ExportData) {
  const pageWidth =
    document.page.width - document.page.margins.left - document.page.margins.right;
  const rowHeight = 22;
  const columnWidth = pageWidth / Math.max(data.columns.length, 1);
  let y = document.y;

  drawPdfRow(
    document,
    data.columns.map((column) => column.header),
    y,
    columnWidth,
    true,
  );
  y += rowHeight;

  if (data.rows.length === 0) {
    document
      .fontSize(10)
      .fillColor("#64748b")
      .text("No hay datos para exportar.", document.page.margins.left, y + 8);
    return;
  }

  for (const row of data.rows) {
    if (y + rowHeight > document.page.height - document.page.margins.bottom) {
      document.addPage();
      y = document.page.margins.top;
      drawPdfRow(
        document,
        data.columns.map((column) => column.header),
        y,
        columnWidth,
        true,
      );
      y += rowHeight;
    }

    drawPdfRow(
      document,
      data.columns.map((column) => formatExportValue(row[column.key])),
      y,
      columnWidth,
    );
    y += rowHeight;
  }
}

function drawPdfRow(
  document: PDFKit.PDFDocument,
  cells: string[],
  y: number,
  columnWidth: number,
  isHeader = false,
) {
  const startX = document.page.margins.left;
  const rowHeight = 22;

  cells.forEach((cell, index) => {
    const x = startX + index * columnWidth;

    document
      .rect(x, y, columnWidth, rowHeight)
      .fillAndStroke(isHeader ? "#0f766e" : "#ffffff", "#d8dee8");
    document
      .fillColor(isHeader ? "#ffffff" : "#111827")
      .fontSize(isHeader ? 8 : 7)
      .text(truncate(cell, isHeader ? 24 : 30), x + 4, y + 6, {
        width: columnWidth - 8,
        lineBreak: false,
      });
  });

  document.fillColor("#111827");
}

function buildContentTypesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`;
}

function buildRootRelsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;
}

function buildWorkbookXml(title: string) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="${escapeXml(sanitizeWorksheetName(title))}" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`;
}

function buildWorkbookRelsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;
}

function buildStylesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="2">
    <font><sz val="11"/><name val="Calibri"/></font>
    <font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
  </fonts>
  <fills count="3">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF0F766E"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="2">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
  </cellXfs>
</styleSheet>`;
}

function buildWorksheetXml(data: ExportData) {
  const allRows = [
    data.columns.map((column) => column.header),
    ...data.rows.map((row) => data.columns.map((column) => row[column.key])),
  ];
  const sheetRows = allRows
    .map((row, rowIndex) => buildSheetRow(row, rowIndex + 1, rowIndex === 0))
    .join("");
  const lastColumn = toExcelColumn(Math.max(data.columns.length, 1));
  const lastRow = Math.max(allRows.length, 1);

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
  <cols>${data.columns
    .map(
      (column, index) =>
        `<col min="${index + 1}" max="${index + 1}" width="${Math.max(column.header.length + 5, 16)}" customWidth="1"/>`,
    )
    .join("")}</cols>
  <sheetData>${sheetRows}</sheetData>
  <autoFilter ref="A1:${lastColumn}${lastRow}"/>
</worksheet>`;
}

function buildSheetRow(values: unknown[], rowNumber: number, isHeader: boolean) {
  const cells = values
    .map((value, index) => buildSheetCell(value, rowNumber, index + 1, isHeader))
    .join("");

  return `<row r="${rowNumber}">${cells}</row>`;
}

function buildSheetCell(
  value: unknown,
  rowNumber: number,
  columnNumber: number,
  isHeader: boolean,
) {
  const reference = `${toExcelColumn(columnNumber)}${rowNumber}`;
  const style = isHeader ? ' s="1"' : "";

  if (typeof value === "number" && Number.isFinite(value)) {
    return `<c r="${reference}"${style}><v>${value}</v></c>`;
  }

  return `<c r="${reference}" t="inlineStr"${style}><is><t>${escapeXml(formatExportValue(value))}</t></is></c>`;
}

function escapeCsvCell(value: string) {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replaceAll('"', '""')}"`;
  }

  return value;
}

function formatExportValue(value: unknown) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value);
}

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function sanitizeWorksheetName(value: string) {
  return (
    value
      .replace(/[\][:*?/\\]/g, " ")
      .trim()
      .slice(0, 31) || "Export"
  );
}

function toExcelColumn(columnNumber: number) {
  let column = "";
  let value = columnNumber;

  while (value > 0) {
    const remainder = (value - 1) % 26;
    column = String.fromCharCode(65 + remainder) + column;
    value = Math.floor((value - 1) / 26);
  }

  return column;
}

function truncate(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 3)}...` : value;
}
