import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { connectDatabase } from "../scripts/db/connection.mjs";
import { createRuntime } from "./runtime.mjs";

test(
  "multi-month receipt and fees commit atomically in PostgreSQL and roll back together on failure",
  { skip: process.env.RUN_DATABASE_TESTS !== "1" },
  async () => {
    const sql = connectDatabase({ migration: true });
    const stop = new Error("rollback");
    const requestId = randomUUID(),
      playerId = `integration-${randomUUID()}`;
    try {
      const bucket = (
        await sql`select public,file_size_limit from storage.buckets where id='club-payment-receipts'`
      )[0];
      assert.equal(bucket.public, false);
      assert.equal(Number(bucket.file_size_limit), 4194304);
      for (const role of ["anon", "authenticated"])
        for (const table of ["payment_receipts", "payment_receipt_items"])
          assert.equal(
            (
              await sql`select has_table_privilege(${role},${`club_finance.${table}`},'SELECT') as access`
            )[0].access,
            false,
          );
      await assert.rejects(
        sql.begin(async (tx) => {
          const scoped = new Proxy(tx, {
            get(target, key) {
              if (key === "begin") return (work) => tx.savepoint(work);
              return target[key];
            },
          });
          const mocks = {
            "@/services/database/directory-store": { directoryDatabase: () => scoped },
          };
          const runtime = createRuntime({ mocks });
          const finance = runtime.load("services/database/finance-store.ts");
          let fail = false;
          mocks["@/services/database/finance-store"] = {
            ...finance,
            financeDatabaseEnabled: () => true,
            FinanceStore: class extends finance.FinanceStore {
              async save(kind, data) {
                if (fail && data.period === "2101-11")
                  throw new Error("simulated second fee failure");
                return super.save(kind, data);
              }
            },
          };
          const { GoogleSheetsService } = runtime.load("services/GoogleSheetsService.ts");
          const service = new GoogleSheetsService();
          let quotas = [
            { period: "2100-10", amountCents: 5000000 },
            { period: "2100-11", amountCents: 5000000 },
          ];
          service.getPlayerPaymentData = async () => ({
            playerId,
            playerName: "Test player",
            quotas,
            totalDebtCents: 10000000,
            undefinedPeriods: [],
          });
          const user = {
            id: playerId,
            playerId,
            username: playerId,
            name: "Test",
            role: "player",
          };
          const receipt = {
            bucket: "club-payment-receipts",
            objectPath: `${"a".repeat(32)}/${requestId}.pdf`,
            fileName: "test.pdf",
            mimeType: "application/pdf",
            fileSize: 100,
            sha256: "a".repeat(64),
          };
          const input = { id: requestId, expectedQuotas: quotas, receipt };
          const record = await service.registerPlayerPayment(user, input);
          assert.equal(record.totalCents, 10000000);
          assert.equal(
            (
              await tx`select period from club_finance.payment_receipt_items where receipt_id=${requestId}`
            ).length,
            2,
          );
          const fees =
            await tx`select data,status from club_finance.fees where player_id=${playerId}`;
          assert.equal(fees.length, 2);
          assert.ok(fees.every((f) => f.status === "paid" && f.data.amount === 50000));
          await service.registerPlayerPayment(user, input);
          assert.equal(
            (await tx`select id from club_finance.payment_receipts where id=${requestId}`)
              .length,
            1,
          );
          fail = true;
          quotas = [
            { period: "2101-10", amountCents: 5000000 },
            { period: "2101-11", amountCents: 5000000 },
          ];
          const failureId = randomUUID();
          await assert.rejects(
            service.registerPlayerPayment(user, {
              id: failureId,
              expectedQuotas: quotas,
              receipt: { ...receipt, objectPath: `${"a".repeat(32)}/${failureId}.pdf` },
            }),
            /simulated/,
          );
          assert.equal(
            (await tx`select id from club_finance.payment_receipts where id=${failureId}`)
              .length,
            0,
          );
          assert.equal(
            (
              await tx`select id from club_finance.fees where player_id=${playerId} and period like '2101-%'`
            ).length,
            0,
          );
          throw stop;
        }),
        (e) => e === stop,
      );
      assert.equal(
        (await sql`select id from club_finance.payment_receipts where id=${requestId}`)
          .length,
        0,
      );
      assert.equal(
        (await sql`select id from club_finance.fees where player_id=${playerId}`).length,
        0,
      );
    } finally {
      await sql.end({ timeout: 5 });
    }
  },
);
