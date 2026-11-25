import assert from "node:assert/strict";
import { connectDatabase, reportDatabaseError } from "./connection.mjs";
import { loadTypeScript } from "./load-typescript.mjs";
const sql = connectDatabase({ migration: true });
try {
  const runId = process.argv[2];
  if (!runId || !/^[\da-f-]{36}$/i.test(runId))
    throw Object.assign(new Error(), { code: "IMPORT_RUN_REQUIRED" });
  const { financeCodec, financeImport, mapRowsToFundraisingBenefits } = loadTypeScript(
    "services/GoogleSheetsService.ts",
  );
  await sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(827415094)`;
    if (
      (await tx`select run_id from club_finance.imports where run_id=${runId}`).length
    ) {
      console.log("Este lote financiero ya fue importado. No se modificaron datos.");
      return;
    }
    const occupied =
      await tx`select id from club_finance.costs union all select id from club_finance.fees union all select id from club_finance.cash_flow union all select id from club_finance.benefits union all select id from club_finance.payments limit 1`;
    assert.equal(occupied.length, 0, "Destino ocupado");
    const source =
      await tx`select s.title,s.payload from club_private.source_sheets s join club_private.import_runs r on r.id=s.run_id where s.run_id=${runId} and s.spreadsheet_id=${process.env.GOOGLE_SHEETS_SPREADSHEET_ID} and r.completed_at is not null`;
    assert.ok(source.length > 0);
    const tables = {};
    for (const sheet of source) {
      const rows = [];
      for (const grid of sheet.payload.sheet.data ?? [])
        for (const [index, row] of (grid.rowData ?? []).entries())
          rows[(grid.startRow ?? 0) + index] = (row.values ?? []).map(
            (c) => c.formattedValue ?? "",
          );
      tables[sheet.title] = rows.filter((r) => r?.some((v) => String(v).trim()));
      await tx`insert into club_finance.historic_sources(title,rows,run_id) values (${sheet.title},${tx.json(tables[sheet.title])},${runId})`;
    }
    const counts = {};
    const entries = [
      ["costs", "CalculadoraCostos"],
      ["actuals", "CalculadoraReales"],
      ["player_statuses", "CalculadoraJugadores"],
      ["cash_flow", "CashFlow"],
      ["refund_policy", "Politica devoluciones"],
      ["payments", "Pagos"],
      ["benefits", "RecaudacionBeneficios"],
    ];
    for (const [kind, title] of entries) {
      if (!tables[title] && !["Pagos"].includes(title))
        throw Object.assign(new Error(), { code: "MISSING_FINANCE_SOURCE" });
      const rows = tables[title] ?? [];
      let records =
        kind === "benefits"
          ? mapRowsToFundraisingBenefits(rows)
          : financeCodec[kind].parse(rows);
      if (kind === "refund_policy")
        records = records.map((r, i) => ({ ...r, id: `rule-${i}` }));
      // Non-empty source rows must not disappear during canonical conversion.
      if (kind !== "refund_policy")
        assert.equal(
          records.length,
          Math.max(0, rows.length - 1),
          `Filas omitidas: ${title}`,
        );
      for (const record of records)
        await tx`insert into ${tx(`club_finance.${kind}`)}(data) values (${tx.json(record)})`;
      const saved =
        await tx`select data from ${tx(`club_finance.${kind}`)} order by sequence`;
      assert.deepEqual(
        saved.map((r) => r.data),
        JSON.parse(JSON.stringify(records)),
      );
      counts[kind] = saved.length;
    }
    const players = financeImport.mapRowsToPlayers(tables.Jugadores ?? []);
    const historicalFees = financeImport.mapFormResponsesToPaidFees(
      players,
      tables["Respuestas de formulario"] ?? tables["Respuestas de formulario 1"] ?? [],
    );
    const fees = financeImport.mergeFeeRecords(
      financeCodec.fees.parse(tables.Cuotas ?? []),
      historicalFees,
    );
    for (const fee of fees)
      await tx`insert into club_finance.fees(data) values (${tx.json(fee)})`;
    assert.deepEqual(
      (await tx`select data from club_finance.fees order by sequence`).map((r) => r.data),
      JSON.parse(JSON.stringify(fees)),
    );
    counts.fees = fees.length;
    counts.paymentResponseRows = Math.max(
      0,
      (tables["Respuestas de formulario"]?.length ?? 1) - 1,
    );
    await tx`insert into club_finance.imports(run_id,counts) values (${runId},${tx.json(counts)})`;
    console.log(JSON.stringify({ result: "importado y cotejado", counts }));
  });
} catch (error) {
  reportDatabaseError(error);
} finally {
  await sql.end({ timeout: 5 });
}
