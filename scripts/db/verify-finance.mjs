import assert from "node:assert/strict";
import { connectDatabase, reportDatabaseError } from "./connection.mjs";
import { createRuntime, createSheetsMock } from "../../tests/runtime.mjs";
const sql = connectDatabase({ migration: true });
let phase = "load";
try {
  const runId = process.argv[2];
  if (!runId) throw new Error("run required");
  const sheets =
    await sql`select spreadsheet_id,title,payload from club_private.source_sheets where run_id=${runId}`;
  const sourceRows = {};
  for (const sheet of sheets) {
    if (
      sourceRows[sheet.title] &&
      sheet.spreadsheet_id !== process.env.GOOGLE_SHEETS_SPREADSHEET_ID
    )
      continue;
    const rows = [];
    for (const grid of sheet.payload.sheet.data ?? [])
      for (const [i, row] of (grid.rowData ?? []).entries())
        rows[(grid.startRow ?? 0) + i] = (row.values ?? []).map(
          (c) => c.formattedValue ?? "",
        );
    sourceRows[sheet.title] = rows.filter((r) => r?.some((v) => String(v).trim()));
  }
  const records = {};
  for (const kind of [
    "costs",
    "actuals",
    "player_statuses",
    "cash_flow",
    "benefits",
    "fees",
    "payments",
    "refund_policy",
  ])
    records[kind] = (
      await sql`select data from ${sql(`club_finance.${kind}`)} order by sequence`
    ).map((r) => r.data);
  const verifyMatches = process.argv.includes("--matches");
  const storedMatches = verifyMatches
    ? (
        await sql`select m.data,jsonb_agg(a.player_name order by a.position) as players from club_matches.matches m join club_matches.attendances a on a.match_id=m.id group by m.id,m.data,m.sequence order by m.data->>'date',m.sequence`
      ).map((row) => ({ ...row.data, players: row.players }))
    : [];
  const players = (await sql`select data from club_directory.players order by id`).map(
    (r) => r.data,
  );
  const appConfig = {
    spreadsheetId: "app",
    clubSpreadsheetId: "app",
    matchesSpreadsheetId: "matches",
    clientEmail: "test@example.com",
    privateKey: "test",
  };
  function service(enabled) {
    const sheets = createSheetsMock(sourceRows);
    const runtime = createRuntime({
      mocks: {
        googleapis: sheets.googleapis,
        "@/services/database/matches-store": {
          matchesDatabaseEnabled: () => verifyMatches && enabled,
          MatchesStore: class {
            async list() {
              return structuredClone(storedMatches);
            }
          },
        },
        "@/services/database/finance-store": {
          financeDatabaseEnabled: () => enabled,
          inFinanceTransaction: () => false,
          FinanceStore: class {
            async list(kind) {
              return structuredClone(records[kind]);
            }
            async source(title) {
              return sourceRows[title] ?? [];
            }
          },
        },
        "@/services/database/directory-store": {
          directoryDatabaseEnabled: () => enabled,
          DirectoryStore: class {
            async list() {
              return structuredClone(players);
            }
          },
        },
      },
    });
    const { GoogleSheetsService } = runtime.load("services/GoogleSheetsService.ts");
    return new GoogleSheetsService(appConfig);
  }
  const before = service(false),
    after = service(true);
  if (verifyMatches) {
    phase = "matches-and-summaries";
    const oldMatches = await before.readPlayerOfMatchMatches(),
      newMatches = await after.readPlayerOfMatchMatches();
    assert.deepEqual(
      JSON.parse(JSON.stringify(newMatches)),
      JSON.parse(JSON.stringify(oldMatches)),
    );
    const { matchesCodec, financeImport } = createRuntime().load(
      "services/GoogleSheetsService.ts",
    );
    const playerRecords = financeImport.mapRowsToPlayers(sourceRows.Jugadores);
    const oldCanonical = matchesCodec.canonicalize(oldMatches, playerRecords),
      newCanonical = matchesCodec.canonicalize(newMatches, playerRecords);
    for (const player of playerRecords)
      assert.deepEqual(
        matchesCodec.summary(player, newCanonical),
        matchesCodec.summary(player, oldCanonical),
      );
  }
  phase = "fees";
  const oldFees = await before.readDashboardRecords(),
    newFees = await after.readDashboardRecords();
  const canonical = (v) => JSON.parse(JSON.stringify(v));
  const sort = (v) =>
    v.sort(
      (a, b) => a.playerId.localeCompare(b.playerId) || a.period.localeCompare(b.period),
    );
  assert.deepEqual(canonical(sort(newFees.fees)), canonical(sort(oldFees.fees)));
  const periods = [
    ...new Set([
      ...records.costs.map((r) => r.startPeriod),
      ...records.fees.map((r) => r.period),
    ]),
  ].sort();
  const fields = [
    "playerId",
    "baseQuota",
    "previousBaseQuota",
    "additionalQuota",
    "previousCostVariance",
    "refundAmount",
    "benefitDiscount",
    "finalQuota",
  ];
  for (const period of periods) {
    if (verifyMatches) {
      phase = `coach-${period}`;
      const [a, b] = await Promise.all([
        before.getCoachRecordsData(period),
        after.getCoachRecordsData(period),
      ]);
      assert.notEqual(a.source.status, "error");
      assert.notEqual(b.source.status, "error");
      for (const key of ["matches", "totalHours", "totalCost", "hourlyRate", "emailBody"])
        assert.deepEqual(canonical(b[key]), canonical(a[key]));
    }
    phase = `calculator-${period}`;
    const [a, b] = await Promise.all([
      before.getFeeCalculatorData(period),
      after.getFeeCalculatorData(period),
    ]);
    assert.notEqual(a.source.status, "error");
    assert.notEqual(b.source.status, "error");
    const project = (v) =>
      v.playerCalculations
        .map((p) => Object.fromEntries(fields.map((f) => [f, p[f]])))
        .sort((a, b) => a.playerId.localeCompare(b.playerId));
    assert.deepEqual(project(b), project(a));
    assert.deepEqual(canonical(b.benefitEvents), canonical(a.benefitEvents));
  }
  for (const period of periods) {
    phase = `cashflow-${period}`;
    const [a, b] = await Promise.all([
      before.getCashFlowData(period),
      after.getCashFlowData(period),
    ]);
    assert.notEqual(a.source.status, "error");
    assert.notEqual(b.source.status, "error");
    for (const field of [
      "metrics",
      "charts",
      "transactions",
      "expectedFeeIncome",
      "additionalIncome",
      "additionalExpenses",
      "draft",
    ])
      assert.deepEqual(canonical(b[field]), canonical(a[field]));
  }
  console.log(
    JSON.stringify({
      result: "paridad verificada",
      matches: verifyMatches ? storedMatches.length : undefined,
      periods: periods.length,
      players: players.length,
      fees: records.fees.length,
      compared: fields,
    }),
  );
} catch (error) {
  console.error(`Etapa de comprobación: ${phase}`);
  reportDatabaseError(error);
} finally {
  await sql.end({ timeout: 5 });
}
