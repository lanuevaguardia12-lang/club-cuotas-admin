import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server.js";

import { createRuntime } from "./runtime.mjs";

const admin = { id: "admin", name: "Admin", username: "admin", role: "admin" };
const player = {
  id: "user-ana",
  playerId: "p1",
  name: "Ana Pérez",
  username: "ana",
  role: "player",
};

test("annual candidates come from played matches in the chosen year, with aliases and repeat appearances deduplicated", () => {
  const { getAnnualMvpCandidates, isAnnualMvpSelfVote } =
    createRuntime().load("lib/annual-mvp.ts");
  const candidates = getAnnualMvpCandidates(
    {
      players: [
        { id: "p1", name: "Ana Pérez" },
        { id: "p2", name: "Sin partidos" },
      ],
      matches: [
        { date: "2025-12-31", players: ["Temporada anterior"] },
        {
          date: "2026-01-01",
          participants: [
            { playerId: "p1", playerName: "Anita" },
            { playerName: "Carlos Díaz" },
          ],
        },
        { date: "2026-11-27T10:00", players: ["  carlos diaz  ", "Ana Pérez"] },
        { date: "2026-11-28", players: ["Partido futuro"] },
      ],
    },
    2026,
    "2026-11-27",
  );
  assert.deepEqual(
    candidates.map(({ id, name }) => ({ id, name })),
    [
      { id: "player:p1", name: "Ana Pérez" },
      { id: "name:carlos diaz", name: "Carlos Díaz" },
    ],
  );
  assert.equal(isAnnualMvpSelfVote(candidates[0], player), true);
  assert.equal(isAnnualMvpSelfVote(candidates[0], { ...player, role: "fan" }), false);
});

test("the annual ballot exposes only the user's own vote and reserves the count for administrators", () => {
  const { getAnnualMvpBallot } = createRuntime().load("lib/annual-mvp.ts");
  const survey = {
    year: 2026,
    closed: false,
    candidates: [
      { id: "player:p1", name: "Ana Pérez", playerId: "p1", votes: 9 },
      { id: "player:p2", name: "Diego Díaz", playerId: "p2", votes: 5 },
    ],
  };
  const ballot = getAnnualMvpBallot(survey, player);
  assert.deepEqual(ballot.choices, [{ id: "player:p2", name: "Diego Díaz" }]);
  assert.equal("results" in ballot, false);
  for (const closed of [false, true]) {
    assert.deepEqual(
      getAnnualMvpBallot({ ...survey, closed, userVoteId: "player:p2" }, player),
      { year: 2026, closed, votedFor: "Diego Díaz", choices: [] },
    );
  }
  const adminBallot = getAnnualMvpBallot(survey, admin);
  assert.deepEqual(adminBallot.choices, []);
  assert.deepEqual(
    adminBallot.results?.map(({ votes }) => votes),
    [9, 5],
  );
});

test("only admins publish and eligible voters use the annual vote store", async () => {
  let user = player;
  const saved = [];
  const runtime = createRuntime({
    now: "2026-11-27T12:00:00Z",
    mocks: {
      "@/lib/auth/session": { getCurrentUser: async () => user },
      "@/services/data-service": {
        getDataService: () => ({
          getMatchAttendanceData: async () => ({
            players: [],
            matches: [{ date: "2026-09-01", players: ["Carlos"] }],
          }),
          submitPlayerOfMatchVote: () =>
            assert.fail("annual votes must not reach the match store"),
        }),
      },
      "@/services/database/annual-mvp-store": {
        AnnualMvpError: Error,
        AnnualMvpStore: class {
          async publish(year, candidates) {
            saved.push({ year, candidates });
          }
          async vote(year, candidateId, voter) {
            saved.push({ year, candidateId, voter: voter.id });
            return "Carlos";
          }
        },
      },
    },
  });
  const { manageAnnualMvpSurvey } = runtime.load("app/(dashboard)/encuestas/actions.ts");
  const { submitAnnualMvpVote } = runtime.load(
    "app/(dashboard)/player-of-match/annual-actions.ts",
  );
  const publish = new FormData();
  publish.set("intent", "publish");
  publish.set("year", "2026");
  const ballot = new FormData();
  ballot.set("year", "2026");
  ballot.set("candidateId", "name:carlos");
  assert.equal((await manageAnnualMvpSurvey(null, publish)).ok, false);
  user = admin;
  assert.equal((await submitAnnualMvpVote(null, ballot)).ok, false);
  assert.equal((await manageAnnualMvpSurvey(null, publish)).ok, true);
  user = player;
  const receipt = await submitAnnualMvpVote(null, ballot);
  assert.deepEqual(receipt, {
    ok: true,
    message: "Voto registrado correctamente.",
    votedFor: "Carlos",
  });
  assert.deepEqual(saved, [
    {
      year: 2026,
      candidates: [{ id: "name:carlos", name: "Carlos", playerId: undefined }],
    },
    { year: 2026, candidateId: "name:carlos", voter: player.id },
  ]);
});

