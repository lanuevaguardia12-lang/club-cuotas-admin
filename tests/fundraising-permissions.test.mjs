import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRuntime } from "./runtime.mjs";

const pages = [
  "app/(dashboard)/players/[playerId]/page.tsx",
  "app/(dashboard)/fee-calculator/page.tsx",
  "app/(dashboard)/cash-flow/page.tsx",
];
for (const file of pages) {
  test(`${file} refuses access before reading balances for players, coaches, fans and anonymous requests`, async () => {
    for (const role of ["player", "coach", "fan", null]) {
      let reads = 0;
      const source = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
      const mocks = Object.fromEntries(
        [...source.matchAll(/from "(@\/[^\"]+)"/g)].map((match) => [match[1], {}]),
      );
      delete mocks["@/lib/auth/roles"];
      mocks["@/lib/auth/session"] = {
        getCurrentUser: async () => (role ? { id: role, role } : null),
      };
      mocks["@/services/data-service"] = {
        getDataService: () => {
          reads++;
          throw new Error("Financial data must not be read");
        },
      };
      const page = createRuntime({ mocks }).load(file).default;
      await assert.rejects(
        page({
          params: Promise.resolve({ playerId: "someone-else" }),
          searchParams: Promise.resolve({ period: "2026-10" }),
        }),
        /FORBIDDEN/,
      );
      assert.equal(reads, 0);
    }
  });
}

test("only administrator and treasurer can apply targeted benefits and selection survives server validation", async () => {
  for (const role of ["admin", "treasurer", "player", "coach", "fan"]) {
    const saved = [];
    const runtime = createRuntime({
      mocks: {
        "@/lib/auth/session": {
          getCurrentUser: async () => ({ id: role, role, name: role }),
        },
        "@/services/data-service": {
          getDataService: () => ({
            applyFundraisingBenefit: async (input) => saved.push(input),
            recordAuditEvent: async () => {},
          }),
        },
      },
    });
    const { applyFundraisingBenefit } = runtime.load(
      "app/(dashboard)/fee-calculator/actions.ts",
    );
    const input = {
      fundraisingId: "__all__",
      costId: "shirts",
      playerIds: ["ana"],
      percent: 50,
      period: "2026-10",
    };
    if (["admin", "treasurer"].includes(role)) {
      await applyFundraisingBenefit(input);
      assert.deepEqual(saved[0], input);
      await assert.rejects(applyFundraisingBenefit({ ...input, playerIds: [] }));
    } else {
      await assert.rejects(applyFundraisingBenefit(input), /FORBIDDEN/);
      assert.equal(saved.length, 0);
    }
  }
});
