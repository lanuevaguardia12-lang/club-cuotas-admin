import test from "node:test";
import assert from "node:assert/strict";
import { createRuntime } from "./runtime.mjs";
const vote = {
  matchId: "match-1",
  firstVotePlayerName: "Ana Pérez",
  secondVotePlayerName: "Bea Gómez",
};
test("saved votes return confirmation without waiting for a page rerender", async () => {
  let saved;
  const runtime = createRuntime({
    mocks: {
      "@/lib/auth/session": {
        getCurrentUser: async () => ({ id: "fan", name: "Fan", role: "fan" }),
      },
      "@/services/data-service": {
        getDataService: () => ({
          submitPlayerOfMatchVote: async (input) => {
            saved = input;
          },
        }),
      },
      "@/lib/player-of-match-notifications": {},
    },
  });
  runtime.nextCache.revalidatePath = () => {
    throw new Error("Do not rerender after saving");
  };
  const result = await runtime
    .load("app/(dashboard)/player-of-match/actions.ts")
    .submitPlayerOfMatchVote(vote);
  assert.equal(result.ok, true);
  assert.equal(result.message, "Voto registrado correctamente");
  assert.equal(saved.voterUserId, "fan");
});
test("a failed write returns an error rather than a successful vote confirmation", async () => {
  const runtime = createRuntime({
    mocks: {
      "@/lib/auth/session": {
        getCurrentUser: async () => ({ id: "fan", name: "Fan", role: "fan" }),
      },
      "@/services/data-service": {
        getDataService: () => ({
          submitPlayerOfMatchVote: async () => {
            throw new Error("No se pudo guardar");
          },
        }),
      },
      "@/lib/player-of-match-notifications": {},
    },
  });
  const result = await runtime
    .load("app/(dashboard)/player-of-match/actions.ts")
    .submitPlayerOfMatchVote(vote);
  assert.equal(result.ok, false);
  assert.equal(result.message, "No se pudo guardar");
});

test("vote endpoint rejects cross-origin requests and returns the saved result as JSON", async () => {
  let calls = 0;
  const runtime = createRuntime({
    mocks: {
      "@/app/(dashboard)/player-of-match/actions": {
        submitPlayerOfMatchVote: async () => {
          calls++;
          return { ok: true, message: "Voto registrado correctamente" };
        },
      },
    },
  });
  const { POST } = runtime.load("app/api/player-of-match/vote/route.ts");
  const request = (origin) => ({
    headers: new Headers({ origin }),
    nextUrl: new URL("https://club.test/api/player-of-match/vote"),
    json: async () => vote,
  });
  assert.equal((await POST(request("https://other.test"))).status, 403);
  assert.equal(calls, 0);
  const response = await POST(request("https://club.test"));
  assert.equal((await response.json()).ok, true);
  assert.equal(calls, 1);
});
