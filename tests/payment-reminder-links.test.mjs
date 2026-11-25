import test from "node:test";
import assert from "node:assert/strict";
import { createRuntime } from "./runtime.mjs";
test("legacy payment links in saved reminder templates open the internal player payment screen", () => {
  const { buildReminderMessage, PLAYER_PAYMENT_PAGE_URL } =
    createRuntime().load("lib/reminders.ts");
  const text = buildReminderMessage(
    "Hola {nombre}, cuota {mes}: {monto}. https://forms.gle/FFmGxDKRM4UNhM5h6",
    {
      playerName: "Ana",
      currentMonth: "noviembre",
      feeAmount: "$ 50.000",
      clubName: "Club",
    },
  );
  assert.ok(text.includes(PLAYER_PAYMENT_PAGE_URL));
  assert.ok(!text.includes("forms.gle"));
  assert.ok(text.includes("Ana"));
  assert.ok(text.includes("noviembre"));
});
