import { NextRequest, NextResponse } from "next/server";

import { systemAuditActor } from "@/lib/audit";
import {
  buildReminderMessage,
  formatReminderPeriodLabel,
  getCurrentReminderPeriod,
  normalizeReminderMessageMonth,
} from "@/lib/reminders";
import { getDataService } from "@/services/data-service";
import type { PlayerTableRow } from "@/types/dashboard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const expected = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");

  if (!expected || authorization !== `Bearer ${expected}`) {
    return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  }

  const dataService = getDataService();
  const period = getCurrentReminderPeriod();
  const [dashboard, settingsData, premium] = await Promise.all([
    dataService.getDashboardData(period),
    dataService.getAppSettings(),
    dataService.getPremiumData(),
  ]);
  const scheduledFor = new Date().toISOString();
  const periodLabel = formatReminderPeriodLabel(period);
  const alreadyQueued = new Set(
    premium.reminders
      .filter((reminder) => reminder.period === period)
      .map((reminder) => reminder.playerId),
  );
  const targetPlayers = dashboard.players.filter(
    (player) =>
      player.status !== "paid" && hasDefinedFee(player) && !alreadyQueued.has(player.id),
  );

  for (const player of targetPlayers) {
    await dataService.createReminderJob({
      scheduledFor,
      period,
      playerId: player.id,
      playerName: player.name,
      phone: player.phone,
      paymentStatus: player.status,
      message: normalizeReminderMessageMonth(
        buildReminderMessage(settingsData.settings.whatsAppMessageTemplate, {
          clubName: settingsData.settings.clubName,
          currentMonth: periodLabel,
          feeAmount: player.fee,
          playerName: player.name,
        }),
        periodLabel,
      ),
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

function hasDefinedFee(player: Pick<PlayerTableRow, "feeAmount" | "feeSource">) {
  return player.feeSource !== "none" && player.feeAmount > 0;
}
