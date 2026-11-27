import "server-only";

import type { AnnualMvpNoticeInput } from "@/lib/annual-mvp";
import { getRolePermissions } from "@/lib/auth/roles";
import { sendAccountNotifications } from "@/lib/manual-notifications";
import { AnnualMvpStore } from "@/services/database/annual-mvp-store";
import type { IDataService } from "@/services/IDataService";
import type { AuditActor } from "@/types/premium";

export async function sendAnnualMvpNotifications(
  { year, title, message }: AnnualMvpNoticeInput,
  dataService: IDataService,
  actor: AuditActor,
) {
  const accounts = await dataService.getAccountUsers();
  const voters = new Map(
    accounts
      .filter((account) =>
        getRolePermissions(account.role).includes("player-of-match:vote"),
      )
      .map((account) => [account.userId, account]),
  );
  const store = new AnnualMvpStore();
  const result = await sendAccountNotifications(
    dataService,
    [...voters.values()].map((account) => ({
      title,
      message,
      referenceId: `annual-mvp:${year}:${account.userId}`,
      targetRole: account.role,
      targetUserId: account.userId,
      recipientUserId: account.userId,
      recipientPlayerId: account.playerId,
      recipientName: account.name || account.username,
      notificationKind: "annual-mvp",
      url: `/mvp-del-ano/${year}`,
    })),
    (create) => store.withNoticeLock(year, create),
  );
  if (result.created) {
    await dataService
      .recordAuditEvent({
        actor,
        action: "notification.created",
        entityType: "notification",
        entityId: `annual-mvp:${year}`,
        summary: `Aviso de MVP del año ${year} creado para ${result.created} usuarios.`,
        metadata: { recipients: result.created, year },
      })
      .catch(() => undefined);
  }
  return result;
}
