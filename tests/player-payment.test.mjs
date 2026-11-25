import test from "node:test";
import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { createRuntime, createSheetsMock } from "./runtime.mjs";

function setup() {
  const date = "2026-11-24T14:00:00Z";
  const player = { id: "ana", name: "Ana Pérez", status: "active", category: "Plantel" };
  const cost = (id, type, period, amount) => ({
    id,
    name: id,
    type,
    startPeriod: period,
    endPeriod: period,
    amount,
    repeatsMonthly: false,
    splitBetween: 1,
    forecastUnits: 1,
    active: true,
    createdAt: date,
    updatedAt: date,
    assignedPlayerIds: [],
  });
  let records = {
    costs: [
      cost("old", "fixed", "2025-10", 8000),
      cost("jun", "fixed", "2026-06", 10000),
      cost("undefined-jul", "fixed", "2026-07", 10000),
      cost("oct", "fixed", "2026-10", 50000),
      cost("court", "court", "2026-10", 0),
      cost("coach", "coach", "2026-10", 0),
      cost("nov", "fixed", "2026-11", 50000),
      cost("future", "fixed", "2026-12", 50000),
    ],
    actuals: ["court", "coach"].map((id) => ({
      id: `actual-${id}`,
      costId: id,
      period: "2026-10",
      actualUnits: 0,
      actualAmount: 0,
      updatedAt: date,
    })),
    refund_policy: [{ id: "rule", fromPercent: 0, toPercent: 100, refundPercent: 0 }],
    player_statuses: [],
    cash_flow: [],
    benefits: [],
    payments: [],
    fees: [
      {
        id: "paid",
        playerId: "ana",
        period: "2026-06",
        amount: 10000,
        status: "paid",
        paidAt: "2026-06-01",
      },
    ],
  };
  let receipts = [];
  let failFees = false;
  const context = new AsyncLocalStorage();
  let queue = Promise.resolve();
  const sheets = createSheetsMock();
  const runtime = createRuntime({
    now: date,
    mocks: {
      googleapis: sheets.googleapis,
      "@/services/database/directory-store": {
        directoryDatabaseEnabled: () => true,
        DirectoryStore: class {
          async list() {
            return [player];
          }
        },
      },
      "@/services/database/matches-store": {
        matchesDatabaseEnabled: () => true,
        MatchesStore: class {
          async list() {
            return [];
          }
        },
      },
      "@/services/database/finance-store": {
        financeDatabaseEnabled: () => true,
        inFinanceTransaction: () => Boolean(context.getStore()),
        async financeTransaction(work) {
          if (context.getStore()) return work();
          const result = queue.then(() =>
            context.run(true, async () => {
              const before = structuredClone({ records, receipts });
              try {
                return await work();
              } catch (e) {
                records = before.records;
                receipts = before.receipts;
                throw e;
              }
            }),
          );
          queue = result.catch(() => {});
          return result;
        },
        FinanceStore: class {
          async list(kind) {
            return structuredClone(records[kind]);
          }
          async source() {
            return [];
          }
          async save(kind, record) {
            if (kind === "fees" && failFees) throw new Error("failure");
            const at = records[kind].findIndex((r) => r.id === record.id);
            if (at < 0) records[kind].push(record);
            else records[kind][at] = record;
          }
        },
      },
      "@/services/database/payment-receipts-store": {
        PaymentReceiptsStore: class {
          async find(id) {
            return receipts.find((r) => r.id === id) ?? null;
          }
          async insert(record) {
            receipts.push(record);
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
  const user = {
    id: "user-ana",
    playerId: "ana",
    username: "ana",
    name: "Ana",
    role: "player",
  };
  const receipt = {
    bucket: "club-payment-receipts",
    objectPath: `${"a".repeat(32)}/${randomUUID()}.pdf`,
    fileName: "comprobante.pdf",
    mimeType: "application/pdf",
    fileSize: 100,
    sha256: "a".repeat(64),
  };
  return {
    service,
    user,
    receipt,
    sheets,
    runtime,
    records: () => records,
    receipts: () => receipts,
    failFees() {
      failFees = true;
    },
  };
}

test("debt spans years and excludes paid, future and undefined quotas", async () => {
  const x = setup();
  const data = await x.service.getPlayerPaymentData(x.user);
  assert.equal(data.playerId, "ana");
  assert.equal(data.playerName, "Ana Pérez");
  assert.deepEqual(data.quotas, [
    { period: "2025-10", amountCents: 800000 },
    { period: "2026-10", amountCents: 5000000 },
    { period: "2026-11", amountCents: 5000000 },
  ]);
  assert.equal(data.totalDebtCents, 10800000);
  assert.ok(data.undefinedPeriods.includes("2026-07"));
  assert.equal(x.sheets.calls.reads, 0);
  await assert.rejects(x.service.getPlayerPaymentData({ ...x.user, role: "fan" }));
});
test("paying October and November stores one receipt, pays both months, leaves older debt and is idempotent", async () => {
  const x = setup();
  const debt = await x.service.getPlayerPaymentData(x.user);
  const input = {
    id: randomUUID(),
    expectedQuotas: debt.quotas.filter((q) => q.period.startsWith("2026")),
    receipt: x.receipt,
  };
  const record = await x.service.registerPlayerPayment(x.user, input);
  assert.equal(record.totalCents, 10000000);
  assert.equal(record.quotas.length, 2);
  assert.equal(x.receipts().length, 1);
  assert.equal((await x.service.getPlayerPaymentData(x.user)).totalDebtCents, 800000);
  assert.equal((await x.service.registerPlayerPayment(x.user, input)).id, record.id);
  assert.equal(x.receipts().length, 1);
  await assert.rejects(
    x.service.registerPlayerPayment({ ...x.user, id: "other" }, input),
  );
  const fees = x
    .records()
    .fees.filter((f) => f.period === "2026-10" || f.period === "2026-11");
  assert.equal(fees.length, 2);
  assert.ok(
    fees.every((f) => f.playerId === "ana" && f.status === "paid" && f.amount === 50000),
  );
  assert.equal(x.sheets.calls.writes, 0);
});
test("stale amounts, duplicate months and a second request for paid months cannot alter balances", async () => {
  const x = setup();
  const quotas = (await x.service.getPlayerPaymentData(x.user)).quotas.filter(
    (q) => q.period === "2026-10",
  );
  await assert.rejects(
    x.service.registerPlayerPayment(x.user, {
      id: randomUUID(),
      receipt: x.receipt,
      expectedQuotas: [{ period: "2026-10", amountCents: 1 }],
    }),
  );
  await assert.rejects(
    x.service.registerPlayerPayment(x.user, {
      id: randomUUID(),
      receipt: x.receipt,
      expectedQuotas: [...quotas, ...quotas],
    }),
  );
  const results = await Promise.allSettled(
    [1, 2].map(() =>
      x.service.registerPlayerPayment(x.user, {
        id: randomUUID(),
        receipt: x.receipt,
        expectedQuotas: quotas,
      }),
    ),
  );
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(x.receipts().length, 1);
});
test("a failure paying any month rolls back the receipt and all fee changes", async () => {
  const x = setup();
  const before = structuredClone(x.records());
  const expectedQuotas = (await x.service.getPlayerPaymentData(x.user)).quotas;
  x.failFees();
  await assert.rejects(
    x.service.registerPlayerPayment(x.user, {
      id: randomUUID(),
      receipt: x.receipt,
      expectedQuotas,
    }),
  );
  assert.deepEqual(x.records(), before);
  assert.equal(x.receipts().length, 0);
});
test("receipt validation checks bytes and rejects mismatched extensions; totals use integer cents", () => {
  const { receiptExtension, moneyCents, playerPaymentSchema } = createRuntime().load(
    "lib/player-payment.ts",
  );
  assert.equal(
    receiptExtension(new TextEncoder().encode("%PDF-1.4"), "application/pdf").extension,
    "pdf",
  );
  assert.throws(() =>
    receiptExtension(new TextEncoder().encode("<html>bad</html>"), "application/pdf"),
  );
  assert.throws(() =>
    receiptExtension(new TextEncoder().encode("%PDF-1.4"), "image/jpeg"),
  );
  assert.equal(moneyCents(10000.01), 1000001);
  assert.equal(
    playerPaymentSchema.safeParse({ id: randomUUID(), expectedQuotas: [] }).success,
    false,
  );
});

test("a mutable display name cannot change payment ownership", async () => {
  const x = setup();
  const data = await x.service.getPlayerPaymentData({
    ...x.user,
    name: "Nombre de otro jugador",
  });
  assert.equal(data.playerId, "ana");
  await assert.rejects(
    x.service.getPlayerPaymentData({
      ...x.user,
      id: "unlinked",
      username: "unlinked",
      playerId: "unlinked",
      name: "Ana Pérez",
    }),
  );
});

test("billing dates follow Argentina across the UTC month boundary", () => {
  const { currentPaymentDate } = createRuntime().load("lib/player-payment.ts");
  assert.equal(currentPaymentDate(new Date("2026-12-01T01:00:00Z")), "2026-11-30");
});
