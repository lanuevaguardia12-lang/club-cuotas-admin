import "server-only";
import type postgres from "postgres";
import { directoryDatabase } from "@/services/database/directory-store";
import { financialTransactionContext } from "@/services/database/transaction-context";
import type { PaymentReceiptRecord } from "@/types/player-payment";
export class PaymentReceiptsStore {
  private sql(): postgres.Sql {
    return (financialTransactionContext.getStore() ??
      directoryDatabase()) as unknown as postgres.Sql;
  }
  async find(id: string): Promise<PaymentReceiptRecord | null> {
    const sql = this.sql();
    const [row] =
      await sql`select data from club_finance.payment_receipts where id=${id}`;
    return row?.data ?? null;
  }
  async forPlayer(playerId: string): Promise<PaymentReceiptRecord[]> {
    const sql = this.sql();
    return (
      await sql`select data from club_finance.payment_receipts where player_id=${playerId} order by created_at desc limit 20`
    ).map((r) => r.data);
  }
  async recent(): Promise<PaymentReceiptRecord[]> {
    const sql = this.sql();
    return (
      await sql`select data from club_finance.payment_receipts order by created_at desc limit 50`
    ).map((r) => r.data);
  }
  async insert(record: PaymentReceiptRecord) {
    if (!financialTransactionContext.getStore())
      throw new Error("El registro de pago requiere una transacción.");
    const sql = this.sql();
    await sql`insert into club_finance.payment_receipts(data) values (${sql.json(record as never)})`;
    await sql`insert into club_finance.payment_receipt_items ${sql(
      record.quotas.map((q) => ({
        receipt_id: record.id,
        period: q.period,
        amount_cents: q.amountCents,
      })),
      "receipt_id",
      "period",
      "amount_cents",
    )}`;
  }
}
