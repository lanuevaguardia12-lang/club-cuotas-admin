import test from "node:test";
import assert from "node:assert/strict";
import { createRuntime, createSheetsMock } from "./runtime.mjs";

function setup() {
  const ids = Array.from({ length: 11 }, (_, i) => `player-${i + 1}`);
  const sheets = createSheetsMock({
    Jugadores: [
      ["id", "nombre", "estado"],
      ...ids.map((id) => [id, `Jugador ${id}`, "activo"]),
    ],
    CashFlow: [],
    RecaudacionBeneficios: [],
    CalculadoraCostos: [
      [
        "id",
        "nombre",
        "tipo",
        "vigencia_desde",
        "monto",
        "dividir_entre",
        "cantidad_estimada",
        "activo",
      ],
      ["fixed-oct", "Cuota fija", "fixed", "2026-10", 20000, 1, 1, true],
      ["fixed-dec", "Cuota fija", "fixed", "2026-12", 20000, 1, 1, true],
    ],
  });
  const runtime = createRuntime({ mocks: { googleapis: sheets.googleapis } });
  const { GoogleSheetsService } = runtime.load("services/GoogleSheetsService.ts");
  const service = new GoogleSheetsService({
    spreadsheetId: "test-app",
    clubSpreadsheetId: "test-club",
    clientEmail: "test@example.com",
    privateKey: "TEST-ONLY",
  });
  const input = {
    id: "event-1",
    date: "2026-10-05",
    period: "2026-10",
    type: "income",
    concept: "Recaudación del equipo",
    amount: 100000,
    repeatsMonthly: false,
    startPeriod: "2026-10",
    endPeriod: "2026-10",
    incomeKind: "fundraising",
    participantPlayerIds: ids.slice(0, 10),
  };
  return { ids, service, runtime, sheets, input };
}

test("100000 split among ten selected players persists, applies 50% once and retains the rest across months", async () => {
  const { ids, service, runtime, input } = setup();
  await service.upsertCashFlowTransaction(input);
  let data = await service.getFeeCalculatorData("2026-10");
  assert.equal(data.source.status, "ready", data.source.message);
  assert.equal(data.fundraisingSources[0].allocations.length, 10);
  assert.ok(
    data.fundraisingSources[0].allocations.every((item) => item.amount === 10000),
  );
  await service.applyFundraisingBenefit({
    fundraisingId: input.id,
    period: "2026-10",
    percent: 50,
  });
  data = await service.getFeeCalculatorData("2026-10");
  for (const player of data.playerCalculations) {
    assert.equal(player.baseQuota, 20000);
    assert.equal(player.benefitDiscount, player.playerId === ids[10] ? 0 : 5000);
    assert.equal(player.finalQuota, player.playerId === ids[10] ? 20000 : 15000);
  }
  let profile = await service.getPlayerProfile(ids[0], 2026);
  assert.equal(profile.fundraisingAccount.balance, 5000);
  assert.equal(profile.fundraisingAccount.totalCollected, 10000);
  assert.equal(profile.fundraisingAccount.totalUsed, 5000);
  assert.equal(profile.fundraisingAccount.movements.length, 2);
  await assert.rejects(
    service.applyFundraisingBenefit({
      fundraisingId: input.id,
      period: "2026-10",
      percent: 50,
    }),
    /ya tiene/,
  );
  await assert.rejects(
    service.deleteCashFlowTransaction(input.id),
    /no se puede eliminar/,
  );
  await assert.rejects(
    service.upsertCashFlowTransaction({ ...input, amount: 90000 }),
    /no se puede modificar/,
  );
  await service.applyFundraisingBenefit({
    fundraisingId: input.id,
    period: "2026-12",
    percent: 100,
  });
  data = await service.getFeeCalculatorData("2026-12");
  assert.equal(data.playerCalculations[0].benefitDiscount, 5000);
  profile = await service.getPlayerProfile(ids[0], 2026);
  assert.equal(profile.fundraisingAccount.balance, 0);
  assert.equal(profile.fundraisingAccount.totalUsed, 10000);
  assert.ok(runtime.expired.includes("google-sheets:player-profile"));
});

test("rounding preserves every cent and replay cannot spend the same credit twice", () => {
  const { splitFundraisingAmount, buildFundraisingLedger } =
    createRuntime().load("lib/fundraising.ts");
  assert.deepEqual(splitFundraisingAmount(100, ["c", "a", "b"]), [
    { playerId: "a", amount: 33.34 },
    { playerId: "b", amount: 33.33 },
    { playerId: "c", amount: 33.33 },
  ]);
  const transaction = {
    id: "one",
    active: true,
    type: "income",
    scenario: "real",
    incomeKind: "fundraising",
    period: "2026-10",
    amount: 100,
    fundraisingAllocations: [{ playerId: "a", playerName: "Ana", amount: 100 }],
  };
  const first = {
    id: "first",
    fundraisingId: "one",
    period: "2026-10",
    allocations: [{ playerId: "a", playerName: "Ana", amount: 80 }],
  };
  const ledger = buildFundraisingLedger(
    [transaction],
    [first, first, { ...first, id: "second", period: "2026-11" }],
  );
  assert.equal(ledger.applications.length, 2);
  assert.equal(ledger.applications[1].allocations[0].amount, 20);
  assert.equal(ledger.sources[0].balance, 0);
});

