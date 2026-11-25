import test from "node:test";
import assert from "node:assert/strict";
import { createRuntime, createSheetsMock } from "./runtime.mjs";

function setup() {
  let matches = [],
    snapshots = [];
  const players = [
    { id: "ana", name: "Ana Pérez", status: "active" },
    { id: "bea", name: "Bea Gómez", status: "active" },
  ];
  const sheets = createSheetsMock();
  const runtime = createRuntime({
    mocks: {
      googleapis: sheets.googleapis,
      "@/lib/match-registration-form": {
        getAttendanceFixtureRival: async (id) =>
          id === "missing-fixture" ? null : "Rival",
      },
      "@/services/database/matches-store": {
        matchesDatabaseEnabled: () => true,
        MatchesStore: class {
          async list() {
            return structuredClone(matches);
          }
          async save(match, participants) {
            assert.deepEqual(
              match.players,
              participants.map((p) => p.playerName),
            );
            const at = matches.findIndex((m) => m.id === match.id);
            if (at < 0) matches.push(structuredClone(match));
            else matches[at] = structuredClone(match);
          }
          async saveSnapshot(snapshot) {
            snapshots.push(snapshot);
          }
        },
      },
      "@/services/database/directory-store": {
        directoryDatabaseEnabled: () => true,
        DirectoryStore: class {
          async list() {
            return structuredClone(players);
          }
        },
      },
    },
  });
  const { GoogleSheetsService, matchesCodec } = runtime.load(
    "services/GoogleSheetsService.ts",
  );
  const service = new GoogleSheetsService({
    spreadsheetId: "app",
    clubSpreadsheetId: "app",
    matchesSpreadsheetId: "matches",
    clientEmail: "test@example.com",
    privateKey: "test",
  });
  const input = {
    date: "2026-10-03",
    rival: "Rival",
    sourceType: "league",
    venue: "Local",
    coachAttended: true,
    playerIds: ["ana", "bea"],
  };
  return {
    service,
    input,
    sheets,
    runtime,
    matchesCodec,
    matches: () => matches,
    snapshots: () => snapshots,
  };
}

test("native match recording preserves DT attendance, selected players, edits and unresolved historical names without Sheets writes", async () => {
  const x = setup();
  await x.service.upsertMatchAttendance(x.input);
  let data = await x.service.getMatchAttendanceData();
  assert.equal(data.source.provider, "postgresql");
  assert.equal(data.matches.length, 1);
  assert.deepEqual(data.matches[0].players, ["Ana Pérez", "Bea Gómez"]);
  assert.deepEqual(data.matches[0].participantPlayerIds, ["ana", "bea"]);
  const id = data.matches[0].id;
  const loadedAt = data.matches[0].loadedAt;
  x.matches()[0].players.push("Jugador histórico");
  await x.service.upsertMatchAttendance({
    ...x.input,
    id,
    coachAttended: false,
    playerIds: ["ana"],
  });
  data = await x.service.getMatchAttendanceData();
  assert.equal(data.matches.length, 1);
  assert.equal(data.matches[0].loadedAt, loadedAt);
  assert.equal(data.matches[0].coachAttended, false);
  assert.deepEqual(data.matches[0].players, ["Ana Pérez", "Jugador histórico"]);
  assert.equal(x.sheets.calls.writes, 0);
  assert.equal(x.sheets.calls.reads, 0);
  assert.ok(x.runtime.expired.includes("google-sheets:fee-calculator"));
  assert.ok(x.runtime.expired.includes("google-sheets:account-profile"));
});
test("native match recording rejects invalid dates, duplicate players, missing players and unknown edit ids", async () => {
  const x = setup();
  for (const change of [
    { date: "2026-02-30" },
    { playerIds: [] },
    { playerIds: ["ana", "ana"] },
    { playerIds: ["missing"] },
    { id: "unknown" },
    { venue: "" },
    { venue: "Cancha 1" },
  ])
    await assert.rejects(x.service.upsertMatchAttendance({ ...x.input, ...change }));
  assert.equal(x.matches().length, 0);
});
test("recording action checks roles before touching attendance data", async () => {
  for (const role of ["admin", "player", "fan", "treasurer", null]) {
    let touched = false;
    const runtime = createRuntime({
      mocks: {
        "@/lib/auth/session": {
          getCurrentUser: async () => (role ? { id: "u", role } : null),
        },
        "@/services/data-service": {
          getDataService() {
            touched = true;
            throw new Error("must not load");
          },
        },
      },
    });
    const { saveMatchAttendance } = runtime.load(
      "app/(dashboard)/match-attendance/actions.ts",
    );
    assert.ok((await saveMatchAttendance({})).error);
    assert.equal(touched, false);
  }
  for (const role of ["coach"]) {
    let saved;
    const runtime = createRuntime({
      mocks: {
        "@/lib/auth/session": { getCurrentUser: async () => ({ id: "u", role }) },
        "@/services/data-service": {
          getDataService: () => ({
            upsertMatchAttendance: async (input) => {
              saved = input;
            },
          }),
        },
      },
    });
    const { saveMatchAttendance } = runtime.load(
      "app/(dashboard)/match-attendance/actions.ts",
    );
    const input = {
      fixtureId: "fixture-action",
      date: "2026-10-03",
      rival: "Rival",
      sourceType: "league",
      venue: "Local",
      coachAttended: false,
      playerIds: ["ana"],
    };
    assert.equal((await saveMatchAttendance(input)).ok, true);
    assert.deepEqual(saved, input);
  }
});

