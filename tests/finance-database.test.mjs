import test from "node:test";
import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import { createRuntime, createSheetsMock } from "./runtime.mjs";

function setup(config = {}) {
  let records = Object.fromEntries(
    [
      "costs",
      "actuals",
      "player_statuses",
      "cash_flow",
      "benefits",
      "fees",
      "payments",
      "refund_policy",
    ].map((k) => [k, []]),
  );
  const als = new AsyncLocalStorage();
  let queue = Promise.resolve();
  let failKind;
  const players = Array.from({ length: 11 }, (_, i) => ({
    id: `p${i}`,
    name: `Jugador ${i}`,
    status: "active",
    category: "Plantel",
  }));
  class Store {
    async list(kind) {
      return structuredClone(records[kind]);
    }
    async save(kind, data) {
      if (failKind === kind) throw new Error("simulated failure");
      const at = records[kind].findIndex((r) => r.id === data.id);
      if (at < 0) records[kind].push(structuredClone(data));
      else records[kind][at] = structuredClone(data);
    }
    async replace(kind, data) {
      records[kind] = structuredClone(data);
    }
    async source() {
      return [];
    }
  }
  const finance = {
    FinanceStore: Store,
    financeDatabaseEnabled: () => true,
    inFinanceTransaction: () => Boolean(als.getStore()),
    async financeTransaction(work) {
      if (als.getStore()) return work();
      const result = queue.then(() =>
        als.run(true, async () => {
          const backup = structuredClone(records);
          try {
            return await work();
          } catch (e) {
            records = backup;
            throw e;
          }
        }),
      );
      queue = result.catch(() => {});
      return result;
    },
  };
  const sheets = createSheetsMock();
  const runtime = createRuntime({
    mocks: {
      googleapis: sheets.googleapis,
      "@/services/database/finance-store": finance,
      "@/services/database/directory-store": {
        directoryDatabaseEnabled: () => true,
        DirectoryStore: class {
          async list() {
            return players;
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
    ...config,
  });
  const cost = (id, type, period, amount) =>
    service.upsertFeeCalculatorCost({
      id,
      name: id,
      type,
      startPeriod: period,
      endPeriod: period,
      repeatsMonthly: false,
      amount,
      splitBetween: 1,
      forecastUnits: 1,
    });
  const income = {
    id: "collection",
    type: "income",
    concept: "Recaudación",
    period: "2026-10",
    startPeriod: "2026-10",
    endPeriod: "2026-10",
    date: "2026-10-02",
    amount: 100000,
    repeatsMonthly: false,
    incomeKind: "fundraising",
    participantPlayerIds: players.slice(0, 10).map((p) => p.id),
  };
  return {
    service,
    cost,
    income,
    sheets,
    records: () => records,
    fail(kind) {
      failKind = kind;
    },
  };
}

test("Supabase path keeps variable costs and benefits outside the fixed refund base; removing a benefit restores credit", async () => {
  const x = setup();
  await x.cost("base-aug", "fixed", "2026-08", 10000);
  await x.cost("base-sep", "fixed", "2026-09", 10000);
  await x.cost("base-oct", "fixed", "2026-10", 10000);
  await x.cost("court-sep", "court", "2026-09", 0);
  await x.cost("coach-sep", "coach", "2026-09", 0);
  for (const costId of ["court-sep", "coach-sep"])
    await x.service.updateFeeCalculatorActual({
      costId,
      period: "2026-09",
      actualUnits: 0,
      actualAmount: 0,
    });
  await x.service.updateFeeRefundPolicy({
    rules: [{ fromPercent: 0, toPercent: 100, refundPercent: 50 }],
  });
  await x.cost("shirts", "custom", "2026-10", 6000);
  await x.service.upsertCashFlowTransaction(x.income);
  const check = await x.service.getFeeCalculatorData("2026-10");
  assert.equal(
    check.summary.quotaStatus,
    "defined",
    JSON.stringify(check.summary.quotaStatusReasons),
  );
  await x.service.applyFundraisingBenefit({
    fundraisingId: "collection",
    period: "2026-10",
    percent: 50,
    costId: "shirts",
  });
  let data = await x.service.getFeeCalculatorData("2026-10");
  assert.equal(data.source.status, "ready", data.source.message);
  for (const player of data.playerCalculations) {
    assert.equal(player.baseQuota, 10000);
    assert.equal(player.previousBaseQuota, 10000);
    assert.equal(player.refundAmount, 5000);
    assert.equal(player.additionalQuota, 6000);
    assert.equal(player.benefitDiscount, player.playerId === "p10" ? 0 : 5000);
    assert.equal(player.finalQuota, player.playerId === "p10" ? 11000 : 6000);
  }
  const benefit = x.records().benefits.find((b) => !b.reversalOf);
  await x.service.deleteFundraisingBenefit(benefit.id);
  await x.service.deleteFundraisingBenefit(benefit.id);
  data = await x.service.getFeeCalculatorData("2026-10");
  assert.ok(data.playerCalculations.every((p) => p.benefitDiscount === 0));
  assert.equal(x.records().benefits.filter((b) => b.reversalOf === benefit.id).length, 1);
  assert.equal(x.sheets.calls.writes, 0);
});

test("Supabase cost edits and benefits roll back together; concurrent benefit spending is serialized", async () => {
  const x = setup();
  await x.cost("base", "fixed", "2026-10", 20000);
  await x.cost("shirts", "custom", "2026-10", 6000);
  await x.service.upsertCashFlowTransaction(x.income);
  const requests = await Promise.allSettled(
    [1, 2].map(() =>
      x.service.applyFundraisingBenefit({
        fundraisingId: "collection",
        period: "2026-10",
        percent: 50,
        costId: "shirts",
      }),
    ),
  );
  assert.equal(requests.filter((r) => r.status === "fulfilled").length, 1);
  const before = structuredClone(x.records());
  x.fail("benefits");
  await assert.rejects(x.cost("shirts", "custom", "2026-10", 3000));
  assert.deepEqual(x.records(), before);
  x.fail();
  await x.cost("shirts", "custom", "2026-10", 3000);
  let data = await x.service.getFeeCalculatorData("2026-10");
  assert.ok(
    data.playerCalculations
      .filter((p) => p.playerId !== "p10")
      .every((p) => p.benefitDiscount === 3000),
  );
  await x.service.deleteFeeCalculatorCost("shirts");
  data = await x.service.getFeeCalculatorData("2026-10");
  assert.ok(
    data.playerCalculations.every(
      (p) => p.benefitDiscount === 0 && p.additionalQuota === 0,
    ),
  );
  assert.equal(x.sheets.calls.writes, 0);
});

test("Supabase payment retries are idempotent and approval marks the month paid atomically", async () => {
  const x = setup();
  const input = {
    provider: "mercado-pago",
    externalId: "test",
    playerId: "p0",
    period: "2026-10",
    status: "approved",
    amount: 10000,
  };
  await x.service.upsertPaymentRecord(input);
  await x.service.upsertPaymentRecord(input);
  assert.equal(x.records().payments.length, 1);
  assert.equal(x.records().fees.length, 1);
  assert.equal(x.records().fees[0].status, "paid");
  await x.service.updatePlayerFeeStatus({
    playerId: "p0",
    period: "2026-10",
    status: "unpaid",
  });
  assert.equal(x.records().fees[0].status, "pending");
  const before = structuredClone(x.records());
  x.fail("fees");
  await assert.rejects(x.service.upsertPaymentRecord({ ...input, externalId: "second" }));
  assert.deepEqual(x.records(), before);
  assert.equal(x.sheets.calls.writes, 0);
});

test("native cashflow saving, editing and deletion do not require Sheets credentials or a spreadsheet ID", async () => {
  const x = setup({
    spreadsheetId: "",
    clubSpreadsheetId: "",
    clientEmail: "",
    privateKey: "",
  });
  await x.service.upsertCashFlowTransaction(x.income);
  assert.equal(x.records().cash_flow.length, 1);
  assert.equal(x.records().cash_flow[0].fundraisingAllocations.length, 10);
  await x.service.upsertCashFlowTransaction({ ...x.income, amount: 50000 });
  assert.equal(x.records().cash_flow.length, 1);
  assert.equal(x.records().cash_flow[0].amount, 50000);
  await x.service.deleteCashFlowTransaction(x.income.id);
  assert.equal(x.records().cash_flow[0].active, false);
  assert.equal(x.sheets.calls.reads, 0);
  assert.equal(x.sheets.calls.writes, 0);
  assert.equal(x.sheets.calls.clients, 0);
});
