import "server-only";
import type postgres from "postgres";
import { directoryDatabase } from "@/services/database/directory-store";
import { financialTransactionContext } from "@/services/database/transaction-context";
import type { AttendanceMatch } from "@/types/match-attendance";
export const matchesDatabaseEnabled = () =>
  process.env.MATCHES_DATA_SOURCE === "postgresql";
export class MatchesStore {
  private sql(): postgres.Sql {
    return (financialTransactionContext.getStore() ??
      directoryDatabase()) as unknown as postgres.Sql;
  }
  async list(): Promise<AttendanceMatch[]> {
    const sql = this.sql();
    const rows =
      await sql`select m.data, coalesce(jsonb_agg(a.player_name order by a.position) filter(where a.match_id is not null),'[]'::jsonb) as players from club_matches.matches m left join club_matches.attendances a on a.match_id=m.id group by m.id,m.data,m.sequence order by m.data->>'date', m.sequence`;
    return rows.map((row) => ({ ...row.data, players: row.players }) as AttendanceMatch);
  }
  async save(
    match: AttendanceMatch,
    participants: { playerName: string; playerId?: string }[],
  ) {
    await directoryDatabase().begin(async (tx) => {
      // Attendance changes affect refunds. Share the financial lock so benefit
      // calculations cannot observe a match without its complete attendance.
      await tx`select pg_advisory_xact_lock(827415094)`;
      await tx`select pg_advisory_xact_lock(827415095)`;
      const { players: _players, ...data } = match;
      void _players;
      await tx`insert into club_matches.matches(data) values (${tx.json(data as never)}) on conflict(id) do update set data=excluded.data`;
      await tx`delete from club_matches.attendances where match_id=${match.id}`;
      if (participants.length) {
        const rows = participants.map((p, position) => ({
          match_id: match.id,
          position,
          player_name: p.playerName,
          player_id: p.playerId ?? null,
        }));
        await tx`insert into club_matches.attendances ${tx(rows, "match_id", "position", "player_name", "player_id")}`;
      }
    });
  }
  async saveSnapshot(snapshot: object) {
    const sql = this.sql();
    await sql`insert into club_matches.snapshots(data) values (${sql.json(snapshot as never)}) on conflict(id) do update set data=excluded.data`;
  }
}
