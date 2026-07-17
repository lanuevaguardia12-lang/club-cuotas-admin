import { NextResponse } from "next/server";

import { userToAuditActor } from "@/lib/audit";
import { SESSION_COOKIE_NAME } from "@/lib/auth/constants";
import { getCurrentUser } from "@/lib/auth/session";
import { getDataService } from "@/services/data-service";

export async function POST() {
  const user = await getCurrentUser();
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(SESSION_COOKIE_NAME);

  if (user) {
    await getDataService()
      .recordAuditEvent({
        actor: userToAuditActor(user),
        action: "auth.logout",
        entityType: "auth",
        entityId: user.id,
        summary: `${user.name} cerro sesion.`,
      })
      .catch(() => undefined);
  }

  return response;
}
