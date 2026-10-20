import test from "node:test";
import assert from "node:assert/strict";
import { createRuntime } from "./runtime.mjs";

const targets = [
  ["327", "Apertura 2026", "4201", 'Primera "C"'],
  ["329", "Clausura 2026", "4314", 'Primera "B"'],
  ["387", "Copa de Liga 2026 VISION", "4225", "Primera"],
  ["320", "Clausura 2025", "4084", 'Primera "C"'],
  ["321", "Copa de Liga 2025", "4027", "Primera"],
];

function metadata() {
  const categories = Object.fromEntries(
    targets.map(([id, , category, name]) => [
      id,
      [
        {
          id: category,
          torneo_id: id,
          deporte: { name: "Futbol Mayores" },
          categoria: { name },
        },
      ],
    ]),
  );
  return `<select id="la_torneo">${targets.map(([id, name]) => `<option value="${id}">${name}</option>`).join("")}</select>
    var campeonatosXTorneo = ${JSON.stringify(categories)}
    ;`;
}

function fixture(points, matches = []) {
  return `<table class="alt-table"><tbody><tr><td>3</td><td><span class="team-nm">Barrio Dorrego</span></td><td>8</td><td>5</td><td>2</td><td>1</td><td>14</td><td>5</td><td>${points}</td></tr></tbody></table>${matches
    .map(
      ([date, score], index) => `
    <div class="alt-round"><span class="alt-round-badge">Fecha ${index + 1}</span><span class="alt-round-date">${date}</span>
      <div class="alt-match" data-fixture-hashed="match-${index}">
        <div class="alt-match-desktop"><div class="amd-time">15:00hs</div><div class="amd-team amd-local">Barrio Dorrego</div><div class="amd-score">${score ?? "vs"}</div><div class="amd-team amd-visitor">Rival ${index}</div></div>
        <div class="alt-match-mobile"><span>${score ?? "vs"}</span></div>
      </div>
    </div>`,
    )
    .join("")}`;
}

function leagueRuntime() {
  const pages = new Map([
    ["/futbol", metadata()],
    [
      "/liga/tabla-resultados-alt/4201/327",
      fixture(28, [
        ["20 de junio", "2 - 0"],
        ["", null],
        ["5 de diciembre", null],
      ]),
    ],
    [
      "/liga/tabla-resultados-alt/4314/329",
      fixture(17, [
        ["17 de octubre", "3 - 1"],
        ["24 de octubre", null],
      ]),
    ],
    [
      "/liga/tabla-resultados-alt/4225/387",
      fixture(8, [
        ["19 de octubre", "1 - 0"],
        ["22 de octubre", null],
      ]),
    ],
    ["/liga/tabla-resultados-alt/4084/320", fixture(10, [["15 de noviembre", "1 - 1"]])],
    ["/liga/tabla-resultados-alt/4027/321", fixture(3, [["20 de octubre", "0 - 1"]])],
  ]);
  const failed = new Set();
  const calls = [];
  const runtime = createRuntime({
    now: "2026-10-20T15:00:00Z",
    fetchImpl: async (url) => {
      const path = new URL(url).pathname;
      calls.push(path);
      return new Response(pages.get(path) ?? "", {
        status: failed.has(path) ? 503 : 200,
      });
    },
  });
  return {
    ...runtime,
    league: runtime.load("lib/league-fixture.ts"),
    pages,
    failed,
    calls,
  };
}

test("an unavailable historical division does not hide Clausura B, cup fixtures or all-competition statistics", async () => {
  const runtime = leagueRuntime();
  runtime.failed.add("/liga/tabla-resultados-alt/4084/320");
  const data = await runtime.league.getLeagueFixtureData();
  assert.equal(data.selectedCompetitionKey, "329:4314");
  assert.equal(data.selectedTournamentName, "Clausura 2026");
  assert.equal(data.clubStanding.points, 17);
  assert.equal(data.nextMatches[0].competitionKind, "cup");
  assert.equal(data.nextMatches[0].dateIso, "2026-10-22");
  assert.equal(data.lastMatches[0].competitionKind, "cup");
  assert.equal(data.lastMatches[0].dateIso, "2026-10-19");
  assert.equal(
    new Set(data.allClubMatches.map((match) => match.competitionName)).size,
    3,
  );
  assert.equal(data.source.status, "error");
  assert.match(data.source.message, /incompletas/);

  const { filterMatches, buildTeamStats, buildCompetitionOptions } =
    runtime.load("lib/team-stats.ts");
  const otherYear = await runtime.league.getLeagueClubMatchesForYear(2025);
  const matches = [...data.allClubMatches, ...otherYear];
  assert.equal(buildCompetitionOptions(matches).length, 4);
  const currentYear = filterMatches({
    matches,
    selectedCompetitionKeys: [],
    teamName: "La Nueva Guardia",
    yearFilter: "2026",
  });
  const allYears = filterMatches({
    matches,
    selectedCompetitionKeys: [],
    teamName: "La Nueva Guardia",
    yearFilter: "all",
  });
  const clausura = filterMatches({
    matches,
    selectedCompetitionKeys: ["329:4314"],
    teamName: "La Nueva Guardia",
    yearFilter: "2026",
  });
  assert.equal(buildTeamStats(currentYear, "La Nueva Guardia").played, 3);
  assert.equal(buildTeamStats(allYears, "La Nueva Guardia").played, 4);
  assert.equal(buildTeamStats(clausura, "La Nueva Guardia").played, 1);
  assert.equal(buildTeamStats(currentYear, "La Nueva Guardia").goalsFor, 6);

  const requests = runtime.calls.length;
  assert.equal(
    (await runtime.league.getLeagueFixtureData({ competition: "327:4201" }))
      .selectedCompetitionKey,
    "327:4201",
  );
  await runtime.league.getLeagueFixtureData();
  assert.equal(
    runtime.calls.length,
    requests,
    "navigation must reuse the scheduled snapshot even after a partial failure",
  );
});

