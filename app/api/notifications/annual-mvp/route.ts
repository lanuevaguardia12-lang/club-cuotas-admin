import { type NextRequest, NextResponse } from "next/server";

import { annualMvpNoticeSchema } from "@/lib/annual-mvp";
import { sendAnnualMvpNotifications } from "@/lib/annual-mvp-notifications";
import { userToAuditActor } from "@/lib/audit";
import { hasPermission } from "@/lib/auth/roles";
import { getCurrentUser } from "@/lib/auth/session";
import { getDataService } from "@/services/data-service";
import { AnnualMvpError } from "@/services/database/annual-mvp-store";

export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) {
    return NextResponse.json({ message: "Origen no autorizado." }, { status: 403 });
  }
  const user = await getCurrentUser();
  if (!user)
    return NextResponse.json(
      { message: "Iniciá sesión para enviar el aviso." },
      { status: 401 },
    );
  if (!hasPermission(user, "notifications:manage")) {
    return NextResponse.json(
      { message: "Solo un administrador puede enviar el aviso." },
      { status: 403 },
    );
  }

  const input = annualMvpNoticeSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) {
    const issue = input.error.issues[0];
    return NextResponse.json(
      {
        message:
          issue.path[0] === "title" || issue.path[0] === "message"
            ? issue.message
            : "Elegí el año de la votación.",
      },
      { status: 400 },
    );
  }

  try {
    return NextResponse.json(
      await sendAnnualMvpNotifications(
        input.data,
        getDataService(),
        userToAuditActor(user),
      ),
    );
  } catch (error) {
    if (error instanceof AnnualMvpError)
      return NextResponse.json({ message: error.message }, { status: 409 });
    return NextResponse.json(
      { message: "No se pudo enviar el aviso. Intentá de nuevo." },
      { status: 500 },
    );
  }
}
