import assert from "node:assert/strict";
import { connectDatabase, reportDatabaseError } from "./connection.mjs";
import { loadTypeScript } from "./load-typescript.mjs";
const sql = connectDatabase({ migration: true });
try {
  const runId = process.argv[2];
  if (!runId || !/^[\da-f-]{36}$/i.test(runId))
    throw Object.assign(new Error(), { code: "IMPORT_RUN_REQUIRED" });
  const { matchesCodec, financeImport } = loadTypeScript(
    "services/GoogleSheetsService.ts",
  );
  await sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(827415094)`;
    await tx`select pg_advisory_xact_lock(827415095)`;
    if (
      (await tx`select run_id from club_matches.imports where run_id=${runId}`).length
    ) {
      console.log("Este lote de partidos ya fue importado. No se modificaron datos.");
      return;
    }
    assert.equal(
      (
        await tx`select id from club_matches.matches union all select id from club_matches.snapshots limit 1`
      ).length,
      0,
    );
    async function read(book, title) {
      const rows =
        await tx`select s.payload from club_private.source_sheets s join club_private.import_runs r on r.id=s.run_id where s.run_id=${runId} and s.spreadsheet_id=${book} and s.title=${title} and r.completed_at is not null`;
      assert.equal(rows.length, 1, `Falta fuente: ${title}`);
      const result = [];
      for (const grid of rows[0].payload.sheet.data ?? [])
        for (const [i, row] of (grid.rowData ?? []).entries())
          result[(grid.startRow ?? 0) + i] = (row.values ?? []).map(
            (c) => c.formattedValue ?? "",
          );
      return result.filter((r) => r?.some((v) => String(v).trim()));
    }
    const raw = await read(
      process.env.GOOGLE_SHEETS_MATCHES_SPREADSHEET_ID,
      "Partidos jugados formulario",
    );
    const players = financeImport.mapRowsToPlayers(
      await read(process.env.GOOGLE_SHEETS_SPREADSHEET_ID, "Jugadores"),
    );
    const records = matchesCodec.parse(raw);
    const snapshots = matchesCodec.parseSnapshots(
      await read(process.env.GOOGLE_SHEETS_SPREADSHEET_ID, "AsistenciasJugadores"),
    );
    let attendances = 0,
      unlinked = 0;
    for (const match of records) {
      const { players: names, ...data } = match;
      await tx`insert into club_matches.matches(data) values (${tx.json(data)})`;
      for (const [position, name] of names.entries()) {
        const playerId = matchesCodec.resolvePlayerId(name, players);
        if (!playerId) unlinked++;
        await tx`insert into club_matches.attendances(match_id,position,player_name,player_id) values (${match.id},${position},${name},${playerId ?? null})`;
        attendances++;
      }
    }
    const currentSnapshots = new Map();
    for (const snapshot of snapshots) {
      await tx`insert into club_matches.snapshot_history(run_id,data) values (${runId},${tx.json(snapshot)})`;
      const key = `${snapshot.playerId}:${snapshot.seasonYear}`;
      const previous = currentSnapshots.get(key);
      const timestamp = (value) => Date.parse(value.updatedAt || value.calculatedAt) || 0;
      if (!previous || timestamp(snapshot) >= timestamp(previous))
        currentSnapshots.set(key, snapshot);
    }
    const canonicalSnapshots = [...currentSnapshots.values()].map((snapshot) => ({
      ...snapshot,
      id: `attendance-${snapshot.seasonYear}-${snapshot.playerId}`,
    }));
    for (const snapshot of canonicalSnapshots)
      await tx`insert into club_matches.snapshots(data) values (${tx.json(snapshot)})`;
    const saved =
      await tx`select m.data,jsonb_agg(a.player_name order by a.position) as players from club_matches.matches m join club_matches.attendances a on a.match_id=m.id group by m.id,m.data`;
    const sort = (records) => records.sort((a, b) => a.id.localeCompare(b.id));
    assert.deepEqual(
      sort(saved.map((r) => ({ ...r.data, players: r.players }))),
      sort(JSON.parse(JSON.stringify(records))),
    );
    assert.equal(
      (await tx`select count(*)::int as count from club_matches.attendances`)[0].count,
      attendances,
    );
    assert.deepEqual(
      (await tx`select data from club_matches.snapshots order by id`).map((r) => r.data),
      JSON.parse(JSON.stringify(canonicalSnapshots)).sort((a, b) =>
        a.id.localeCompare(b.id),
      ),
    );
    assert.deepEqual(
      (
        await tx`select data from club_matches.snapshot_history where run_id=${runId} order by sequence`
      ).map((r) => r.data),
      JSON.parse(JSON.stringify(snapshots)),
    );
    // Confirm that the compatibility view does not alter dates, names or DT flags.
    assert.deepEqual(
      matchesCodec.parse([matchesCodec.headers, ...records.map(matchesCodec.row)]),
      matchesCodec.parse(raw),
    );
    const counts = {
      sourceRows: Math.max(0, raw.length - 1),
      matches: records.length,
      attendances,
      unlinkedHistoricalNames: unlinked,
      snapshots: canonicalSnapshots.length,
      snapshotHistory: snapshots.length,
    };
    await tx`insert into club_matches.imports(run_id,counts) values (${runId},${tx.json(counts)})`;
    console.log(JSON.stringify({ result: "importado y cotejado", counts }));
  });
} catch (error) {
  reportDatabaseError(error);
} finally {
  await sql.end({ timeout: 5 });
}