test("the latest league table is selected from club membership even if its fixture is not published", async () => {
  const runtime = leagueRuntime();
  runtime.pages.set("/liga/tabla-resultados-alt/4314/329", fixture(17));
  const data = await runtime.league.getLeagueFixtureData();
  assert.equal(data.selectedCompetitionKey, "329:4314");
  assert.equal(data.clubStanding.points, 17);
  assert.equal(data.matches.length, 0);
  assert.equal(data.nextMatches[0].competitionKind, "cup");
});

test("a scheduled partial failure preserves the prior Clausura table and fixtures without retrying on navigation", async () => {
  const runtime = leagueRuntime();
  const original = await runtime.league.getLeagueFixtureData();
  runtime.clock.now = Date.parse("2026-10-21T14:00:00Z");
  runtime.failed.add("/liga/tabla-resultados-alt/4314/329");
  const refresh = await runtime.league.refreshLeagueFixtureCache();
  assert.match(refresh.warning, /una competencia/);
  const refreshed = await runtime.league.getLeagueFixtureData();
  assert.equal(refreshed.selectedCompetitionKey, "329:4314");
  assert.deepEqual(refreshed.clubStanding, original.clubStanding);
  assert.deepEqual(refreshed.clubMatches, original.clubMatches);
  const requests = runtime.calls.length;
  await runtime.league.getLeagueFixtureData();
  assert.equal(runtime.calls.length, requests);

  runtime.clock.now = Date.parse("2026-10-26T14:00:00Z");
  runtime.failed.clear();
  runtime.pages.set("/liga/tabla-resultados-alt/4314/329", "");
  await runtime.league.refreshLeagueFixtureCache();
  assert.deepEqual(
    (await runtime.league.getLeagueFixtureData()).clubStanding,
    original.clubStanding,
  );
});

test("an initial league outage reports unavailable data without switching the club back to Apertura C", async () => {
  const runtime = leagueRuntime();
  runtime.failed.add("/futbol");
  const data = await runtime.league.getLeagueFixtureData();
  assert.equal(data.source.status, "error");
  assert.equal(data.selectedCompetitionKey, "329:4314");
  assert.equal(data.standings.length, 0);
  const requests = runtime.calls.length;
  await runtime.league.getLeagueFixtureData();
  assert.equal(runtime.calls.length, requests);
});

test("a first-load failure of Clausura B does not show the old Apertura C table as current", async () => {
  const runtime = leagueRuntime();
  runtime.failed.add("/liga/tabla-resultados-alt/4314/329");
  const data = await runtime.league.getLeagueFixtureData();
  assert.equal(data.selectedCompetitionKey, "329:4314");
  assert.equal(data.source.status, "error");
  assert.equal(data.standings.length, 0);
  assert.equal(data.clubStanding, undefined);
  assert.equal(data.nextMatches[0].competitionKind, "cup");
});

test("all-competition statistics identify historical matches whose scores are missing at the source", async () => {
  const runtime = leagueRuntime();
  runtime.pages.set(
    "/liga/tabla-resultados-alt/4201/327",
    fixture(28, [["20 de junio", null]]),
  );
  const data = await runtime.league.getLeagueFixtureData();
  const { buildTeamStats } = runtime.load("lib/team-stats.ts");
  const stats = buildTeamStats(data.allClubMatches, "La Nueva Guardia");
  assert.equal(stats.played, 2);
  assert.equal(stats.unreportedMatches, 1);
  assert.equal(stats.goalsFor, 4);
  assert.equal(data.selectedCompetitionKey, "329:4314");
});

test("an undated historical result does not displace the latest dated league or cup result", async () => {
  const runtime = leagueRuntime();
  runtime.pages.set("/liga/tabla-resultados-alt/4201/327", fixture(28, [["", "2 - 0"]]));
  const data = await runtime.league.getLeagueFixtureData();
  assert.equal(data.lastMatches[0].dateIso, "2026-10-19");
  assert.equal(data.lastMatches[0].competitionKind, "cup");
  assert.equal(data.selectedCompetitionKey, "329:4314");
});

test("cached fixtures stop showing a past match as upcoming without fetching the league again", async () => {
  const runtime = leagueRuntime();
  const initial = await runtime.league.getLeagueFixtureData();
  assert.equal(initial.nextMatches[0].dateIso, "2026-10-22");
  const requests = runtime.calls.length;
  runtime.clock.now = Date.parse("2026-10-23T15:00:00Z");
  const later = await runtime.league.getLeagueFixtureData();
  assert.equal(later.nextMatches[0].dateIso, "2026-10-24");
  assert.equal(
    later.allClubMatches.find((match) => match.dateIso === "2026-10-22").status,
    "without-result",
  );
  assert.equal(runtime.calls.length, requests);
});
