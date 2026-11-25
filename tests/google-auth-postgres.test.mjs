import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { connectDatabase } from "../scripts/db/connection.mjs";
import { createRuntime } from "./runtime.mjs";

test(
  "Google identities are unique and private, prompt preferences persist by account, and callbacks consume a flow only once",
  { skip: process.env.RUN_DATABASE_TESTS !== "1" },
  async () => {
    const sql = connectDatabase({ migration: true });
    const rollback = new Error("intentional-rollback");
    try {
      for (const role of ["anon", "authenticated"])
        for (const table of ["google_identities", "google_preferences", "google_flows"])
          assert.equal(
            (
              await sql`select has_table_privilege(${role},${`club_auth.${table}`},'SELECT') as access`
            )[0].access,
            false,
          );
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
          const { GoogleAuthStore } = runtime.load(
            "services/database/google-auth-store.ts",
          );
          const store = new GoogleAuthStore();
          const id = `google-test-${randomUUID()}`,
            other = `google-test-${randomUUID()}`,
            sub = randomUUID(),
            state = randomUUID();
          assert.deepEqual(await store.status(id), {
            linked: false,
            email: null,
            dismissed: false,
          });
          await store.dismiss(id);
          await store.dismiss(id);
          assert.equal((await new GoogleAuthStore().status(id)).dismissed, true);
          assert.equal((await store.status(other)).dismissed, false);
          await store.createFlow(state, "link", id);
          assert.equal(
            (
              await tx`select count(*)::int as n from club_auth.google_flows where state_hash=${state}`
            )[0].n,
            0,
          );
          assert.deepEqual(await store.consumeFlow(state), { mode: "link", user_id: id });
          assert.equal(await store.consumeFlow(state), undefined);
          await store.createFlow(state, "login", null);
          await tx`update club_auth.google_flows set expires_at=now()-interval '1 second' where state_hash=${createHash("sha256").update(state).digest("hex")}`;
          assert.equal(await store.consumeFlow(state), undefined);
          await store.link(id, sub, "google-test@example.com");
          await store.link(id, sub, "changed-google-test@example.com");
          assert.equal(await store.userIdForSubject(sub), id);
          assert.deepEqual(await store.status(id), {
            linked: true,
            email: "changed-google-test@example.com",
            dismissed: true,
          });
          await assert.rejects(
            store.link(other, sub, "google-test@example.com"),
            /GOOGLE_ALREADY_LINKED/,
          );
          await assert.rejects(
            store.link(id, randomUUID(), "google-test@example.com"),
            /GOOGLE_ALREADY_LINKED/,
          );
          assert.equal(
            (
              await tx`select count(*)::int as n from club_auth.google_identities where user_id in (${id},${other})`
            )[0].n,
            1,
          );
          throw rollback;
        }),
        (error) => error === rollback,
      );
    } finally {
      await sql.end({ timeout: 3 });
    }
  },
);
