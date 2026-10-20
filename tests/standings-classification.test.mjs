import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source = readFileSync(
  new URL("../lib/standings-classification.ts", import.meta.url),
  "utf8",
);
const { outputText } = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
});
const { getStandingsClassifications, getStandingClassificationStyle } = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`
);
const standings = (count) =>
  Array.from({ length: count }, (_, index) => ({ position: index + 1 }));

test("Primera A y B marcan los últimos dos y los dos anteriores según la cantidad de equipos", () => {
  for (const category of ['Primera "A"', 'Primera "B"', "Primera “A”", " primera b "]) {
    for (const count of [10, 12, 16, 20]) {
      const rows = standings(count);
      const before = structuredClone(rows);
      const classifications = getStandingsClassifications(category, rows.toReversed());
      const relegation = classifications.find((item) => item.kind === "relegation");
      const playoff = classifications.find((item) => item.kind === "relegation-playoff");

      assert.deepEqual(relegation.positions, [count - 1, count]);
      assert.equal(relegation.label, `${count - 1}°/${count}° Descenso directo`);
      assert.deepEqual(playoff.positions, [count - 3, count - 2]);
      assert.equal(playoff.label, `${count - 3}°/${count - 2}° Promoción`);
      assert.notEqual(relegation.badgeFill, playoff.badgeFill);
      assert.equal(getStandingClassificationStyle(count - 4, classifications), undefined);
      assert.equal(getStandingClassificationStyle(1, classifications).kind, "champion");
      assert.deepEqual(rows, before);
    }
  }
});

test("otras categorías conservan su clasificación existente", () => {
  for (const category of ['Primera "C"', "Primera", "Sub 20", undefined]) {
    const classifications = getStandingsClassifications(category, standings(12));
    assert.deepEqual(
      classifications.map((item) => item.kind),
      ["champion", "promotion", "promotion-playoff"],
    );
    assert.equal(getStandingClassificationStyle(12, classifications), undefined);
  }
});

test("tablas cortas no repiten posiciones ni muestran leyendas de otra zona", () => {
  for (const count of [4, 5, 6, 7, 8]) {
    const classifications = getStandingsClassifications("Primera A", standings(count));
    const positions = classifications.flatMap((item) => item.positions);
    assert.equal(new Set(positions).size, positions.length);
    assert.deepEqual(classifications.at(-1).positions, [count - 1, count]);
    for (const item of classifications) {
      assert.equal(
        item.label.split(" ")[0],
        item.positions.map((position) => `${position}°`).join("/"),
      );
    }
  }
});
