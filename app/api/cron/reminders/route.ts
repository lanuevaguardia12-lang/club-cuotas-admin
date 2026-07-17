import { NextRequest, NextResponse } from "next/server";

import { systemAuditActor } from "@/lib/audit";
import { buildReminderMessage, getCurrentMonthLabel } from "@/lib/reminders";
import { getDataService } from "@/services/data-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const expected = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");

  if (!expected || authorization !== `Bearer ${expected}`) {
    return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  }

  const dataService = getDataService();
  const [dashboard, settingsData, premium] = await Promise.all([
    dataService.getDashboardData(),
    dataService.getAppSettings(),
    dataService.getPremiumData(),
  ]);
  const period = new Date().toISOString().slice(0, 7);
  const scheduledFor = new Date().toISOString();
  const alreadyQueued = new Set(
    premium.reminders
      .filter((reminder) => reminder.period === period)
      .map((reminder) => reminder.playerId),
  );
  const targetPlayers = dashboard.players.filter(
    (player) => player.status !== "paid" && !alreadyQueued.has(player.id),
  );

  for (const player of targetPlayers) {
    await dataService.createReminderJob({
      scheduledFor,
      period,
      playerId: player.id,
      playerName: player.name,
      phone: player.phone,
      paymentStatus: player.status,
      message: buildReminderMessage(settingsData.settings.whatsAppMessageTemplate, {
        clubName: settingsData.settings.clubName,
        currentMonth: getCurrentMonthLabel(),
        feeAmount: player.fee,
        playerName: player.name,
      }),
    });
  }

  if (targetPlayers.length > 0) {
    await dataService.createNotification({
      title: "Recordatorios automaticos preparados",
      message: `${targetPlayers.length} recordatorios quedaron en cola para ${period}.`,
      type: "info",
      targetRole: "all",
    });
  }

  await dataService.recordAuditEvent({
    actor: systemAuditActor,
    action: "reminder.queued",
    entityType: "reminder",
    entityId: period,
    summary: `Cron preparo ${targetPlayers.length} recordatorios para ${period}.`,
    metadata: {
      period,
      queued: targetPlayers.length,
    },
  });

  return NextResponse.json({
    queued: targetPlayers.length,
    skipped: alreadyQueued.size,
    period,
  });
}
