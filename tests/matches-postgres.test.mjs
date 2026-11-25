import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { connectDatabase } from "../scripts/db/connection.mjs";
import { createRuntime } from "./runtime.mjs";

test(
  "PostgreSQL matches keep attendance atomic, reject duplicates and protect historic snapshots",
  { skip: process.env.RUN_DATABASE_TESTS !== "1" },
  async () => {
    const sql = connectDatabase({ migration: true });
    const id = `integration-${randomUUID()}`;
    const stop = new Error("rollback");
    try {
      for (const role of ["anon", "authenticated"])
        assert.equal(
          (
            await sql`select has_schema_privilege(${role},'club_matches','USAGE') as access`
          )[0].access,
          false,
        );
      const tables =
        await sql`select relname,relrowsecurity from pg_class join pg_namespace n on n.oid=relnamespace where nspname='club_matches' and relkind='r'`;
      assert.equal(tables.length, 5);
      assert.ok(tables.every((t) => t.relrowsecurity));
      await assert.rejects(
        sql.begin(async (tx) => {
          const scoped = new Proxy(tx, {
            get(target, key) {
              if (key === "begin") return (work) => tx.savepoint(work);
              return target[key];
            },
          });
          const runtime = createRuntime({
            mocks: {
              "@/services/database/directory-store": { directoryDatabase: () => scoped },
            },
          });
          const { MatchesStore } = runtime.load("services/database/matches-store.ts");
          const store = new MatchesStore();
          const original = {
            id,
            fixtureId: `${id}-fixture`,
            date: "2100-10-03",
            period: "2100-10",
            rival: id,
            sourceType: "league",
            venue: "Local",
            coachAttended: true,
            loadedAt: "2100-10-03T18:00",
            players: ["Test player", "Historic player"],
          };
          await store.save(original, [
            { playerName: "Test player", playerId: "test-player" },
            { playerName: "Historic player" },
          ]);
          assert.deepEqual(
            (await store.list()).find((m) => m.id === id),
            original,
          );
          await assert.rejects(
            store.save({ ...original, coachAttended: false, players: [""] }, [
              { playerName: "" },
            ]),
            (e) => e.code === "23514",
          );
          assert.deepEqual(
            (await store.list()).find((m) => m.id === id),
            original,
          );
          await assert.rejects(
            store.save({ ...original, id: `${id}-duplicate` }, [
              { playerName: "Test player" },
            ]),
            (e) => e.code === "23505",
          );
          assert.equal((await store.list()).filter((m) => m.id.startsWith(id)).length, 1);
          await store.save(
            { ...original, coachAttended: false, players: ["Test player"] },
            [{ playerName: "Test player", playerId: "test-player" }],
          );
          const saved = (await store.list()).find((m) => m.id === id);
          assert.equal(saved.coachAttended, false);
          assert.deepEqual(saved.players, ["Test player"]);
          await store.saveSnapshot({
            id,
            playerId: id,
            seasonYear: 2100,
            totalMatches: 1,
          });
          await store.saveSnapshot({
            id,
            playerId: id,
            seasonYear: 2100,
            totalMatches: 2,
          });
          assert.equal(
            (await tx`select data from club_matches.snapshots where id=${id}`)[0].data
              .totalMatches,
            2,
          );
          throw stop;
        }),
        (e) => e === stop,
      );
      assert.equal(
        (await sql`select id from club_matches.matches where id=${id}`).length,
        0,
      );
      assert.equal(
        (await sql`select match_id from club_matches.attendances where match_id=${id}`)
          .length,
        0,
      );
    } finally {
      await sql.end({ timeout: 5 });
    }
  },
);
