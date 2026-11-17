import test from "node:test";
import assert from "node:assert/strict";
import { createRuntime, createSheetsMock } from "./runtime.mjs";

const costHeaders = [
  "id",
  "nombre",
  "tipo",
  "vigencia_desde",
  "monto",
  "dividir_entre",
  "cantidad_estimada",
  "jugadores_asignados",
  "activo",
];
const actualHeaders = ["id", "costo_id", "periodo", "cantidad_real", "monto_real"];
function createService({ costs = [], actuals = [], statuses = [] } = {}) {
  const sheets = createSheetsMock({
    Jugadores: [
      ["id", "nombre", "estado"],
      ["ana", "Ana Perez", "activo"],
      ["bea", "Bea Gomez", "activo"],
    ],
    CalculadoraCostos: [costHeaders, ...costs],
    CalculadoraReales: [actualHeaders, ...actuals],
    CalculadoraJugadores: [["jugador_id", "jugador", "periodo", "estado"], ...statuses],
    "Politica devoluciones": [
      ["desde", "hasta", "devolucion"],
      [0, 100, 50],
    ],
  });
  const runtime = createRuntime({ mocks: { googleapis: sheets.googleapis } });
  const { GoogleSheetsService } = runtime.load("services/GoogleSheetsService.ts");
  return new GoogleSheetsService({
    spreadsheetId: "test-app",
    clubSpreadsheetId: "test-club",
    matchesSpreadsheetId: "test-matches",
    clientEmail: "test@example.com",
    privateKey: "TEST-ONLY",
  });
}
function cost(id, type, period, amount, assigned = "") {
  return [id, id, type, period, amount, 1, 1, assigned, true];
}

test("variable costs stay out of the base and refunds use the prior fixed base without recursive discounts", async () => {
  const service = createService({
    costs: [
      cost("base-aug", "fixed", "2026-08", 10000),
      cost("base-sep", "fixed", "2026-09", 10000),
      cost("base-oct", "fixed", "2026-10", 10000),
      cost("extra-sep", "custom", "2026-09", 6000),
      cost("extra-oct", "custom", "2026-10", 5000),
    ],
  });
  const data = await service.getFeeCalculatorData("2026-10");
  assert.equal(data.source.status, "ready", data.source.message);
  assert.equal(data.summary.baseQuota, 10000);
  assert.equal(data.summary.additionalQuota, 5000);
  for (const player of data.playerCalculations) {
    assert.equal(player.baseQuota, 10000);
    assert.equal(player.previousBaseQuota, 10000);
    assert.equal(player.refundAmount, 5000);
    assert.equal(player.additionalQuota, 5000);
    assert.equal(player.finalQuota, 10000);
    assert.equal(player.benefitDiscount, 0);
  }
});

test("assigned variable costs and their actual adjustments affect only the selected player, never the refund base", async () => {
  const service = createService({
    costs: [
      cost("base-sep", "fixed", "2026-09", 10000),
      cost("base-oct", "fixed", "2026-10", 10000),
      cost("extra-sep", "custom", "2026-09", 6000, "ana"),
      cost("extra-oct", "custom", "2026-10", 5000, "ana"),
    ],
    actuals: [["actual-extra", "extra-sep", "2026-09", 1, 8000]],
  });
  const data = await service.getFeeCalculatorData("2026-10");
  assert.equal(data.source.status, "ready", data.source.message);
  const ana = data.playerCalculations.find((player) => player.playerId === "ana");
  const bea = data.playerCalculations.find((player) => player.playerId === "bea");
  assert.equal(ana.additionalQuota, 7000);
  assert.equal(ana.baseQuota, 10000);
  assert.equal(ana.previousCostVariance, 0);
  assert.equal(ana.refundAmount, 5000);
  assert.equal(ana.finalQuota, 12000);
  assert.equal(bea.additionalQuota, 0);
  assert.equal(bea.finalQuota, 5000);
});

test("reactivated players do not inherit previous variable adjustments or attendance refunds", async () => {
  const service = createService({
    costs: [
      cost("base-sep", "fixed", "2026-09", 10000),
      cost("base-oct", "fixed", "2026-10", 10000),
      cost("extra-sep", "custom", "2026-09", 6000, "ana"),
      cost("extra-oct", "custom", "2026-10", 5000, "ana"),
    ],
    actuals: [["actual-extra", "extra-sep", "2026-09", 1, 8000]],
    statuses: [["ana", "Ana Perez", "2026-09", "inactivo"]],
  });
  const data = await service.getFeeCalculatorData("2026-10");
  assert.equal(data.source.status, "ready", data.source.message);
  const ana = data.playerCalculations.find((player) => player.playerId === "ana");
  assert.equal(ana.additionalQuota, 5000);
  assert.equal(ana.refundAmount, 0);
  assert.equal(ana.finalQuota, 15000);
});
