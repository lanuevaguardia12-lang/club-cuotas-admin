import test from "node:test";
import assert from "node:assert/strict";
import { createRuntime } from "./runtime.mjs";

function actionRuntime(user) {
  const paths = [];
  const tags = [];
  const runtime = createRuntime({
    mocks: {
      "@/lib/auth/session": { getCurrentUser: async () => user },
      "next/cache": {
        unstable_expireTag: (...values) => tags.push(...values),
        revalidatePath: (path) => paths.push(path),
      },
    },
  });
  const { refreshMyFeeFromFormsAction } = runtime.load(
    "app/(dashboard)/mi-cuota/actions.ts",
  );
  return { refreshMyFeeFromFormsAction, paths, tags };
}

test("refreshing a player's fee invalidates both Home and Mi cuota using the shared fee cache", async () => {
  const { refreshMyFeeFromFormsAction, paths, tags } = actionRuntime({
    id: "player",
    role: "player",
  });
  const result = await refreshMyFeeFromFormsAction();
  assert.equal(result.ok, true);
  assert.deepEqual(paths, ["/", "/mi-cuota"]);
  assert.ok(tags.includes("google-sheets:player-profile"));
  assert.ok(tags.includes("google-sheets:fee-calculator"));
  assert.ok(!tags.includes("google-sheets"), "manual refresh must not clear every cache");
});

test("fee refresh does not invalidate data for visitors or other roles", async () => {
  for (const user of [null, { role: "fan" }, { role: "coach" }, { role: "admin" }]) {
    const { refreshMyFeeFromFormsAction, paths, tags } = actionRuntime(user);
    assert.equal((await refreshMyFeeFromFormsAction()).ok, false);
    assert.deepEqual(paths, []);
    assert.deepEqual(tags, []);
  }
});
