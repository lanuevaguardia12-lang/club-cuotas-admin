import test from "node:test";
import assert from "node:assert/strict";
import { createRuntime } from "./runtime.mjs";
const data = {
  players: [
    { id: "ana", name: "Ana Pérez", status: "active" },
    { id: "bea", name: "Bea Gómez", status: "active" },
    { id: "caro", name: "Carolina", status: "active" },
  ],
  matches: [],
};
function helper(now = "2026-11-25T12:00:00Z") {
  return createRuntime({ now }).load("lib/match-attendance.ts");
}

test("fixture information prefills date/rival/competition and only actual called players; home/away remains a DT decision", () => {
  const { initialMatchAttendance } = helper();
  const initial = initialMatchAttendance(
    {
      fixtureId: "fixture-1",
      date: "2026-11-21",
      rival: "Rival FC",
      sourceType: "cup",
      venue: "Local",
      convoked: "1",
      player: ["ANA PEREZ", "Bea Gómez"],
    },
    data,
  );
  assert.equal(initial.date, "2026-11-21");
  assert.equal(initial.rival, "Rival FC");
  assert.equal(initial.sourceType, "cup");
  assert.equal(initial.venue, "");
  assert.equal(initial.fixtureId, "fixture-1");
  assert.deepEqual(initial.playerIds, ["ana", "bea"]);
  assert.deepEqual(initial.convokedPlayerIds, ["ana", "bea"]);
  assert.deepEqual(initial.unresolvedConvokedNames, []);
});
test("a new manual match uses today's date in Argentina and requires an explicit competition", () => {
  const { initialMatchAttendance } = helper("2026-12-01T01:00:00Z");
  const initial = initialMatchAttendance({}, data);
  assert.equal(initial.date, "2026-11-30");
  assert.equal(initial.sourceType, "");
  assert.equal(initial.rival, "");
  assert.deepEqual(initial.playerIds, []);
});
test("reopening a saved fixture preserves the recorded entrants instead of selecting the whole call-up again", () => {
  const { initialMatchAttendance } = helper();
  const existing = {
    id: "recorded",
    fixtureId: "fixture-1",
    date: "2026-11-21",
    rival: "Rival FC",
    sourceType: "cup",
    venue: "Local",
    coachAttended: false,
    participantPlayerIds: ["ana"],
    players: ["Ana Pérez"],
  };
  const initial = initialMatchAttendance(
    {
      fixtureId: "fixture-1",
      date: "2026-11-22",
      rival: "Other spelling",
      sourceType: "league",
      convoked: "1",
      player: ["Ana Pérez", "Bea Gómez"],
    },
    { ...data, matches: [existing] },
  );
  assert.equal(initial.id, "recorded");
  assert.equal(initial.sourceType, "cup");
  assert.equal(initial.date, "2026-11-21");
  assert.equal(initial.venue, "Local");
  assert.equal(initial.coachAttended, false);
  assert.deepEqual(initial.playerIds, ["ana"]);
  assert.deepEqual(initial.convokedPlayerIds, ["ana", "bea"]);
});
test("unknown and ambiguous call-up names are reported without marking a different player's attendance", () => {
  const { initialMatchAttendance } = helper();
  const initial = initialMatchAttendance(
    { convoked: "1", player: ["Ana Pérez", "Missing player"] },
    data,
  );
  assert.deepEqual(initial.playerIds, ["ana"]);
  assert.deepEqual(initial.unresolvedConvokedNames, ["Missing player"]);
  const ambiguous = initialMatchAttendance(
    { convoked: "1", player: "Ana Pérez" },
    {
      ...data,
      players: [
        ...data.players,
        { id: "other-ana", name: "Ana Perez", status: "active" },
      ],
    },
  );
  assert.deepEqual(ambiguous.playerIds, []);
});

test("attendance page is available only to the DT and rejects other roles before reading the roster", async () => {
  for (const role of ["admin", "treasurer", "player", "fan", null]) {
    let reads = 0;
    const runtime = createRuntime({
      mocks: {
        "@/lib/auth/session": {
          getCurrentUser: async () => (role ? { id: "user", role } : null),
        },
        "next/navigation": {
          redirect: () => {
            throw new Error("redirect-login");
          },
        },
        "next/link": () => null,
        "@/components/match-attendance/match-attendance-editor": {
          MatchAttendanceEditor: () => null,
        },
        "@/services/database/matches-store": { matchesDatabaseEnabled: () => true },
        "@/services/data-service": {
          getDataService: () => {
            reads++;
            throw new Error("must not read");
          },
        },
      },
    });
    const page = runtime.load("app/(dashboard)/match-attendance/page.tsx").default;
    if (role) await page({ searchParams: Promise.resolve({}) });
    else
      await assert.rejects(page({ searchParams: Promise.resolve({}) }), /redirect-login/);
    assert.equal(reads, 0);
  }
});
