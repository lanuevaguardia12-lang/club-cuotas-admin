import { NextRequest, NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { getWhatsAppBotReminderRunId, isWhatsAppBotReminder } from "@/lib/whatsapp-bot";
import { getDataService } from "@/services/data-service";
import type { ReminderJob, ReminderStatus } from "@/types/premium";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  }

  if (user.role !== "admin") {
    return NextResponse.json(
      { message: "Solo un administrador puede ver esta corrida." },
      { status: 403 },
    );
  }

  const runId = new URL(request.url).searchParams.get("runId")?.trim();

  if (!runId) {
    return NextResponse.json({ message: "Falta runId." }, { status: 400 });
  }

  const reminders = (await getDataService().getReminderJobs())
    .filter(isWhatsAppBotReminder)
    .filter((reminder) => getWhatsAppBotReminderRunId(reminder) === runId)
    .sort(
      (left, right) =>
        new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime(),
    );

  return NextResponse.json({
    jobs: reminders.map(toStatusJob),
    ok: true,
    runId,
    summary: buildSummary(reminders),
  });
}

function toStatusJob(reminder: ReminderJob) {
  return {
    error: getDisplayError(reminder.error),
    id: reminder.id,
    paymentStatus: reminder.paymentStatus,
    period: reminder.period,
    playerId: reminder.playerId,
    playerName: reminder.playerName,
    sentAt: reminder.sentAt,
    status: reminder.status,
  };
}

function getDisplayError(error?: string) {
  return error?.replace(/channel:whatsapp-bot(?:;run:[^;]+)?;?\s*/g, "").trim();
}

function buildSummary(reminders: ReminderJob[]) {
  const summary: Record<ReminderStatus | "total", number> = {
    failed: 0,
    processing: 0,
    queued: 0,
    sent: 0,
    skipped: 0,
    total: reminders.length,
  };

  for (const reminder of reminders) {
    summary[reminder.status] += 1;
  }

  return summary;
}
