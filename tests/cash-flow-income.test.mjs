import test from "node:test";
import assert from "node:assert/strict";
import { createRuntime, createSheetsMock } from "./runtime.mjs";

function setup({ fail = false, fraction = false } = {}) {
  const date = "2026-11-01T00:00:00Z";
  const players = ["ana", "bea", "caro"].map((id) => ({
    id,
    name: id,
    status: "active",
    category: "Plantel",
  }));
  const cost = (id, type, period, amount, assigned = []) => ({
    id,
    name: id,
    type,
    startPeriod: period,
    endPeriod: period,
    amount,
    repeatsMonthly: false,
    splitBetween: assigned.length ? 1 : 2,
    assignedPlayerIds: assigned,
    forecastUnits: 1,
    active: true,
    createdAt: date,
    updatedAt: date,
  });
  const movement = (id, amount, type = "income") => ({
    id,
    concept: id,
    amount,
    type,
    period: "2026-11",
    date: "2026-11-01",
    startPeriod: "2026-11",
    endPeriod: "2026-11",
    repeatsMonthly: false,
    active: true,
    scenario: "real",
    source: "manual",
    incomeKind: "general",
    createdAt: date,
    updatedAt: date,
  });
  const records = {
    players,
    accounts: [],
    fees: [],
    matches: [],
    expenses: [],
    costs: [
      cost("base-oct", "fixed", "2026-10", 20000),
      cost("base-nov", "fixed", "2026-11", fraction ? 20000.01 : 20000),
      cost("shirts", "custom", "2026-11", 6000, ["ana"]),
    ],
    actuals: [],
    player_statuses: [
      { playerId: "caro", playerName: "caro", period: "2026-11", status: "inactive" },
    ],
    refund_policy: [{ id: "refund", fromPercent: 0, toPercent: 100, refundPercent: 0 }],
    cash_flow: [
      movement("other-income", 10000),
      movement("expense", 2000, "expense"),
      {
        ...movement("collection", 2000),
        incomeKind: "fundraising",
        participantPlayerIds: ["ana", "bea"],
        fundraisingAllocations: [
          { playerId: "ana", playerName: "ana", amount: 1000 },
          { playerId: "bea", playerName: "bea", amount: 1000 },
        ],
      },
    ],
    benefits: [
      {
        id: "benefit",
        fundraisingId: "collection",
        concept: "benefit",
        period: "2026-11",
        percent: 50,
        createdAt: date,
        allocations: [
          { playerId: "ana", playerName: "ana", amount: 500 },
          { playerId: "bea", playerName: "bea", amount: 500 },
        ],
      },
    ],
  };
  let snapshots = 0,
    otherReads = 0;
  const sheets = createSheetsMock();
  const runtime = createRuntime({
    now: "2026-11-25T12:00:00Z",
    mocks: {
      googleapis: sheets.googleapis,
      "@/services/database/payment-quote-store": {
        PaymentQuoteStore: class {
          async read() {
            snapshots++;
            if (fail) throw new Error("private database error");
            return structuredClone(records);
          }
        },
      },
      "@/services/database/directory-store": {
        directoryDatabaseEnabled: () => true,
        DirectoryStore: class {
          async list(kind) {
            otherReads++;
            return structuredClone(records[kind]);
          }
        },
      },
      "@/services/database/matches-store": {
        matchesDatabaseEnabled: () => true,
        MatchesStore: class {
          async list() {
            otherReads++;
            return [];
          }
        },
      },
      "@/services/database/finance-store": {
        financeDatabaseEnabled: () => true,
        inFinanceTransaction: () => false,
        FinanceStore: class {
          async list(kind) {
            otherReads++;
            return structuredClone(records[kind]);
          }
          async source() {
            otherReads++;
            return [];
          }
        },
      },
    },
  });
  const { GoogleSheetsService } = runtime.load("services/GoogleSheetsService.ts");
  const service = new GoogleSheetsService({
    spreadsheetId: "",
    clubSpreadsheetId: "",
    matchesSpreadsheetId: "",
    clientEmail: "",
    privateKey: "",
  });
  const calculator = new GoogleSheetsService({
    spreadsheetId: "app",
    clubSpreadsheetId: "app",
    matchesSpreadsheetId: "matches",
    clientEmail: "unused@local.invalid",
    privateKey: "unused",
  });
  return { service, calculator, sheets, counts: () => ({ snapshots, otherReads }) };
}

test("November cashflow sums individual final quotas once, with variable charges and benefits, using one snapshot for every month", async () => {
  const x = setup();
  const cash = await x.service.getCashFlowData("2026-11");
  assert.equal(cash.source.status, "ready", cash.source.message);
  assert.equal(cash.expectedFeeIncome, 25000);
  assert.equal(cash.additionalIncome, 12000);
  const november = cash.charts.annual.find((p) => p.period === "2026-11");
  assert.equal(november.feeIncome, 25000);
  assert.equal(november.ingresos, 37000);
  assert.equal(
    cash.charts.matrixRows.find((r) => r.concept === "Cuotas jugadores").values[
      "2026-11"
    ],
    25000,
  );
  assert.deepEqual(x.counts(), { snapshots: 1, otherReads: 0 });
  assert.equal(x.sheets.calls.reads, 0);
  assert.equal(x.sheets.calls.clients, 0);
  const calc = await x.calculator.getFeeCalculatorData("2026-11");
  assert.equal(calc.playerCalculations.length, 2);
  assert.equal(
    calc.playerCalculations.reduce((s, p) => s + Math.round(p.finalQuota * 100), 0) / 100,
    cash.expectedFeeIncome,
  );
  assert.ok(calc.playerCalculations.every((p) => p.baseQuota === 10000));
});

test("quota income is the sum of rounded player charges and does not add a virtual charge for a month-inactive player", async () => {
  const x = setup({ fraction: true });
  const cash = await x.service.getCashFlowData("2026-11");
  const calc = await x.calculator.getFeeCalculatorData("2026-11");
  assert.equal(
    cash.expectedFeeIncome,
    calc.playerCalculations.reduce(
      (s, p) => s + Math.round((p.finalQuota + Number.EPSILON) * 100),
      0,
    ) / 100,
  );
});

test("an unavailable financial snapshot is reported as an error instead of a ready cashflow with zero income", async () => {
  const x = setup({ fail: true });
  const cash = await x.service.getCashFlowData("2026-11");
  assert.equal(cash.source.status, "error");
  assert.match(cash.source.message, /No pudimos calcular/);
  assert.doesNotMatch(cash.source.message, /private database/);
  assert.deepEqual(x.counts(), { snapshots: 1, otherReads: 0 });
});
