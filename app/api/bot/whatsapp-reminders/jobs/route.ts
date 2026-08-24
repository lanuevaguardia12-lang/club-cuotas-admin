import { NextRequest, NextResponse } from "next/server";

import { apiAuditActor } from "@/lib/audit";
import { isWhatsAppBotReminder } from "@/lib/whatsapp-bot";
import { getDataService } from "@/services/data-service";
import type { ReminderJob, ReminderStatus } from "@/types/premium";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_LIMIT = 25;

export async function GET(request: NextRequest) {
  const auth = requireBotAuth(request);

  if (auth) {
    return auth;
  }

  const { searchParams } = new URL(request.url);
  const includeAllRuns = searchParams.get("all") === "1";
  const period = searchParams.get("period");
  const limit = clampLimit(searchParams.get("limit"));
  const queuedReminders = (await getDataService().getReminderJobs())
    .filter((reminder) => reminder.status === "queued")
    .filter(isWhatsAppBotReminder)
    .filter((reminder) => !period || reminder.period === period);
  const targetReminders = includeAllRuns
    ? queuedReminders
    : period
      ? queuedReminders
      : filterLatestReminderPeriod(queuedReminders);
  const jobs = targetReminders
    .sort(
      (left, right) =>
        new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime(),
    )
    .slice(0, limit)
    .map((reminder) => ({
      id: reminder.id,
      message: reminder.message,
      paymentStatus: reminder.paymentStatus,
      period: reminder.period,
      phone: reminder.phone,
      playerId: reminder.playerId,
      playerName: reminder.playerName,
      scheduledFor: reminder.scheduledFor,
    }));

  return NextResponse.json({
    jobs,
    latestOnly: !includeAllRuns,
    limit,
    total: jobs.length,
    totalQueued: queuedReminders.length,
  });
}

export async function PATCH(request: NextRequest) {
  const auth = requireBotAuth(request);

  if (auth) {
    return auth;
  }

  const body = (await request.json().catch(() => ({}))) as {
    error?: unknown;
    reminderId?: unknown;
    status?: unknown;
  };
  const reminderId = typeof body.reminderId === "string" ? body.reminderId.trim() : "";
  const status = normalizeWritableStatus(body.status);

  if (!reminderId || !status) {
    return NextResponse.json({ message: "Payload invalido." }, { status: 400 });
  }

  await getDataService().updateReminderJobStatus({
    reminderId,
    status,
    sentAt: status === "sent" ? new Date().toISOString() : undefined,
    error:
      status === "sent"
        ? ""
        : typeof body.error === "string"
          ? body.error.slice(0, 500)
          : undefined,
  });
  await getDataService()
    .recordAuditEvent({
      actor: apiAuditActor,
      action: status === "sent" ? "reminder.sent" : "system.error",
      entityType: "reminder",
      entityId: reminderId,
      summary:
        status === "sent"
          ? `Bot local marco enviado el recordatorio ${reminderId}.`
          : `Bot local marco ${status} el recordatorio ${reminderId}.`,
      metadata: {
        status,
      },
    })
    .catch(() => undefined);

  return NextResponse.json({ ok: true, reminderId, status });
}

function requireBotAuth(request: NextRequest) {
  const expected =
    process.env.WHATSAPP_BOT_RUNNER_SECRET?.trim() ||
    process.env.WHATSAPP_BOT_WEBHOOK_SECRET?.trim() ||
    process.env.API_SECRET?.trim();
  const authorization = request.headers.get("authorization");

  if (!expected || authorization !== `Bearer ${expected}`) {
    return NextResponse.json(
      {
        message:
          "No autorizado. Revisá que WHATSAPP_BOT_RUNNER_SECRET sea igual en Vercel y en bot/whatsapp/.env, y hacé redeploy en Vercel.",
        runnerSecretConfigured: Boolean(process.env.WHATSAPP_BOT_RUNNER_SECRET?.trim()),
      },
      { status: 401 },
    );
  }

  return null;
}

function filterLatestReminderPeriod(reminders: ReminderJob[]) {
  if (reminders.length === 0) {
    return [];
  }

  const latestPeriod = [...reminders].sort(
    (left, right) =>
      new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
  )[0]?.period;

  if (!latestPeriod) {
    return [];
  }

  return reminders.filter((reminder) => reminder.period === latestPeriod);
}

function clampLimit(value: string | null) {
  const parsed = Number(value ?? 5);

  if (!Number.isFinite(parsed) || parsed < 1) {
    return 5;
  }

  return Math.min(Math.floor(parsed), MAX_LIMIT);
}

function normalizeWritableStatus(value: unknown): ReminderStatus | null {
  if (value === "sent" || value === "failed" || value === "skipped") {
    return value;
  }

  return null;
}