test("invalid participants and non-real recurring fundraising are rejected by persistence", async () => {
  const { service, input } = setup();
  for (const bad of [
    { participantPlayerIds: [] },
    { participantPlayerIds: ["unknown"] },
    { scenario: "draft" },
    { repeatsMonthly: true },
  ]) {
    await assert.rejects(service.upsertCashFlowTransaction({ ...input, ...bad }));
  }
});

test("benefit targets camisetas, combines balances and never discounts more than that player's expense", async () => {
  const { service, input, ids } = setup();
  await service.upsertCashFlowTransaction(input);
  await service.upsertCashFlowTransaction({ ...input, id: "event-2", amount: 100000 });
  const cost = {
    id: "shirts",
    name: "Camisetas",
    type: "custom",
    startPeriod: "2026-10",
    endPeriod: "2026-10",
    amount: 6000,
    splitBetween: 1,
    forecastUnits: 1,
    repeatsMonthly: false,
    assignedPlayerIds: [ids[0], ids[1], ids[10]],
  };
  await service.upsertFeeCalculatorCost(cost);
  await service.applyFundraisingBenefit({
    fundraisingId: "__all__",
    period: "2026-10",
    costId: "shirts",
    percent: 50,
  });
  const data = await service.getFeeCalculatorData("2026-10");
  for (const player of data.playerCalculations) {
    const recipient = [ids[0], ids[1]].includes(player.playerId);
    assert.equal(player.benefitDiscount, recipient ? 6000 : 0);
    assert.equal(player.baseQuota, 20000);
    if (recipient) assert.equal(player.finalQuota, 20000);
    if (player.playerId === ids[10]) assert.equal(player.finalQuota, 26000);
  }
  const profile = await service.getPlayerProfile(ids[0], 2026);
  assert.equal(profile.fundraisingAccount.totalUsed, 6000);
  assert.equal(profile.fundraisingAccount.balance, 14000);
  assert.ok(
    profile.fundraisingAccount.movements.some((movement) =>
      movement.concept.includes("Camisetas"),
    ),
  );
  assert.ok(
    data.benefitApplications.every((application) => application.costId === "shirts"),
  );
  await assert.rejects(service.deleteFeeCalculatorCost("shirts"), /beneficios aplicados/);
  await assert.rejects(
    service.upsertFeeCalculatorCost({ ...cost, amount: 7000 }),
    /beneficios aplicados/,
  );
  await assert.rejects(service.resetFeeCalculatorCosts(), /beneficios aplicados/);
  await assert.rejects(
    service.applyFundraisingBenefit({
      fundraisingId: input.id,
      period: "2026-10",
      costId: "fixed-oct",
      percent: 50,
    }),
    /adicional variable/,
  );
});

test("manual participant selection can be completed later and the balance can be used on another expense", async () => {
  const { service, input, ids } = setup();
  await service.upsertCashFlowTransaction(input);
  for (const id of ["shirts", "trip"])
    await service.upsertFeeCalculatorCost({
      id,
      name: id,
      type: "custom",
      startPeriod: "2026-10",
      endPeriod: "2026-10",
      amount: 6000,
      splitBetween: 1,
      forecastUnits: 1,
      repeatsMonthly: false,
    });
  await service.applyFundraisingBenefit({
    fundraisingId: input.id,
    period: "2026-10",
    costId: "shirts",
    percent: 50,
    playerIds: [ids[0]],
  });
  let data = await service.getFeeCalculatorData("2026-10");
  assert.equal(
    data.playerCalculations.find((player) => player.playerId === ids[1]).benefitDiscount,
    0,
  );
  await service.applyFundraisingBenefit({
    fundraisingId: input.id,
    period: "2026-10",
    costId: "shirts",
    percent: 50,
    playerIds: [ids[1]],
  });
  await assert.rejects(
    service.applyFundraisingBenefit({
      fundraisingId: input.id,
      period: "2026-10",
      costId: "shirts",
      percent: 50,
      playerIds: [ids[0]],
    }),
    /ya tiene/,
  );
  await service.applyFundraisingBenefit({
    fundraisingId: input.id,
    period: "2026-10",
    costId: "trip",
    percent: 50,
    playerIds: [ids[0]],
  });
  data = await service.getFeeCalculatorData("2026-10");
  assert.equal(
    data.playerCalculations.find((player) => player.playerId === ids[0]).benefitDiscount,
    10000,
  );
  assert.equal(
    (await service.getPlayerProfile(ids[0], 2026)).fundraisingAccount.balance,
    0,
  );
});

test("replay caps concurrent allocations from different sources to the same expense", () => {
  const { buildFundraisingLedger } = createRuntime().load("lib/fundraising.ts");
  const source = {
    active: true,
    type: "income",
    scenario: "real",
    incomeKind: "fundraising",
    period: "2026-10",
    amount: 10000,
    fundraisingAllocations: [{ playerId: "a", playerName: "Ana", amount: 10000 }],
  };
  const app = {
    period: "2026-10",
    costId: "shirts",
    costAmounts: { a: 6000 },
    allocations: [{ playerId: "a", playerName: "Ana", amount: 5000 }],
  };
  const ledger = buildFundraisingLedger(
    [
      { ...source, id: "one" },
      { ...source, id: "two" },
    ],
    [
      { ...app, id: "first", fundraisingId: "one" },
      { ...app, id: "second", fundraisingId: "two" },
    ],
  );
  assert.equal(ledger.applications[0].allocations[0].amount, 5000);
  assert.equal(ledger.applications[1].allocations[0].amount, 1000);
  assert.equal(ledger.sources[1].balance, 9000);
});
