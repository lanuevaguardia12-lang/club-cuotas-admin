import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { connectDatabase } from "../scripts/db/connection.mjs";
import { createRuntime, createSheetsMock } from "./runtime.mjs";

test(
  "native cashflow CRUD and protected fundraising work in PostgreSQL without Google; all test movements roll back",
  { skip: process.env.RUN_DATABASE_TESTS !== "1" },
  async () => {
    const sql = connectDatabase({ migration: true });
    const prefix = `cashflow-check-${randomUUID()}`;
    const rollback = new Error("intentional rollback");
    try {
      await assert.rejects(
        sql.begin(async (tx) => {
          const scoped = new Proxy(tx, {
            get(target, key) {
              if (key === "begin") return (work) => tx.savepoint(work);
              return target[key];
            },
          });
          const sheets = createSheetsMock();
          const mocks = {
            googleapis: sheets.googleapis,
            "@/services/database/directory-store": {
              directoryDatabase: () => scoped,
              directoryDatabaseEnabled: () => true,
              DirectoryStore: class {
                async list() {
                  return Array.from({ length: 10 }, (_, i) => ({
                    id: `${prefix}-p${i}`,
                    name: `Test player ${i}`,
                    status: "active",
                    category: "Test",
                  }));
                }
              },
            },
          };
          const runtime = createRuntime({ mocks });
          const finance = runtime.load("services/database/finance-store.ts");
          mocks["@/services/database/finance-store"] = {
            ...finance,
            financeDatabaseEnabled: () => true,
          };
          const { GoogleSheetsService } = runtime.load("services/GoogleSheetsService.ts");
          const service = new GoogleSheetsService({
            spreadsheetId: "",
            clubSpreadsheetId: "",
            clientEmail: "",
            privateKey: "",
          });
          const base = {
            id: prefix,
            type: "income",
            concept: "Test cashflow",
            period: "2100-11",
            date: "2100-11-15",
            startPeriod: "2100-11",
            endPeriod: "2100-11",
            amount: 100000,
            repeatsMonthly: false,
          };
          await service.upsertCashFlowTransaction(base);
          await service.upsertCashFlowTransaction({ ...base, amount: 50000 });
          const [edited] =
            await tx`select data from club_finance.cash_flow where id=${prefix}`;
          assert.equal(edited.data.amount, 50000);
          assert.equal(
            (
              await tx`select count(*)::int as n from club_finance.cash_flow where id=${prefix}`
            )[0].n,
            1,
          );
          await service.deleteCashFlowTransaction(prefix);
          assert.equal(
            (await tx`select data from club_finance.cash_flow where id=${prefix}`)[0].data
              .active,
            false,
          );
          await service.upsertCashFlowTransaction({
            ...base,
            id: prefix + "-expense",
            type: "expense",
            repeatsMonthly: true,
            endPeriod: "2101-02",
          });
          const [expense] =
            await tx`select data from club_finance.cash_flow where id=${prefix + "-expense"}`;
          assert.equal(expense.data.type, "expense");
          assert.equal(expense.data.endPeriod, "2101-02");
          const collection = {
            ...base,
            id: prefix + "-collection",
            incomeKind: "fundraising",
            participantPlayerIds: Array.from({ length: 10 }, (_, i) => `${prefix}-p${i}`),
          };
          await service.upsertCashFlowTransaction(collection);
          const [saved] =
            await tx`select data from club_finance.cash_flow where id=${collection.id}`;
          assert.equal(saved.data.fundraisingAllocations.length, 10);
          assert.ok(saved.data.fundraisingAllocations.every((a) => a.amount === 10000));
          await finance.financeTransaction(() =>
            new finance.FinanceStore().save("benefits", {
              id: prefix + "-benefit",
              fundraisingId: collection.id,
              period: collection.period,
              concept: "Test benefit",
              percent: 50,
              createdAt: "2100-11-15T00:00:00Z",
              allocations: saved.data.fundraisingAllocations.map((a) => ({
                ...a,
                amount: 5000,
              })),
            }),
          );
          await assert.rejects(
            service.upsertCashFlowTransaction({ ...collection, amount: 200000 }),
            /ya tiene beneficios aplicados/,
          );
          await assert.rejects(
            service.deleteCashFlowTransaction(collection.id),
            /no se puede eliminar/,
          );
          assert.equal(
            (
              await tx`select data from club_finance.cash_flow where id=${collection.id}`
            )[0].data.amount,
            100000,
          );
          const [originalEvent] =
            await tx`select data from club_finance.benefits where id=${prefix + "-benefit"}`;
          await finance.financeTransaction(() =>
            new finance.FinanceStore().save("benefits", {
              ...originalEvent.data,
              id: prefix + "-reversal",
              reversalOf: originalEvent.data.id,
            }),
          );
          await service.upsertCashFlowTransaction({ ...collection, amount: 200000 });
          await service.deleteCashFlowTransaction(collection.id);
          assert.equal(
            (
              await tx`select data from club_finance.cash_flow where id=${collection.id}`
            )[0].data.active,
            false,
          );
          assert.equal(
            (
              await tx`select count(*)::int as n from club_finance.benefits where fundraising_id=${collection.id}`
            )[0].n,
            2,
          );
          assert.equal(sheets.calls.reads, 0);
          assert.equal(sheets.calls.writes, 0);
          assert.equal(sheets.calls.clients, 0);
          throw rollback;
        }),
        (error) => error === rollback,
      );
      assert.equal(
        (
          await sql`select count(*)::int as n from club_finance.cash_flow where id like ${prefix + "%"}`
        )[0].n,
        0,
      );
      assert.equal(
        (
          await sql`select count(*)::int as n from club_finance.benefits where id=${prefix + "-benefit"}`
        )[0].n,
        0,
      );
    } finally {
      await sql.end({ timeout: 3 });
    }
  },
);
