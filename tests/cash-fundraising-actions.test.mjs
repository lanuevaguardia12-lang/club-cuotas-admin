import test from "node:test";
import assert from "node:assert/strict";
import { createRuntime } from "./runtime.mjs";

function actionRuntime(role = "treasurer", options = {}) {
  const saved = [];
  const paths = [];
  const deleted = [];
  let inputError;
  const runtime = createRuntime({
    mocks: {
      "@/lib/auth/session": {
        getCurrentUser: async () =>
          role ? { id: "treasurer", role, name: "Tesorería" } : null,
      },
      "@/services/data-service": {
        getDataService: () => ({
          upsertCashFlowTransaction: async (input) => {
            if (options.writeError)
              throw options.expected ? inputError : options.writeError;
            saved.push(input);
          },
          deleteCashFlowTransaction: async (id) => {
            if (options.writeError)
              throw options.expected ? inputError : options.writeError;
            deleted.push(id);
          },
          recordAuditEvent: async () => {
            if (options.auditError) throw new Error("Audit unavailable");
          },
        }),
      },
      "next/cache": {
        revalidatePath: (...args) => {
          if (options.refreshError) throw new Error("Refresh unavailable");
          paths.push(args);
        },
      },
    },
  });
  inputError = new (runtime.load("lib/cash-flow-errors.ts").CashFlowInputError)(
    String(options.writeError ?? ""),
  );
  return {
    ...runtime.load("app/(dashboard)/cash-flow/actions.ts"),
    saved,
    paths,
    deleted,
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
    const result = await saveCashFlowTransaction({ ...fundraising, ...patch });
    assert.equal(result.ok, false);
    assert.ok(result.message);
    assert.equal(saved.length, 0);
  }
});

test("players cannot credit fundraising balances", async () => {
  const { saveCashFlowTransaction, saved } = actionRuntime("player");
  assert.equal((await saveCashFlowTransaction(fundraising)).ok, false);
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

test("business-rule failures return the actionable Spanish reason without throwing a server-render error", async () => {
  const reason =
    "Esta recaudación ya tiene beneficios aplicados y no se puede modificar.";
  const actions = actionRuntime("treasurer", { writeError: reason, expected: true });
  assert.deepEqual(await actions.saveCashFlowTransaction(fundraising), {
    ok: false,
    message: reason,
  });
  assert.deepEqual(await actions.deleteCashFlowTransaction("protected"), {
    ok: false,
    message: reason,
  });
  assert.equal(actions.saved.length, 0);
  assert.equal(actions.deleted.length, 0);
});

test("unexpected database errors are not exposed and do not claim that a financial write failed before commit", async () => {
  const actions = actionRuntime("treasurer", {
    writeError: new Error("private database credentials and SQL must stay private"),
  });
  const save = await actions.saveCashFlowTransaction(fundraising);
  assert.equal(save.ok, false);
  assert.match(save.message, /No pudimos confirmar el guardado/);
  assert.match(save.message, /antes de volver/);
  assert.doesNotMatch(save.message, /credentials|SQL/);
  const remove = await actions.deleteCashFlowTransaction("movement");
  assert.equal(remove.ok, false);
  assert.match(remove.message, /No pudimos confirmar la eliminación/);
  assert.equal(actions.saved.length, 0);
  assert.equal(actions.paths.length, 0);
});

test("invalid calendar dates, invalid months and expired sessions never write", async () => {
  for (const patch of [
    { date: "2026-02-30" },
    { period: "2026-13" },
    { amount: -1 },
    { concept: "" },
  ]) {
    const actions = actionRuntime();
    assert.equal(
      (await actions.saveCashFlowTransaction({ ...fundraising, ...patch })).ok,
      false,
    );
    assert.equal(actions.saved.length, 0);
  }
  const actions = actionRuntime(null);
  assert.match((await actions.saveCashFlowTransaction(fundraising)).message, /sesión/);
  assert.equal((await actions.deleteCashFlowTransaction("movement")).ok, false);
});

test("confirmed writes remain successful when audit delivery or view refresh fails", async () => {
  const audit = actionRuntime("treasurer", { auditError: true });
  assert.equal((await audit.saveCashFlowTransaction(fundraising)).ok, true);
  assert.equal(audit.saved.length, 1);
  assert.ok(audit.paths.length > 0);
  const refresh = actionRuntime("treasurer", { refreshError: true });
  const result = await refresh.saveCashFlowTransaction(fundraising);
  assert.equal(result.ok, true);
  assert.match(result.warning, /se guardó/);
  assert.equal(refresh.saved.length, 1);
  assert.equal((await refresh.deleteCashFlowTransaction("movement")).ok, true);
  assert.deepEqual(refresh.deleted, ["movement"]);
});
