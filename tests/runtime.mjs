import { AsyncLocalStorage } from "node:async_hooks";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import vm from "node:vm";
import ts from "typescript";

const root = fileURLToPath(new URL("../", import.meta.url));
const nativeRequire = createRequire(import.meta.url);
const clone = (value) => JSON.parse(JSON.stringify(value));

export function createRuntime({
  mocks = {},
  fetchImpl,
  now = "2026-10-19T14:00:00Z",
} = {}) {
  const entries = new Map();
  const modules = new Map();
  const cacheScope = new AsyncLocalStorage();
  const expired = [];
  const clock = { now: Date.parse(now) };
  class TestDate extends Date {
    constructor(...args) {
      super(...(args.length ? args : [clock.now]));
    }
    static now() {
      return clock.now;
    }
  }
  const nextCache = {
    unstable_cache(fn, keys = [], options = {}) {
      return async (...args) => {
        // Match Next's behavior: nested unstable_cache callbacks bypass reads.
        if (cacheScope.getStore()) return fn(...args);
        const key = JSON.stringify([fn.toString(), keys, args]);
        const saved = entries.get(key);
        if (
          saved &&
          (options.revalidate === false ||
            clock.now - saved.at < (options.revalidate ?? Infinity) * 1000)
        ) {
          return clone(await saved.value);
        }
        const entry = { at: clock.now, tags: options.tags ?? [], value: null };
        entry.value = cacheScope.run(true, () =>
          Promise.resolve().then(() => fn(...args)),
        );
        entries.set(key, entry);
        try {
          return clone(await entry.value);
        } catch (error) {
          entries.delete(key);
          throw error;
        }
      };
    },
    unstable_expireTag(...tags) {
      expired.push(...tags);
      for (const [key, entry] of entries) {
        if (entry.tags.some((tag) => tags.includes(tag))) entries.delete(key);
      }
    },
    revalidatePath() {},
  };
  function load(relative) {
    const file = resolve(root, relative);
    if (modules.has(file)) return modules.get(file).exports;
    const loadedModule = { exports: {} };
    modules.set(file, loadedModule);
    const code = ts.transpileModule(readFileSync(file, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    }).outputText;
    const localRequire = (name) => {
      if (name in mocks) return mocks[name];
      if (name === "server-only") return {};
      if (name === "next/cache") return nextCache;
      if (name.startsWith("@/")) return load(`${name.slice(2)}.ts`);
      return nativeRequire(name);
    };
    const execute = vm.runInThisContext(
      `(function(require,module,exports,Date,fetch){${code}\n})`,
      { filename: file },
    );
    execute(
      localRequire,
      loadedModule,
      loadedModule.exports,
      TestDate,
      fetchImpl ??
        (() => {
          throw new Error("Unexpected network request");
        }),
    );
    return loadedModule.exports;
  }
  return { load, entries, expired, clock, nextCache };
}

export function createSheetsMock(initialRows = {}) {
  const rows = clone(initialRows);
  const calls = { reads: 0, writes: 0, clients: 0, active: 0, maxActive: 0 };
  let readError;
  const nameOf = (range) => range.split("!")[0].replace(/^'|'$/g, "");
  function apply(range, values) {
    const name = nameOf(range);
    const coordinates = /!([A-Z]+)(\d+)/.exec(range);
    const column = coordinates
      ? [...coordinates[1]].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1
      : 0;
    const row = coordinates ? Number(coordinates[2]) - 1 : 0;
    const table = (rows[name] ??= []);
    values.forEach((cells, i) =>
      cells.forEach((value, j) => {
        (table[row + i] ??= [])[column + j] = value;
      }),
    );
  }
  const values = {
    async get({ range }) {
      calls.reads++;
      calls.active++;
      calls.maxActive = Math.max(calls.maxActive, calls.active);
      await new Promise((r) => setTimeout(r, 1));
      calls.active--;
      if (readError) throw readError;
      return { data: { values: clone(rows[nameOf(range)] ?? []) } };
    },
    async update({ range, requestBody }) {
      calls.writes++;
      apply(range, requestBody.values);
      return { data: {} };
    },
    async append({ range, requestBody }) {
      calls.writes++;
      (rows[nameOf(range)] ??= []).push(...clone(requestBody.values));
      return { data: {} };
    },
    async batchUpdate({ requestBody }) {
      calls.writes++;
      requestBody.data.forEach(({ range, values }) => apply(range, values));
      return { data: {} };
    },
  };
  const client = {
    spreadsheets: {
      values,
      async get() {
        return {
          data: { sheets: Object.keys(rows).map((title) => ({ properties: { title } })) },
        };
      },
      async batchUpdate() {
        calls.writes++;
        return { data: {} };
      },
    },
  };
  return {
    rows,
    calls,
    failReads(error) {
      readError = error;
    },
    googleapis: {
      google: {
        auth: { JWT: class {} },
        sheets() {
          calls.clients++;
          return client;
        },
      },
    },
  };
}
