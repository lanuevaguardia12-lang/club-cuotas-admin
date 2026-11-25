import assert from "node:assert/strict";
import { connectDatabase, reportDatabaseError } from "./connection.mjs";
import { loadTypeScript } from "./load-typescript.mjs";

const sql = connectDatabase({ migration: true });
try {
  const runId = process.argv[2];
  if (!runId || !/^[\da-f-]{36}$/i.test(runId))
    throw Object.assign(new Error(), { code: "IMPORT_RUN_REQUIRED" });
  const { directoryCodec } = loadTypeScript("services/GoogleSheetsService.ts");
  await sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(827415093)`;
    const [previous] =
      await tx`select counts from club_directory.imports where run_id=${runId}`;
    if (previous) {
      console.log("Este lote ya fue importado. No se modificaron datos.");
      return;
    }
    const occupied =
      await tx`select id from club_directory.players union all select id from club_directory.teams union all select id from club_directory.accounts limit 1`;
    if (occupied.length)
      throw Object.assign(new Error(), { code: "DIRECTORY_NOT_EMPTY" });
    const counts = {};
    for (const [kind, title] of [
      ["players", "Jugadores"],
      ["teams", "Equipos"],
      ["accounts", "CuentasUsuario"],
    ]) {
      const sources =
        await tx`select s.payload from club_private.source_sheets s join club_private.import_runs r on r.id=s.run_id where s.run_id=${runId} and s.spreadsheet_id=${process.env.GOOGLE_SHEETS_SPREADSHEET_ID} and s.title=${title} and r.completed_at is not null`;
      assert.equal(sources.length, 1, `Debe existir una única fuente: ${title}`);
      const rows = [];
      for (const grid of sources[0].payload.sheet.data ?? []) {
        for (const [offset, row] of (grid.rowData ?? []).entries()) {
          rows[(grid.startRow ?? 0) + offset] = (row.values ?? []).map(
            (cell) => cell.formattedValue ?? "",
          );
        }
      }
      const filled = rows.filter((r) => r?.some((v) => String(v).trim()));
      if (kind === "accounts") {
        const headers = filled[0].map((v) => String(v).trim().toLowerCase());
        const roleIndex = headers.findIndex((v) => ["rol", "role"].includes(v));
        for (const row of filled.slice(1))
          assert.ok(
            ["admin", "treasurer", "coach", "player", "fan"].includes(row[roleIndex]),
            "Rol desconocido: revisar la fuente antes de importar",
          );
      }
      const records = directoryCodec[kind].parse(filled);
      assert.equal(
        records.length,
        Math.max(0, filled.length - 1),
        `Filas omitidas en ${title}`,
      );
      for (const record of records)
        await tx`insert into ${tx(`club_directory.${kind}`)} (data) values (${tx.json(record)})`;
      const saved =
        await tx`select data from ${tx(`club_directory.${kind}`)} order by id`;
      const byId = (a, b) =>
        String(a.id ?? a.userId).localeCompare(String(b.id ?? b.userId));
      assert.deepEqual(saved.map((r) => r.data).sort(byId), [...records].sort(byId));
      // Check the compatibility view used by every existing consumer too.
      assert.deepEqual(
        directoryCodec[kind].parse([
          directoryCodec[kind].headers,
          ...records.map((r) =>
            directoryCodec[kind].row(directoryCodec[kind].headers, r),
          ),
        ]),
        records,
      );
      counts[kind] = saved.length;
    }
    await tx`insert into club_directory.imports(run_id, counts) values (${runId}, ${tx.json(counts)})`;
    console.log(JSON.stringify({ result: "importado y cotejado", counts }));
  });
} catch (error) {
  reportDatabaseError(error);
} finally {
  await sql.end({ timeout: 5 });
}
