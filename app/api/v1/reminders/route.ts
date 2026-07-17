import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { userToAuditActor } from "@/lib/audit";
import { requireApiPermission } from "@/lib/api/auth";
import { buildReminderMessage, getCurrentMonthLabel } from "@/lib/reminders";
import { getDataService } from "@/services/data-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const reminderSchema = z.object({
  playerId: z.string().trim().min(1),
  playerName: z.string().trim().min(1),
  phone: z.string().trim().min(1),
  period: z.string().regex(/^\d{4}-\d{2}$/),
  paymentStatus: z.enum(["paid", "debt", "pending"]).default("pending"),
  scheduledFor: z.string().datetime().optional(),
  message: z.string().trim().optional(),
});

export async function POST(request: NextRequest) {
  const auth = await requireApiPermission(request, "notifications:manage");

  if (auth.response) {
    return auth.response;
  }

  const parsed = reminderSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json({ message: "Payload invalido." }, { status: 400 });
  }

  const dataService = getDataService();
  const settingsData = await dataService.getAppSettings();
  const message =
    parsed.data.message ??
    buildReminderMessage(settingsData.settings.whatsAppMessageTemplate, {
      clubName: settingsData.settings.clubName,
      currentMonth: getCurrentMonthLabel(),
      playerName: parsed.data.playerName,
    });

  await dataService.createReminderJob({
    scheduledFor: parsed.data.scheduledFor ?? new Date().toISOString(),
    period: parsed.data.period,
    playerId: parsed.data.playerId,
    playerName: parsed.data.playerName,
    phone: parsed.data.phone,
    paymentStatus: parsed.data.paymentStatus,
    message,
  });
  await dataService.recordAuditEvent({
    actor: userToAuditActor(auth.user),
    action: "reminder.queued",
    entityType: "reminder",
    entityId: parsed.data.playerId,
    summary: `Recordatorio manual creado para ${parsed.data.playerName}.`,
    metadata: {
      period: parsed.data.period,
      paymentStatus: parsed.data.paymentStatus,
    },
  });

  return NextResponse.json({ queued: true }, { status: 201 });
}