test("fixture registration links use the internal form only when matches have migrated", () => {
  const x = setup();
  const fixture = {
    dateIso: "2026-10-03",
    roundDate: "2026-10-03",
    competitionKind: "league",
    localTeam: "La Nueva Guardia",
    visitorTeam: "Rival",
    isClubMatch: true,
    id: "fixture-1",
    convokedPlayerNames: ["Ana Pérez"],
  };
  const native = x.runtime
    .load("lib/match-registration-form.ts")
    .buildMatchRegistrationFormUrl({ match: fixture, playerNames: ["Ana Pérez"] });
  assert.ok(native.startsWith("/match-attendance?"));
  const url = new URL(native, "https://example.test");
  assert.equal(url.searchParams.get("date"), "2026-10-03");
  assert.equal(url.searchParams.get("sourceType"), "league");
  assert.equal(url.searchParams.get("fixtureId"), "fixture-1");
  assert.equal(url.searchParams.has("venue"), false);
  assert.deepEqual(url.searchParams.getAll("player"), ["Ana Pérez"]);
  const legacy = createRuntime({
    mocks: {
      "@/services/database/matches-store": { matchesDatabaseEnabled: () => false },
    },
  })
    .load("lib/match-registration-form.ts")
    .buildMatchRegistrationFormUrl({ match: fixture, playerNames: ["Ana Pérez"] });
  assert.equal(new URL(legacy).hostname, "docs.google.com");
});

test("native fixture links do not recalculate fees or preselect the entire squad when no call-up exists", async () => {
  const x = setup();
  const helper = x.runtime.load("lib/match-registration-form.ts");
  const data = await helper.getRegistrationPlayerNamesByPeriod(
    {
      getPlayersData() {
        throw new Error("must not fetch");
      },
      getFeeCalculatorData() {
        throw new Error("must not calculate");
      },
    },
    [],
  );
  assert.deepEqual(data, { __default: [] });
  const url = new URL(
    helper.buildMatchRegistrationFormUrl({
      match: {
        dateIso: "2026-10-03",
        competitionKind: "cup",
        localTeam: "La Nueva Guardia",
        visitorTeam: "Rival",
      },
      playerNames: ["Ana Pérez", "Bea Gómez"],
    }),
    "https://example.test",
  );
  assert.deepEqual(url.searchParams.getAll("player"), []);
});

test("a saved match returns its ID and preserves the fixture link when editing attendance", async () => {
  const x = setup();
  const id = await x.service.upsertMatchAttendance({
    ...x.input,
    fixtureId: "fixture-42",
  });
  assert.ok(id);
  assert.equal(x.matches()[0].fixtureId, "fixture-42");
  const edited = await x.service.upsertMatchAttendance({
    ...x.input,
    id,
    playerIds: ["ana"],
  });
  assert.equal(edited, id);
  assert.equal(x.matches().length, 1);
  assert.equal(x.matches()[0].fixtureId, "fixture-42");
});

test("retrying a fixture recording updates the same match even without the returned record ID", async () => {
  const x = setup();
  const first = await x.service.upsertMatchAttendance({
    ...x.input,
    fixtureId: "fixture-retry",
  });
  const retry = await x.service.upsertMatchAttendance({
    ...x.input,
    fixtureId: "fixture-retry",
    playerIds: ["bea"],
  });
  assert.equal(retry, first);
  assert.equal(x.matches().length, 1);
  assert.deepEqual(x.matches()[0].players, ["Bea Gómez"]);
});

test("the opponent is fixed to the fixture for a new record and to the recorded match when editing", async () => {
  const x = setup();
  const id = await x.service.upsertMatchAttendance({
    ...x.input,
    fixtureId: "fixture-locked",
    rival: "Changed by client",
  });
  assert.equal(x.matches()[0].rival, "Rival");
  await x.service.upsertMatchAttendance({
    ...x.input,
    id,
    rival: "Another change",
    fixtureId: "different-fixture",
  });
  assert.equal(x.matches()[0].rival, "Rival");
  assert.equal(x.matches()[0].fixtureId, "fixture-locked");
});

test("a new attendance with an unavailable fixture cannot save a posted opponent", async () => {
  const x = setup();
  await assert.rejects(
    x.service.upsertMatchAttendance({ ...x.input, fixtureId: "missing-fixture" }),
    /No se encontró el partido/,
  );
  assert.equal(x.matches().length, 0);
});

test("the fixed opponent is resolved from the actual fixture teams", async () => {
  const runtime = createRuntime({
    mocks: {
      "@/lib/league-fixture": {
        APP_TEAM_NAME: "La Nueva Guardia",
        getLeagueFixtureData: async () => ({
          allClubMatches: [
            {
              id: "fixture-home",
              isClubMatch: true,
              localTeam: "La Nueva Guardia",
              visitorTeam: "Rival local",
            },
            {
              id: "fixture-away",
              isClubMatch: true,
              localTeam: "Rival visitante",
              visitorTeam: "La Nueva Guardia",
            },
          ],
        }),
      },
    },
  });
  const helper = runtime.load("lib/match-registration-form.ts");
  assert.equal(
    await helper.getAttendanceFixtureRival("fixture-home", "2026-11-21"),
    "Rival local",
  );
  assert.equal(
    await helper.getAttendanceFixtureRival("fixture-away", "2026-11-21"),
    "Rival visitante",
  );
  assert.equal(await helper.getAttendanceFixtureRival("missing", "2026-11-21"), null);
});
