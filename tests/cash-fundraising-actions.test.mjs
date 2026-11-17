import test from "node:test";
import assert from "node:assert/strict";
import { createRuntime } from "./runtime.mjs";

function actionRuntime(role = "treasurer") {
  const saved = [];
  const paths = [];
  const runtime = createRuntime({
    mocks: {
      "@/lib/auth/session": {
        getCurrentUser: async () => ({ id: "treasurer", role, name: "Tesorería" }),
      },
      "@/services/data-service": {
        getDataService: () => ({
          upsertCashFlowTransaction: async (input) => saved.push(input),
          recordAuditEvent: async () => {},
        }),
      },
      "next/cache": {
        revalidatePath: (...args) => paths.push(args),
      },
    },
  });
  return {
    ...runtime.load("app/(dashboard)/cash-flow/actions.ts"),
    saved,
    paths,
  };
}

const fundraising = {
  date: "2026-11-16",
  period: "2026-11",
  type: "income",
  concept: "Recaudación torneo",
  amount: 100000,
  repeatsMonthly: false,
  startPeriod: "2026-11",
  endPeriod: "2026-11",
  scenario: "real",
  incomeKind: "fundraising",
  participantPlayerIds: ["jugador-1", "jugador-2"],
};

test("saving fundraising preserves explicitly selected participants and refreshes balances", async () => {
  const { saveCashFlowTransaction, saved, paths } = actionRuntime();
  assert.equal((await saveCashFlowTransaction(fundraising)).ok, true);
  assert.equal(saved.length, 1);
  assert.deepEqual(saved[0].participantPlayerIds, fundraising.participantPlayerIds);
  assert.equal(saved[0].incomeKind, "fundraising");
  assert.ok(paths.some(([path]) => path === "/mi-cuota"));
  assert.ok(paths.some(([path]) => path === "/fee-calculator"));
  assert.ok(paths.some(([path]) => path === "/players/[playerId]"));
});

test("fundraising rejects drafts, expenses, repetition and missing or duplicate participants", async () => {
  for (const patch of [
    { scenario: "draft" },
    { type: "expense" },
    { repeatsMonthly: true },
    { participantPlayerIds: [] },
    { participantPlayerIds: ["jugador-1", "jugador-1"] },
  ]) {
    const { saveCashFlowTransaction, saved } = actionRuntime();
    await assert.rejects(saveCashFlowTransaction({ ...fundraising, ...patch }));
    assert.equal(saved.length, 0);
  }
});

test("players cannot credit fundraising balances", async () => {
  const { saveCashFlowTransaction, saved } = actionRuntime("player");
  await assert.rejects(saveCashFlowTransaction(fundraising));
  assert.equal(saved.length, 0);
});

test("legacy general income submissions keep working without fundraising fields", async () => {
  const { saveCashFlowTransaction, saved } = actionRuntime();
  const legacy = { ...fundraising };
  delete legacy.incomeKind;
  delete legacy.participantPlayerIds;
  await saveCashFlowTransaction(legacy);
  assert.equal(saved[0].incomeKind, "general");
  assert.deepEqual(saved[0].participantPlayerIds, []);
});
