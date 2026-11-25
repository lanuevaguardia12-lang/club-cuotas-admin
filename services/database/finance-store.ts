import "server-only";
import type postgres from "postgres";
import { directoryDatabase } from "@/services/database/directory-store";

export type FinanceKind =
  | "costs"
  | "actuals"
  | "player_statuses"
  | "cash_flow"
  | "benefits"
  | "fees"
  | "payments"
  | "refund_policy";
import { financialTransactionContext as context } from "@/services/database/transaction-context";
export const financeDatabaseEnabled = () =>
  process.env.FINANCE_DATA_SOURCE === "postgresql";
export const inFinanceTransaction = () => Boolean(context.getStore());
export async function financeTransaction<T>(work: () => Promise<T>): Promise<T> {
  if (inFinanceTransaction()) return work();
  const result = await directoryDatabase().begin(async (tx) => {
    // Balance checks and all resulting events share a lock and one commit.
    await tx`select pg_advisory_xact_lock(827415094)`;
    return context.run(tx, work);
  });
  return result as T;
}
export class FinanceStore {
  private sql(): postgres.Sql {
    return (context.getStore() ?? directoryDatabase()) as unknown as postgres.Sql;
  }
  async list<T>(kind: FinanceKind): Promise<T[]> {
    const sql = this.sql();
    const rows =
      await sql`select data from ${sql(`club_finance.${kind}`)} order by sequence`;
    return rows.map((r) => r.data as T);
  }
  async save(kind: FinanceKind, data: object) {
    const sql = this.sql();
    if (!inFinanceTransaction())
      throw new Error("La escritura financiera requiere una transacción.");
    if (kind === "benefits") {
      await sql`insert into club_finance.benefits(data) values (${sql.json(data as never)})`;
    } else {
      await sql`insert into ${sql(`club_finance.${kind}`)} (data) values (${sql.json(data as never)}) on conflict (id) do update set data=excluded.data`;
    }
  }
  async replace(kind: "costs" | "actuals" | "refund_policy", records: object[]) {
    const sql = this.sql();
    if (!inFinanceTransaction())
      throw new Error("La escritura financiera requiere una transacción.");
    await sql`delete from ${sql(`club_finance.${kind}`)}`;
    for (const data of records) await this.save(kind, data);
  }
  async source(title: string): Promise<unknown[][]> {
    const sql = this.sql();
    const [row] =
      await sql`select rows from club_finance.historic_sources where title=${title}`;
    if (!row) throw new Error("Falta importar la fuente histórica de gastos.");
    return row.rows;
  }
}