test("the annual announcement targets voters, preserves a direct link in the inbox and push, and skips repeat sends", async () => {
  let open = true;
  let user = player;
  const records = [];
  const pushes = [];
  const dataService = {
    getAccountUsers: async () =>
      [admin, player, { ...player, id: "fan", username: "fan", role: "fan" }].map(
        (account) => ({ ...account, userId: account.id }),
      ),
    getNotifications: async () => records,
    getPushSubscriptions: async () => [{ userId: player.id, active: true }],
    createNotifications: async (batch) => {
      records.push(...batch);
    },
    updateNotificationDeliveries: async () => {},
    recordAuditEvent: async () => {},
  };
  class AnnualMvpError extends Error {}
  const runtime = createRuntime({
    mocks: {
      "@/lib/auth/session": { getCurrentUser: async () => user },
      "@/services/data-service": { getDataService: () => dataService },
      "@/services/database/annual-mvp-store": {
        AnnualMvpError,
        AnnualMvpStore: class {
          async withNoticeLock(year, create) {
            assert.equal(year, 2026);
            if (!open) throw new AnnualMvpError("La votación no está abierta.");
            return create();
          }
        },
      },
      "@/lib/push": {
        isPushConfigured: () => true,
        sendPushNotification: async (_device, payload) => {
          assert.equal(records.length, 2);
          pushes.push(payload);
        },
      },
    },
  });
  const { POST } = runtime.load("app/api/notifications/annual-mvp/route.ts");
  const { annualMvpNoticeSchema } = runtime.load("lib/annual-mvp.ts");
  assert.deepEqual(annualMvpNoticeSchema.parse({ year: 2026 }), {
    year: 2026,
    title: "Votá al MVP del año",
    message:
      "Hacé clic y votá al MVP del año. El premio se entrega en la fiesta de fin de año.",
  });
  const message =
    "Hacé clic para votar. El premio se entrega en la fiesta de fin de año.";
  const notice = { year: 2026, title: " MVP del año 2026 ", message };
  const send = (origin = "https://test", payload = notice) =>
    POST(
      new NextRequest("https://test/api/notifications/annual-mvp", {
        method: "POST",
        headers: { origin },
        body: JSON.stringify(payload),
      }),
    );
  assert.equal((await send()).status, 403);
  user = admin;
  assert.equal((await send("https://other.test")).status, 403);
  assert.equal((await send("https://test", { ...notice, title: " " })).status, 400);
  assert.equal((await (await send()).json()).created, 2);
  assert.equal((await (await send()).json()).alreadyCreated, 2);
  assert.deepEqual(
    records.map((record) => record.targetUserId),
    [player.id, "fan"],
  );
  assert.ok(
    records.every(
      (record) =>
        record.notificationKind === "annual-mvp" &&
        record.url === "/mvp-del-ano/2026" &&
        record.title === "MVP del año 2026" &&
        record.message === message,
    ),
  );
  assert.deepEqual(
    pushes.map(({ url, title, body }) => ({ url, title, body })),
    [{ url: "/mvp-del-ano/2026", title: "MVP del año 2026", body: message }],
  );
  open = false;
  assert.equal((await send()).status, 409);

  const { GET: followNotice } = runtime.load("app/mvp-del-ano/[year]/route.ts");
  const openNotice = () =>
    followNotice(new Request("https://test/mvp-del-ano/2026"), {
      params: Promise.resolve({ year: "2026" }),
    });
  const target = "/player-of-match?tab=mvp-del-ano&anio=2026#mvp-del-ano-2026";
  await assert.rejects(openNotice(), (error) => error.digest?.includes(target));
  user = null;
  await assert.rejects(openNotice(), (error) =>
    error.digest?.includes(`/login?redirectTo=${encodeURIComponent(target)}`),
  );
});
