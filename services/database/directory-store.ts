import "server-only";
import postgres from "postgres";
import { financialTransactionContext } from "@/services/database/transaction-context";

export function directoryDatabaseEnabled() {
  return process.env.DIRECTORY_DATA_SOURCE === "postgresql";
}

type DirectoryRecord = { id?: string; userId?: string; [key: string]: unknown };
type Kind = "players" | "teams" | "accounts";
let database: ReturnType<typeof postgres> | undefined;
export function directoryDatabase() {
  if (!process.env.DATABASE_URL) throw new Error("Falta DATABASE_URL.");
  return (database ??= postgres(process.env.DATABASE_URL, {
    // One connection per worker also avoids oversubscribing Supabase's pooler.
    // Nested financial reads share the active transaction through the context.
    max: 1,
    max_pipeline: 1,
    scheduler: false,
    queue_timeout: 15,
    query_timeout: 30,
    prepare: false,
    ssl: "require",
    connect_timeout: 15,
    idle_timeout: 20,
    connection: { statement_timeout: 30000 },
    onnotice: () => {},
  }));
}

// Each entity has its own private table and indexed identity. JSON retains the
// canonical application fields without changing their historic date semantics.
export class DirectoryStore {
  async list(kind: Kind): Promise<DirectoryRecord[]> {
    const sql = (financialTransactionContext.getStore() ??
      directoryDatabase()) as unknown as ReturnType<typeof postgres>;
    const rows = await sql`select data from ${sql(`club_directory.${kind}`)} order by id`;
    return rows.map((r) => r.data as DirectoryRecord);
  }

  async mutate(kind: Kind, build: (records: DirectoryRecord[]) => object) {
    const sql = directoryDatabase();
    await sql.begin(async (tx) => {
      await tx`select pg_advisory_xact_lock(827415093)`;
      const rows = await tx`select data from ${tx(`club_directory.${kind}`)} order by id`;
      const data = build(rows.map((r) => r.data as DirectoryRecord));
      const record = data as DirectoryRecord;
      await tx`insert into ${tx(`club_directory.${kind}`)} (data) values (${tx.json(data as never)}) on conflict (id) do update set data=excluded.data`;
      if (!record.id && !record.userId) throw new Error("Identidad requerida.");
    });
  }

  async saveAccount(profile: object, createOnly = false) {
    if (createOnly) {
      const sql = directoryDatabase();
      await sql`insert into club_directory.accounts(data) values (${sql.json(profile as never)})`;
      return;
    }
    await this.mutate("accounts", () => profile);
  }

  async replacePlayers(players: object[]) {
    const sql = directoryDatabase();
    await sql.begin(async (tx) => {
      await tx`select pg_advisory_xact_lock(827415093)`;
      await tx`delete from club_directory.players`;
      for (const player of players)
        await tx`insert into club_directory.players(data) values (${tx.json(player as never)})`;
    });
  }

  async deletePlayer(id: string) {
    const sql = directoryDatabase();
    await sql.begin(async (tx) => {
      await tx`select pg_advisory_xact_lock(827415093)`;
      await tx`delete from club_directory.players where id=${id}`;
    });
  }
}
