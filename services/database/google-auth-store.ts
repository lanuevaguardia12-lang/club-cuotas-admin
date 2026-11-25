import "server-only";
import { createHash } from "node:crypto";
import { directoryDatabase } from "@/services/database/directory-store";

export type GoogleAuthMode = "login" | "link";
export interface GoogleAccountStatus {
  linked: boolean;
  email: string | null;
  dismissed: boolean;
}
const hashState = (state: string) => createHash("sha256").update(state).digest("hex");

export class GoogleAuthStore {
  async status(userId: string): Promise<GoogleAccountStatus> {
    const sql = directoryDatabase();
    const [row] = await sql`
      select i.email, p.user_id is not null as dismissed
      from (select ${userId}::text as id) u
      left join club_auth.google_identities i on i.user_id = u.id
      left join club_auth.google_preferences p on p.user_id = u.id
    `;
    return {
      linked: Boolean(row.email),
      email: row.email ?? null,
      dismissed: row.dismissed,
    };
  }
  async dismiss(userId: string) {
    await directoryDatabase()`insert into club_auth.google_preferences(user_id) values (${userId}) on conflict(user_id) do nothing`;
  }
  async createFlow(state: string, mode: GoogleAuthMode, userId: string | null) {
    const sql = directoryDatabase();
    await sql`delete from club_auth.google_flows where expires_at < now()`;
    await sql`insert into club_auth.google_flows(state_hash, mode, user_id) values (${hashState(state)}, ${mode}, ${userId})`;
  }
  async consumeFlow(state: string) {
    const [flow] =
      await directoryDatabase()`delete from club_auth.google_flows where state_hash = ${hashState(state)} and expires_at > now() returning mode, user_id`;
    return flow as { mode: GoogleAuthMode; user_id: string | null } | undefined;
  }
  async userIdForSubject(subject: string): Promise<string | null> {
    const [row] =
      await directoryDatabase()`select user_id from club_auth.google_identities where google_sub = ${subject}`;
    return row?.user_id ?? null;
  }
  async link(userId: string, subject: string, email: string) {
    await directoryDatabase().begin(async (tx) => {
      await tx`select pg_advisory_xact_lock(827415096)`;
      const identities =
        await tx`select user_id, google_sub from club_auth.google_identities where user_id = ${userId} or google_sub = ${subject}`;
      if (identities.some((i) => i.user_id !== userId || i.google_sub !== subject))
        throw new Error("GOOGLE_ALREADY_LINKED");
      await tx`insert into club_auth.google_identities(user_id, google_sub, email) values (${userId}, ${subject}, ${email}) on conflict(user_id) do update set email=excluded.email`;
    });
  }
}
