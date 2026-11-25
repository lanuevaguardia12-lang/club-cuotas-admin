import { createHash } from "node:crypto";
import { google } from "googleapis";
import { connectDatabase, reportDatabaseError } from "./connection.mjs";

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])]),
    );
  return value;
}
const checksum = (value) =>
  createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");
let sql;
try {
  sql = connectDatabase({ migration: true });
  const ids = [
    ...new Set(
      [
        process.env.GOOGLE_SHEETS_SPREADSHEET_ID,
        process.env.GOOGLE_SHEETS_CLUB_SPREADSHEET_ID,
        process.env.GOOGLE_SHEETS_PAYMENTS_SPREADSHEET_ID,
        process.env.GOOGLE_SHEETS_MATCHES_SPREADSHEET_ID,
      ].filter(Boolean),
    ),
  ];
  if (
    !ids.length ||
    !process.env.GOOGLE_SHEETS_CLIENT_EMAIL ||
    !process.env.GOOGLE_SHEETS_PRIVATE_KEY
  ) {
    throw Object.assign(new Error("Missing source credentials"), {
      code: "SHEETS_CONFIG_MISSING",
    });
  }
  const auth = new google.auth.JWT({
    email: process.env.GOOGLE_SHEETS_CLIENT_EMAIL,
    key: process.env.GOOGLE_SHEETS_PRIVATE_KEY.replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  const sheets = google.sheets({ version: "v4", auth });
  const result = await sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(827415092)`;
    const [run] =
      await tx`insert into club_private.import_runs default values returning id`;
    let count = 0;
    const manifest = [];
    for (const spreadsheetId of ids) {
      const { data: book } = await sheets.spreadsheets.get({
        spreadsheetId,
        fields: "properties,sheets.properties",
      });
      for (const sheet of book.sheets ?? []) {
        const { sheetId, title } = sheet.properties;
        const { data } = await sheets.spreadsheets.get({
          spreadsheetId,
          ranges: [`'${title.replaceAll("'", "''")}'`],
          includeGridData: true,
        });
        const snapshot = data.sheets?.find(
          (item) => item.properties?.sheetId === sheetId,
        );
        if (!snapshot)
          throw Object.assign(new Error("Incomplete source"), {
            code: "SOURCE_INCOMPLETE",
          });
        const payload = JSON.parse(
          JSON.stringify({ spreadsheet: book.properties, sheet: snapshot }),
        );
        const rows = (snapshot.data ?? []).reduce(
          (total, grid) => total + (grid.rowData?.length ?? 0),
          0,
        );
        const hash = checksum(payload);
        await tx`insert into club_private.source_sheets (run_id, spreadsheet_id, sheet_id, title, row_count, checksum, payload)
          values (${run.id}, ${spreadsheetId}, ${sheetId}, ${title}, ${rows}, ${hash}, ${tx.json(payload)})`;
        const [saved] =
          await tx`select payload from club_private.source_sheets where run_id=${run.id} and spreadsheet_id=${spreadsheetId} and sheet_id=${sheetId}`;
        if (checksum(saved.payload) !== hash)
          throw Object.assign(new Error("Archive mismatch"), {
            code: "ARCHIVE_MISMATCH",
          });
        manifest.push({ spreadsheetId, sheetId, title, rows, checksum: hash });
        count++;
      }
    }
    await tx`update club_private.import_runs set completed_at=now(), manifest=${tx.json({ sheets: manifest, note: "Archivo cotejado; falta transformación y validación funcional. La fuente puede recibir cambios durante la copia." })} where id=${run.id}`;
    return { id: run.id, count };
  });
  console.log(
    `Archivo histórico guardado y cotejado: ${result.count} pestañas; lote ${result.id}. No se activó la nueva base.`,
  );
} catch (error) {
  reportDatabaseError(error);
} finally {
  if (sql) await sql.end({ timeout: 5 });
}
