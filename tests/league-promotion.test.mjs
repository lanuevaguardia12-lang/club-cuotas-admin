import test from "node:test";
import assert from "node:assert/strict";
import { createRuntime } from "./runtime.mjs";

const categories = [
  ["4313", 'Primera "A"'],
  ["4314", 'Primera "B"'],
  ["4315", 'Primera "C"'],
  ["4360", "Primera Promocion A - B"],
  ["4361", "Promoción B - C"],
  ["4359", "Play Off Primera A"],
  ["other", "Play Off Primera Femenino"],
];
function metadata(withStages = true) {
  const available = withStages ? categories : categories.slice(0, 3);
  return `<select id="la_torneo"><option value="329">Clausura 2026</option></select>
    var campeonatosXTorneo = ${JSON.stringify({ 329: available.map(([id, name]) => ({ id, torneo_id: "329", deporte: { name: "Futbol Mayores" }, categoria: { name } })) })}
    ;`;
}
function fixture({
  category,
  club = false,
  date = "7 de noviembre",
  score = "2 - 1",
  rival = "Rival",
}) {
  const team = club ? "Barrio Dorrego" : "Otro equipo";
  return `<table class="alt-table"><tbody><tr><td>4</td><td><span class="team-nm">${team}</span></td><td>11</td><td>5</td><td>4</td><td>2</td><td>16</td><td>9</td><td>19</td></tr></tbody></table>
    <div class="alt-round"><span class="alt-round-badge">Fecha 1</span><span class="alt-round-date">${date}</span>
      <div class="alt-match" data-fixture-hashed="match-${category}"><div class="amd-time">14:00hs</div><div class="amd-team amd-local">${team}</div><div class="amd-score">${score}</div><div class="amd-team amd-visitor">${rival}</div></div>
    </div>`;
}
function runtime() {
  const calls = [];
  const publication = { stages: true };
  const pages = new Map(
    categories.map(([category]) => [
      category,
      fixture({ category, club: category === "4314" }),
    ]),
  );
  pages.set(
    "4360",
    fixture({
      category: "4360",
      club: true,
      date: "14 de noviembre",
      score: "vs",
      rival: "Gimnasia y Esgrima de Sarandi",
    }),
  );
  const rt = createRuntime({
    now: "2026-11-11T18:00:00Z",
    fetchImpl: async (url) => {
      const path = new URL(url).pathname;
      calls.push(path);
      return new Response(
        path === "/futbol"
          ? metadata(publication.stages)
          : (pages.get(path.split("/")[3]) ?? ""),
      );
    },
  });
  return { ...rt, calls, publication, league: rt.load("lib/league-fixture.ts") };
}

test("Clausura discovers promotion/playoff phases and the club's official promotion match without replacing its B table", async () => {
  const rt = runtime();
  const data = await rt.league.getLeagueFixtureData();
  assert.equal(data.selectedCompetitionKey, "329:4314");
  assert.equal(data.clubStanding.points, 19);
  const options = data.tournaments[0].categories.map((item) => item.id);
  assert.ok(options.includes("4360"));
  assert.ok(options.includes("4361"));
  assert.ok(options.includes("4359"));
  assert.ok(!options.includes("other"));
  const next = data.nextMatches[0];
  assert.ok(next.id.startsWith("329:4360:"));
  assert.equal(next.categoryName, "Primera Promocion A - B");
  assert.equal(next.localTeam, "La Nueva Guardia");
  assert.equal(next.visitorTeam, "Gimnasia y Esgrima de Sarandi");
  assert.equal(next.dateIso, "2026-11-14");
  assert.equal(next.time, "14:00hs");
  assert.equal(data.lastMatches[0].categoryName, 'Primera "B"');

  const requests = rt.calls.length;
  const phase = await rt.league.getLeagueFixtureData({
    competition: "329:4360",
    year: "2026",
  });
  assert.equal(phase.clubMatches.length, 1);
  assert.equal(phase.matches[0].id, next.id);
  const allClubMatches = await rt.league.getLeagueClubMatchesForYear(2026);
  assert.equal(allClubMatches.filter((match) => match.id === next.id).length, 1);
  const { buildCompetitionOptions } = rt.load("lib/team-stats.ts");
  const labels = buildCompetitionOptions(allClubMatches).map((item) => item.label);
  assert.ok(labels.includes("Promoción A–B · Clausura 2026"));
  assert.ok(labels.includes("Clausura 2026"));
  assert.equal(
    rt.calls.length,
    requests,
    "viewing Home, fixtures and statistics must reuse the same scheduled copy",
  );
});

test("new promotion categories are discovered at the next scheduled refresh without polling on visits", async () => {
  const rt = runtime();
  rt.clock.now = Date.parse("2026-11-09T20:00:00Z");
  rt.publication.stages = false;
  const before = await rt.league.getLeagueFixtureData();
  assert.equal(before.nextMatches.length, 0);
  const requests = rt.calls.length;
  rt.publication.stages = true;
  rt.clock.now = Date.parse("2026-11-11T14:00:00Z");
  assert.equal((await rt.league.getLeagueFixtureData()).nextMatches.length, 0);
  assert.equal(rt.calls.length, requests);
  await rt.league.refreshLeagueFixtureCache();
  assert.ok(
    (await rt.league.getLeagueFixtureData()).nextMatches[0].id.startsWith("329:4360:"),
  );
  const afterRefresh = rt.calls.length;
  await rt.league.getLeagueFixtureData();
  assert.equal(rt.calls.length, afterRefresh);
});

test("promotion labels distinguish divisions and do not rename ordinary league or cup matches", () => {
  const { getCompetitionStageLabel } = createRuntime().load(
    "lib/league-competition-label.ts",
  );
  assert.equal(
    getCompetitionStageLabel("Clausura 2026", "Primera Promocion A - B"),
    "Promoción A–B",
  );
  assert.equal(
    getCompetitionStageLabel("Promoción Apertura 2026 A-B", "Primera"),
    "Promoción A–B",
  );
  assert.equal(
    getCompetitionStageLabel("Clausura 2026", "Promoción B–C"),
    "Promoción B–C",
  );
  assert.equal(
    getCompetitionStageLabel("Clausura 2026", "Play Off Primera A"),
    "Playoffs",
  );
  assert.equal(getCompetitionStageLabel("Clausura 2026", 'Primera "B"'), undefined);
  assert.equal(getCompetitionStageLabel("Copa de Liga 2026", "Primera"), undefined);
});
