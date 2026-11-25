import "server-only";
import type postgres from "postgres";
import { directoryDatabase } from "@/services/database/directory-store";
import { financialTransactionContext } from "@/services/database/transaction-context";
import type { AccountProfile } from "@/types/account";
import type { AttendanceMatch } from "@/types/match-attendance";
import type { FundraisingBenefitApplication } from "@/types/fundraising";

type RecordData = Record<string, unknown>;
interface PaymentQuoteSnapshot {
  players: RecordData[];
  accounts: Pick<AccountProfile, "userId" | "username" | "playerId">[];
  fees: {
    id: string;
    playerId: string;
    period: string;
    amount: number;
    status: "paid" | "pending" | "overdue";
    dueDate?: string;
    paidAt?: string;
  }[];
  costs: RecordData[];
  actuals: RecordData[];
  player_statuses: RecordData[];
  refund_policy: RecordData[];
  cash_flow: RecordData[];
  benefits: FundraisingBenefitApplication[];
  matches: AttendanceMatch[];
  expenses: unknown[][];
}

export class PaymentQuoteStore {
  async read(
    expenseTitle: string,
    userId: string,
    username: string,
  ): Promise<PaymentQuoteSnapshot> {
    const sql = (financialTransactionContext.getStore() ??
      directoryDatabase()) as unknown as postgres.Sql;
    // One statement gives the calculator fresh, consistent inputs with one
    // database round trip. Inside payment confirmation, use its locked transaction.
    const [row] = await sql<PaymentQuoteSnapshot[]>`
      select
        (select coalesce(jsonb_agg(data order by id), '[]') from club_directory.players) as players,
        (select coalesce(jsonb_agg(jsonb_build_object(
          'userId', id, 'username', username, 'playerId', player_id) order by id), '[]')
         from club_directory.accounts where id = ${userId} or lower(username) = lower(${username})) as accounts,
        (select coalesce(jsonb_agg(data order by sequence), '[]') from club_finance.fees) as fees,
        (select coalesce(jsonb_agg(data order by sequence), '[]') from club_finance.costs) as costs,
        (select coalesce(jsonb_agg(data order by sequence), '[]') from club_finance.actuals) as actuals,
        (select coalesce(jsonb_agg(data order by sequence), '[]') from club_finance.player_statuses) as player_statuses,
        (select coalesce(jsonb_agg(data order by sequence), '[]') from club_finance.refund_policy) as refund_policy,
        (select coalesce(jsonb_agg(data order by sequence), '[]') from club_finance.cash_flow) as cash_flow,
        (select coalesce(jsonb_agg(data order by sequence), '[]') from club_finance.benefits) as benefits,
        (select coalesce(jsonb_agg(
          m.data || jsonb_build_object('players',
            (select coalesce(jsonb_agg(a.player_name order by a.position), '[]')
             from club_matches.attendances a where a.match_id = m.id))
          order by m.data->>'date', m.sequence), '[]') from club_matches.matches m) as matches,
        (select rows from club_finance.historic_sources where title = ${expenseTitle}) as expenses
    `;
    if (!row?.expenses) throw new Error("Falta importar la fuente histórica de gastos.");
    return row;
  }
}
