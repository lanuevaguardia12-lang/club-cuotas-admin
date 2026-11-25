import test from "node:test";
import assert from "node:assert/strict";
import { createRuntime, createSheetsMock } from "./runtime.mjs";
import { connectDatabase } from "../scripts/db/connection.mjs";

test("migrated directories use Supabase for CRUD, linked profiles and auth; Sheets stays untouched", async () => {
  const records = { players: [], teams: [], accounts: [] };
  class Store {
    async list(kind) {
      return structuredClone(records[kind]);
    }
    async mutate(kind, build) {
      const record = build(structuredClone(records[kind]));
      const id = record.id ?? record.userId;
      const at = records[kind].findIndex((r) => (r.id ?? r.userId) === id);
      if (at < 0) records[kind].push(record);
      else records[kind][at] = record;
    }
    async saveAccount(profile, createOnly) {
      if (createOnly && records.accounts.some((a) => a.username === profile.username))
        throw new Error("duplicate");
      await this.mutate("accounts", () => profile);
    }
    async replacePlayers(players) {
      records.players = structuredClone(players);
    }
    async deletePlayer(id) {
      records.players = records.players.filter((p) => p.id !== id);
    }
  }
  const sheets = createSheetsMock();
  const runtime = createRuntime({
    mocks: {
      googleapis: sheets.googleapis,
      "@/services/database/directory-store": {
        directoryDatabaseEnabled: () => true,
        DirectoryStore: Store,
      },
    },
  });
  const { GoogleSheetsService } = runtime.load("services/GoogleSheetsService.ts");
  const service = new GoogleSheetsService({
    spreadsheetId: "app",
    clientEmail: "test@example.com",
    privateKey: "test",
  });
  await service.upsertPlayer({
    name: "Ana Pérez",
    id: "ana",
    dni: "00123",
    status: "active",
  });
  await service.upsertPlayer({
    name: "Ana Pérez",
    id: "ana",
    position: "Defensora",
    status: "inactive",
  });
  let result = await service.getPlayersData();
  assert.equal(result.source.provider, "postgresql");
  assert.equal(result.players.length, 1);
  assert.equal(result.players[0].dni, "00123");
  assert.equal(result.players[0].status, "inactive");
  assert.equal(result.players[0].position, "Defensora");
  await service.upsertTeamProfile({ name: "Equipo A", shortName: "EA" });
  const teams = await service.getTeamsData();
  assert.equal(teams.source.provider, "postgresql");
  assert.equal(teams.teams[0].shortName, "EA");
  await service.createAccountUser({
    userId: "user-ana",
    username: "ana",
    role: "player",
    playerId: "ana",
    name: "Ana",
    passwordHash: "historic-hash",
  });
  assert.equal(
    (await service.getAccountAuthByUsername(" ANA ")).passwordHash,
    "historic-hash",
  );
  assert.equal((await service.getAccountAuthOverride("user-ana", "ana")).playerId, "ana");
  assert.equal((await service.getAccountUsers())[0].source, "database");
  assert.equal("passwordHash" in (await service.getAccountUsers())[0], false);
  await service.updateAccountPassword({
    userId: "user-ana",
    username: "ana",
    name: "Ana",
    role: "player",
    passwordHash: "new-hash",
  });
  assert.equal((await service.getAccountAuthByUsername("ana")).playerId, "ana");
  assert.equal((await service.getAccountAuthByUsername("ana")).passwordHash, "new-hash");
  await assert.rejects(
    service.createAccountUser({
      userId: "other",
      username: "ana",
      name: "Otra",
      role: "admin",
      passwordHash: "bad",
    }),
  );
  await service.deletePlayer("ana");
  assert.equal((await service.getPlayersData()).players.length, 0);
  assert.equal((await service.getAccountAuthByUsername("ana")).role, "player");
  await service.replacePlayers([{ name: "Bea" }, { name: "Bea" }]);
  result = await service.getPlayersData();
  assert.equal(new Set(result.players.map((p) => p.id)).size, 2);
  assert.equal(sheets.calls.reads, 0);
  assert.equal(sheets.calls.writes, 0);
});

