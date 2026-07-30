import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { userToAuditActor } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth/session";
import { getVapidPublicKey, isPushConfigured } from "@/lib/push";
import { getDataService } from "@/services/data-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const subscriptionSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    auth: z.string().min(1),
    p256dh: z.string().min(1),
  }),
});

const deleteSchema = z.object({
  endpoint: z.string().url(),
});

export async function GET() {
  return NextResponse.json({
    configured: isPushConfigured(),
    publicKey: getVapidPublicKey(),
  });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  }

  if (!isPushConfigured()) {
    return NextResponse.json(
      { message: "Push notifications no esta configurado." },
      { status: 503 },
    );
  }

  const parsed = subscriptionSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json({ message: "Payload invalido." }, { status: 400 });
  }

  const dataService = getDataService();

  await dataService.upsertPushSubscription({
    userId: user.id,
    playerId: user.playerId,
    endpoint: parsed.data.endpoint,
    keys: parsed.data.keys,
    userAgent: request.headers.get("user-agent") ?? undefined,
  });
  await dataService
    .recordAuditEvent({
      actor: userToAuditActor(user),
      action: "notification.created",
      entityType: "notification",
      entityId: user.id,
      summary: "Dispositivo suscripto a push notifications.",
      metadata: {
        playerId: user.playerId ?? null,
      },
    })
    .catch(() => undefined);

  return NextResponse.json({ ok: true }, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  }

  const parsed = deleteSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json({ message: "Payload invalido." }, { status: 400 });
  }

  await getDataService().deletePushSubscription(parsed.data.endpoint, user.id);

  return NextResponse.json({ ok: true });
}
