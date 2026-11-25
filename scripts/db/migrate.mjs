import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { connectDatabase, reportDatabaseError } from "./connection.mjs";

let sql;
try {
  sql = connectDatabase({ migration: true });
  const dir = new URL("../../db/migrations/", import.meta.url);
  const files = (await readdir(dir))
    .filter((name) => /^\d+_[a-z0-9_]+\.sql$/.test(name))
    .sort();
  const applied = await sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(827415091)`;
    await tx`create schema if not exists club_migrations`;
    await tx`revoke all on schema club_migrations from public, anon, authenticated`;
    await tx`create table if not exists club_migrations.versions (
      name text primary key, checksum text not null, applied_at timestamptz not null default now()
    )`;
    await tx`alter table club_migrations.versions enable row level security`;
    await tx`revoke all on club_migrations.versions from public, anon, authenticated`;
    const existing = new Map(
      (await tx`select name, checksum from club_migrations.versions`).map((row) => [
        row.name,
        row.checksum,
      ]),
    );
    const result = [];
    for (const name of files) {
      const source = await readFile(new URL(name, dir), "utf8");
      const checksum = createHash("sha256").update(source).digest("hex");
      if (existing.has(name)) {
        if (existing.get(name) !== checksum)
          throw Object.assign(new Error("Migration checksum mismatch"), {
            code: "MIGRATION_CHANGED",
          });
        continue;
      }
      await tx.unsafe(source);
      await tx`insert into club_migrations.versions (name, checksum) values (${name}, ${checksum})`;
      result.push(name);
    }
    return result;
  });
  console.log(
    applied.length
      ? `Migraciones aplicadas: ${applied.join(", ")}`
      : "Sin migraciones pendientes.",
  );
} catch (error) {
  reportDatabaseError(error);
} finally {
  if (sql) await sql.end({ timeout: 5 });
}