test(
  "directory tables reject duplicate usernames and invalid roles; anonymous users have no access",
  { skip: process.env.RUN_DATABASE_TESTS !== "1" },
  async () => {
    const sql = connectDatabase({ migration: true });
    const stop = new Error("rollback");
    try {
      for (const role of ["anon", "authenticated"]) {
        const [p] =
          await sql`select has_schema_privilege(${role}, 'club_directory', 'USAGE') as access`;
        assert.equal(p.access, false);
      }
      const tables =
        await sql`select relname, relrowsecurity from pg_class join pg_namespace n on n.oid=relnamespace where nspname='club_directory' and relkind='r'`;
      assert.equal(tables.length, 4);
      assert.ok(tables.every((t) => t.relrowsecurity));
      await assert.rejects(
        sql.begin(async (tx) => {
          const data = {
            userId: "integration-test-account",
            username: "integration-test-account",
            role: "fan",
            passwordHash: "opaque",
          };
          await tx`insert into club_directory.accounts(data) values (${tx.json(data)})`;
          assert.deepEqual(
            (
              await tx`select data from club_directory.accounts where id=${data.userId}`
            )[0].data,
            data,
          );
          await assert.rejects(
            tx.savepoint(async (sp) => {
              await sp`insert into club_directory.accounts(data) values (${sp.json({ ...data, userId: "another", username: data.username.toUpperCase() })})`;
            }),
            (e) => e.code === "23505",
          );
          await assert.rejects(
            tx.savepoint(async (sp) => {
              await sp`insert into club_directory.accounts(data) values (${sp.json({ ...data, userId: "invalid", username: "invalid", role: "owner" })})`;
            }),
            (e) => e.code === "23514",
          );
          throw stop;
        }),
        (e) => e === stop,
      );
      assert.equal(
        (
          await sql`select id from club_directory.accounts where id='integration-test-account'`
        ).length,
        0,
      );
    } finally {
      await sql.end({ timeout: 5 });
    }
  },
);

test("database authentication preserves environment accounts and rejects stale-password fallback on outages", async () => {
  const before = {
    AUTH_USERS_JSON: process.env.AUTH_USERS_JSON,
    ADMIN_USERNAME: process.env.ADMIN_USERNAME,
    ADMIN_PASSWORD: process.env.ADMIN_PASSWORD,
  };
  process.env.AUTH_USERS_JSON = JSON.stringify([
    {
      id: "admin",
      username: "admin",
      password: "env-pass",
      role: "admin",
      name: "Admin",
    },
  ]);
  try {
    let failure = false;
    const runtime = createRuntime({
      mocks: {
        "@/services/database/directory-store": { directoryDatabaseEnabled: () => true },
        "@/services/data-service": {
          getDataService: () => ({
            async getAccountAuthOverride() {
              if (failure) throw new Error("database unavailable");
              return null;
            },
            async getAccountAuthByUsername() {
              return {
                userId: "player",
                username: "player",
                name: "Player",
                role: "player",
                playerId: "ana",
                passwordHash: hash,
              };
            },
          }),
        },
      },
    });
    const { hashPassword } = runtime.load("lib/auth/passwords.ts");
    const hash = hashPassword("test-pass");
    const { EnvAdminUserStore } = runtime.load("services/auth/env-admin-user-store.ts");
    const auth = new EnvAdminUserStore();
    assert.equal(
      (await auth.findByCredentials({ username: "admin", password: "env-pass" })).role,
      "admin",
    );
    const player = await auth.findByCredentials({
      username: "player",
      password: "test-pass",
    });
    assert.equal(player.role, "player");
    assert.equal(player.playerId, "ana");
    assert.equal(
      await auth.findByCredentials({ username: "player", password: "wrong" }),
      null,
    );
    const { hasPermission } = runtime.load("lib/auth/roles.ts");
    assert.equal(hasPermission(player, "users:manage"), false);
    assert.equal(hasPermission(player, "player:self:read"), true);
    failure = true;
    await assert.rejects(
      auth.findByCredentials({ username: "admin", password: "env-pass" }),
    );
    process.env.AUTH_USERS_JSON = "[]";
    delete process.env.ADMIN_USERNAME;
    delete process.env.ADMIN_PASSWORD;
    failure = false;
    assert.equal(
      (await auth.findByCredentials({ username: "player", password: "test-pass" })).role,
      "player",
    );
  } finally {
    for (const [key, value] of Object.entries(before)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
