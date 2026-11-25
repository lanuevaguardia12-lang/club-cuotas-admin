import test from "node:test";
import assert from "node:assert/strict";
import { connectDatabase } from "../scripts/db/connection.mjs";

const enabled = process.env.RUN_DATABASE_TESTS === "1";
test(
  "migration archive is private and failed imports roll back entirely",
  { skip: !enabled },
  async () => {
    const sql = connectDatabase({ migration: true });
    try {
      for (const role of ["anon", "authenticated"]) {
        const [permissions] =
          await sql`select has_schema_privilege(${role}, 'club_private', 'USAGE') as access`;
        assert.equal(permissions.access, false);
      }
      const secured =
        await sql`select relname, relrowsecurity from pg_class join pg_namespace on pg_namespace.oid=pg_class.relnamespace where nspname='club_private' and relkind='r'`;
      assert.equal(secured.length, 2);
      assert.ok(secured.every((row) => row.relrowsecurity));
      let runId;
      const sentinel = new Error("INTENTIONAL_TEST_ROLLBACK");
      const payload = {
        cells: [
          { formula: "=SUM(A1:A2)", amount: 100000.01, text: "Recaudación", empty: null },
        ],
      };
      await assert.rejects(
        sql.begin(async (tx) => {
          const [run] =
            await tx`insert into club_private.import_runs default values returning id`;
          runId = run.id;
          await tx`insert into club_private.source_sheets (run_id, spreadsheet_id, sheet_id, title, row_count, checksum, payload) values (${run.id}, 'integration-test', 1, 'Prueba', 1, ${"0".repeat(64)}, ${tx.json(payload)})`;
          const [saved] =
            await tx`select payload from club_private.source_sheets where run_id=${run.id}`;
          assert.deepEqual(saved.payload, payload);
          throw sentinel;
        }),
        (error) => error === sentinel,
      );
      assert.equal(
        (await sql`select id from club_private.import_runs where id=${runId}`).length,
        0,
      );
      assert.equal(
        (await sql`select run_id from club_private.source_sheets where run_id=${runId}`)
          .length,
        0,
      );
    } finally {
      await sql.end({ timeout: 5 });
    }
  },
);
