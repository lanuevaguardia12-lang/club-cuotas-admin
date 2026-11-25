import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { connectDatabase } from "../scripts/db/connection.mjs";
import { createRuntime, createSheetsMock } from "./runtime.mjs";

test(
  "PostgreSQL financial operations persist atomically, enforce private append-only benefits and roll back",
  { skip: process.env.RUN_DATABASE_TESTS !== "1" },
  async () => {
    const sql = connectDatabase({ migration: true });
    const stop = new Error("rollback");
    const prefix = `integration-${randomUUID()}`;
    try {
      for (const role of ["anon", "authenticated"])
        assert.equal(
          (
            await sql`select has_schema_privilege(${role},'club_finance','USAGE') as access`
          )[0].access,
          false,
        );
      const tables =
        await sql`select relname,relrowsecurity from pg_class join pg_namespace n on n.oid=relnamespace where nspname='club_finance' and relkind='r'`;
      assert.equal(tables.length, 12);
      assert.ok(tables.every((t) => t.relrowsecurity));
      await assert.rejects(
        sql.begin(async (tx) => {
          // All application operations are exercised through real SQL inside an outer
          // rollback. Each application transaction uses a database savepoint here.
          const scoped = new Proxy(tx, {
            get(target, key) {
              if (key === "begin") return (work) => tx.savepoint(work);
              return target[key];
            },
          });
          const sheets = createSheetsMock();
          const runtime = createRuntime({
            mocks: {
              googleapis: sheets.googleapis,
              "@/services/database/directory-store": {
                directoryDatabase: () => scoped,
                directoryDatabaseEnabled: () => true,
                DirectoryStore: class {
                  async list() {
                    return [
                      {
                        id: "test-player",
                        name: "Test player",
                        status: "active",
                        category: "Plantel",
                      },
                    ];
                  }
                },
              },
            },
          });
          const { GoogleSheetsService } = runtime.load("services/GoogleSheetsService.ts");
          const service = new GoogleSheetsService({
            spreadsheetId: "app",
            clubSpreadsheetId: "app",
            matchesSpreadsheetId: "matches",
            clientEmail: "test@example.com",
            privateKey: "test",
          });
          const { DirectoryStore: RealDirectoryStore } = runtime.load(
            "services/database/directory-store.ts",
          );
          const { financeTransaction } = runtime.load(
            "services/database/finance-store.ts",
          );
          await tx`insert into club_directory.players(data) values (${tx.json({ id: prefix, name: "Transaction context test", status: "active" })})`;
          await financeTransaction(async () => {
            const visible = await new RealDirectoryStore().list("players");
            assert.ok(
              visible.some((player) => player.id === prefix),
              "Directory reads must see uncommitted rows on the same connection",
            );
          });
          const before = process.env.FINANCE_DATA_SOURCE;
          process.env.FINANCE_DATA_SOURCE = "postgresql";
          try {
            const cost = {
              id: `${prefix}-base`,
              name: "Test base",
              type: "fixed",
              startPeriod: "2100-10",
              endPeriod: "2100-10",
              amount: 20000,
              repeatsMonthly: false,
              splitBetween: 1,
              forecastUnits: 1,
            };
            await service.upsertFeeCalculatorCost(cost);
            await service.upsertCashFlowTransaction({
              id: prefix,
              date: "2100-10-01",
              period: "2100-10",
              startPeriod: "2100-10",
              endPeriod: "2100-10",
              type: "income",
              concept: "Test collection",
              amount: 10000,
              repeatsMonthly: false,
              incomeKind: "fundraising",
              participantPlayerIds: ["test-player"],
            });
            await service.applyFundraisingBenefit({
              fundraisingId: prefix,
              period: "2100-10",
              percent: 50,
            });
            const [event] =
              await tx`select data from club_finance.benefits where fundraising_id=${prefix}`;
            assert.equal(event.data.allocations[0].amount, 5000);
            await assert.rejects(
              tx.savepoint(async (sp) => {
                await sp`delete from club_finance.benefits where id=${event.data.id}`;
              }),
              (e) => e.code === "23514",
            );
            await service.deleteFundraisingBenefit(event.data.id);
            await service.deleteFundraisingBenefit(event.data.id);
            assert.equal(
              (
                await tx`select id from club_finance.benefits where fundraising_id=${prefix}`
              ).length,
              2,
            );
            const payment = {
              provider: "mercado-pago",
              externalId: prefix,
              playerId: "test-player",
              period: "2100-10",
              status: "approved",
              amount: 20000,
            };
            await service.upsertPaymentRecord(payment);
            await service.upsertPaymentRecord(payment);
            assert.equal(
              (await tx`select id from club_finance.payments where external_id=${prefix}`)
                .length,
              1,
            );
            assert.equal(
              (
                await tx`select status from club_finance.fees where player_id='test-player' and period='2100-10'`
              )[0].status,
              "paid",
            );
            await service.updatePlayerFeeStatus({
              playerId: "test-player",
              period: "2100-10",
              status: "unpaid",
            });
            assert.equal(
              (
                await tx`select status from club_finance.fees where player_id='test-player' and period='2100-10'`
              )[0].status,
              "pending",
            );
            assert.equal(sheets.calls.writes, 0);
          } finally {
            if (before === undefined) delete process.env.FINANCE_DATA_SOURCE;
            else process.env.FINANCE_DATA_SOURCE = before;
          }
          throw stop;
        }),
        (e) => e === stop,
      );
      assert.equal(
        (await sql`select id from club_finance.cash_flow where id=${prefix}`).length,
        0,
      );
      assert.equal(
        (await sql`select id from club_finance.benefits where fundraising_id=${prefix}`)
          .length,
        0,
      );
    } finally {
      await sql.end({ timeout: 5 });
    }
  },
);
