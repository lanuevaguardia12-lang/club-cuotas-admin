import "server-only";
import { directoryDatabase } from "@/services/database/directory-store";
import { getConfiguredAuthUsers } from "@/services/auth/env-admin-user-store";
import type { AuthUser } from "@/types/auth";

// Resolve current permissions from the existing accounts. Never infer identity
// from an email/name, or persist a role supplied by Google or an old OAuth flow.
export async function resolveGoogleUser(userId: string): Promise<AuthUser | null> {
  const configured = getConfiguredAuthUsers().find((user) => user.id === userId);
  const [row] = await directoryDatabase()`
    select id, username, role, player_id, data->>'name' as name
    from club_directory.accounts where id = ${userId}
  `;
  if (configured) return { ...configured, name: row?.name || configured.name };
  if (!row || !["admin", "treasurer", "coach", "player", "fan"].includes(row.role))
    return null;
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    name: row.name || row.username,
    playerId: row.player_id || undefined,
  };
}
