import test from "node:test";
import assert from "node:assert/strict";
import { createRuntime } from "./runtime.mjs";

const {
  getFixtureRoundKey,
  getFixtureTeamNames,
  resolveFixtureSelection,
  serializeFixtureSelection,
  filterFixtureRounds,
} = createRuntime().load("lib/fixture-match-filters.ts");

const club = "La Nueva Guardia";
const match = (id, localTeam, visitorTeam) => ({ id, localTeam, visitorTeam });
const rounds = [
  {
    name: "Fecha 1",
    date: "1 de noviembre",
    matches: [match("home", club, "Abril"), match("other", "Regatas", "Fincas")],
  },
  {
    name: "Fecha 2",
    date: "8 de noviembre",
    matches: [match("away", "Regatas", club), match("other-2", "Fincas", "Abril")],
  },
  { name: "Fecha 3", date: "15 de noviembre", matches: [match("bye", club, "Libre")] },
];
const keys = rounds.map(getFixtureRoundKey);
const teams = getFixtureTeamNames(rounds, [
  { teamName: "Abril" },
  { teamName: "Equipo sin partido" },
]);

test("team options include home, away and standings teams without duplicates or bye placeholders", () => {
  assert.deepEqual(teams, ["Abril", "Equipo sin partido", "Fincas", club, "Regatas"]);
});

test("initial filters show every round and only La Nueva Guardia, home or away", () => {
  const dates = resolveFixtureSelection([], keys);
  const selectedTeams = resolveFixtureSelection([], teams, [club]);
  const visible = filterFixtureRounds(rounds, dates, selectedTeams);
  assert.deepEqual(selectedTeams, [club]);
  assert.deepEqual(
    visible.flatMap((round) => round.matches.map((item) => item.id)),
    ["home", "away", "bye"],
  );
  assert.equal(visible[0].matches.length, 1);
  assert.equal(
    rounds[0].matches.length,
    2,
    "filtering must not alter the source fixture",
  );
});

test("multiple dates and teams intersect, and a match with two selected teams appears once", () => {
  const visible = filterFixtureRounds(rounds, [keys[0], keys[1]], [club, "Regatas"]);
  assert.deepEqual(
    visible.flatMap((round) => round.matches.map((item) => item.id)),
    ["home", "other", "away"],
  );
  assert.deepEqual(filterFixtureRounds(rounds, [keys[2]], ["Abril"]), []);
});

test("Todos survives URL serialization and restores every match", () => {
  const request = serializeFixtureSelection(teams, teams);
  assert.deepEqual(request, ["all"]);
  const visible = filterFixtureRounds(
    rounds,
    resolveFixtureSelection(["all"], keys),
    resolveFixtureSelection(request, teams, [club]),
  );
  assert.equal(visible.flatMap((round) => round.matches).length, 5);
});

test("cleared or invalid selections remain empty instead of silently enabling every option", () => {
  assert.deepEqual(serializeFixtureSelection([], teams), ["none"]);
  assert.deepEqual(resolveFixtureSelection(["none"], teams, [club]), []);
  assert.deepEqual(resolveFixtureSelection(["missing-team"], teams, [club]), []);
  assert.deepEqual(resolveFixtureSelection([keys[0], keys[0], "missing-round"], keys), [
    keys[0],
  ]);
  assert.deepEqual(filterFixtureRounds(rounds, [], teams), []);
  assert.deepEqual(filterFixtureRounds(rounds, keys, []), []);
});
