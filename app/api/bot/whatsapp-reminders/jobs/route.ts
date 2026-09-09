import { NextRequest, NextResponse } from "next/server";

import { apiAuditActor } from "@/lib/audit";
import {
  buildWhatsAppBotReminderMarker,
  getWhatsAppBotReminderRunId,
  isWhatsAppBotReminder,
} from "@/lib/whatsapp-bot";
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
  const runId = searchParams.get("runId")?.trim();
  const limit = clampLimit(searchParams.get("limit"));
  const dataService = getDataService();
  const queuedReminders = (await dataService.getReminderJobs())
    .filter((reminder) => reminder.status === "queued")
    .filter(isWhatsAppBotReminder)
    .filter((reminder) => !runId || getWhatsAppBotReminderRunId(reminder) === runId)
    .filter((reminder) => !period || reminder.period === period);
  const targetReminders = includeAllRuns
    ? queuedReminders
    : runId || period
      ? queuedReminders
      : filterLatestReminderRun(queuedReminders);
  const { reminders: currentReminders, skipped: skippedStale } =
    await filterCurrentPendingReminders(dataService, targetReminders);
  const jobs = currentReminders
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
    skippedStale,
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

  const dataService = getDataService();
  const reminder = (await dataService.getReminderJobs()).find(
    (job) => job.id === reminderId,
  );

  if (!reminder) {
    return NextResponse.json(
      { message: "No se encontro el recordatorio a actualizar." },
      { status: 404 },
    );
  }

  if (status === "processing" && reminder.status !== "queued") {
    return NextResponse.json(
      {
        message: "El recordatorio ya no esta pendiente.",
        reminderId,
        status: reminder.status,
      },
      { status: 409 },
    );
  }

  await dataService.updateReminderJobStatus({
    error: buildReminderStatusError(reminder, status, body.error),
    reminderId,
    status,
    sentAt: status === "sent" ? new Date().toISOString() : undefined,
  });

  if (status !== "processing") {
    await dataService
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
  }

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

function filterLatestReminderRun(reminders: ReminderJob[]) {
  if (reminders.length === 0) {
    return [];
  }

  const latestReminder = [...reminders].sort(
    (left, right) =>
      new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
  )[0];
  const latestRunId = latestReminder ? getWhatsAppBotReminderRunId(latestReminder) : "";

  return latestRunId
    ? reminders.filter(
        (reminder) => getWhatsAppBotReminderRunId(reminder) === latestRunId,
      )
    : filterLatestReminderPeriod(reminders);
}

async function filterCurrentPendingReminders(
  dataService: ReturnType<typeof getDataService>,
  reminders: ReminderJob[],
) {
  const remindersByPeriod = new Map<string, ReminderJob[]>();

  for (const reminder of reminders) {
    const periodReminders = remindersByPeriod.get(reminder.period) ?? [];
    periodReminders.push(reminder);
    remindersByPeriod.set(reminder.period, periodReminders);
  }

  const currentReminders: ReminderJob[] = [];
  let skipped = 0;

  for (const [period, periodReminders] of remindersByPeriod.entries()) {
    const dashboard = await dataService.getDashboardData(period).catch(() => null);

    if (!dashboard) {
      currentReminders.push(...periodReminders);
      continue;
    }

    const playersById = new Map(dashboard.players.map((player) => [player.id, player]));
    const staleReminders: ReminderJob[] = [];

    for (const reminder of periodReminders) {
      const player = playersById.get(reminder.playerId);

      if (
        player &&
        player.status !== "paid" &&
        player.feeSource !== "none" &&
        player.feeAmount > 0
      ) {
        currentReminders.push(reminder);
      } else {
        staleReminders.push(reminder);
      }
    }

    if (staleReminders.length === 0) {
      continue;
    }

    const results = await Promise.allSettled(
      staleReminders.map((reminder) =>
        dataService.updateReminderJobStatus({
          error: buildReminderStatusError(
            reminder,
            "skipped",
            "Omitido porque el jugador ya no figura pendiente en el dashboard.",
          ),
          reminderId: reminder.id,
          status: "skipped",
        }),
      ),
    );

    skipped += results.filter((result) => result.status === "fulfilled").length;
  }

  return { reminders: currentReminders, skipped };
}

function clampLimit(value: string | null) {
  const parsed = Number(value ?? 5);

  if (!Number.isFinite(parsed) || parsed < 1) {
    return 5;
  }

  return Math.min(Math.floor(parsed), MAX_LIMIT);
}

function normalizeWritableStatus(value: unknown): ReminderStatus | null {
  if (
    value === "queued" ||
    value === "processing" ||
    value === "sent" ||
    value === "failed" ||
    value === "skipped"
  ) {
    return value;
  }

  return null;
}

function buildReminderStatusError(
  reminder: ReminderJob,
  status: ReminderStatus,
  rawError: unknown,
) {
  const runId = getWhatsAppBotReminderRunId(reminder);
  const marker = runId ? buildWhatsAppBotReminderMarker(runId) : "";
  const error =
    typeof rawError === "string" && rawError.trim() ? rawError.trim().slice(0, 500) : "";

  if (status === "processing" || status === "sent") {
    return marker || undefined;
  }

  return [marker, error].filter(Boolean).join("; ") || undefined;
}
