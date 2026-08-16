import { NextRequest, NextResponse } from "next/server";

import { userToAuditActor } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth/session";
import { buildReminderMessage, sanitizeWhatsAppPhone } from "@/lib/reminders";
import {
  buildWhatsAppBotReminderMarker,
  isWhatsAppBotReminder,
} from "@/lib/whatsapp-bot";
import { getDataService } from "@/services/data-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WEBHOOK_TIMEOUT_MS = 25_000;

interface WhatsAppBotPayloadMessage {
  amount: number;
  fee: string;
  message: string;
  paymentStatus: string;
  period: string;
  phone: string;
  playerId: string;
  playerName: string;
  rawPhone: string;
}

export async function POST(request: NextRequest) {
  try {
    return await runWhatsAppReminderBot(request);
  } catch (error) {
    console.error("No se pudo correr el bot de recordatorios.", error);

    return NextResponse.json(
      {
        message: getErrorMessage(error, "No se pudo correr el bot de recordatorios."),
      },
      { status: 500 },
    );
  }
}

async function runWhatsAppReminderBot(request: NextRequest) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  }

  if (user.role !== "admin") {
    return NextResponse.json(
      { message: "Solo un administrador puede correr el bot de recordatorios." },
      { status: 403 },
    );
  }

  const webhookUrl = process.env.WHATSAPP_BOT_WEBHOOK_URL?.trim();

  const body = (await request.json().catch(() => ({}))) as { period?: unknown };
  const period =
    typeof body.period === "string" && /^\d{4}-\d{2}$/.test(body.period)
      ? body.period
      : getCurrentPeriod();
  const dataService = getDataService();
  const [dashboard, settingsData, premium] = await Promise.all([
    dataService.getDashboardData(period),
    dataService.getAppSettings(),
    dataService.getPremiumData(),
  ]);
  const pendingPlayers = dashboard.players.filter((player) => player.status !== "paid");
  const alreadyQueuedPlayerIds = new Set(
    premium.reminders
      .filter(
        (reminder) =>
          reminder.period === period &&
          reminder.status === "queued" &&
          isWhatsAppBotReminder(reminder),
      )
      .map((reminder) => reminder.playerId),
  );
  const periodLabel = formatPeriod(period);
  const messages: WhatsAppBotPayloadMessage[] = [];
  let skippedAlreadyQueued = 0;
  let skippedNoPhone = 0;

  for (const player of pendingPlayers) {
    if (alreadyQueuedPlayerIds.has(player.id)) {
      skippedAlreadyQueued += 1;
      continue;
    }

    const phone = sanitizeWhatsAppPhone(player.phone);

    if (phone.length === 0) {
      skippedNoPhone += 1;
      continue;
    }

    messages.push({
      amount: player.feeAmount,
      fee: player.fee,
      message: buildReminderMessage(settingsData.settings.whatsAppMessageTemplate, {
        clubName: settingsData.settings.clubName,
        currentMonth: periodLabel,
        feeAmount: player.fee,
        playerName: player.name,
      }),
      paymentStatus: player.status,
      period,
      phone,
      playerId: player.id,
      playerName: player.name,
      rawPhone: player.phone,
    });
  }

  if (messages.length === 0) {
    await dataService
      .recordAuditEvent({
        actor: userToAuditActor(user),
        action: "reminder.queued",
        entityType: "reminder",
        entityId: period,
        summary: `Bot de WhatsApp no encontro pendientes con telefono para ${period}.`,
        metadata: {
          period,
          skippedAlreadyQueued,
          skippedNoPhone,
          totalPending: pendingPlayers.length,
        },
      })
      .catch(() => undefined);

    return NextResponse.json({
      ok: true,
      period,
      periodLabel,
      queued: 0,
      skippedAlreadyQueued,
      skippedNoPhone,
      totalPending: pendingPlayers.length,
      webhookStatus: "not-called",
    });
  }

  const runId = `whatsapp-reminders:${period}:${new Date().toISOString()}`;
  const payload = {
    clubName: settingsData.settings.clubName,
    currentOnly: true,
    messages,
    period,
    periodLabel,
    runId,
    source: "club-cuotas-admin",
    triggeredAt: new Date().toISOString(),
    triggeredBy: {
      id: user.id,
      name: user.name,
      role: user.role,
    },
    totalPending: pendingPlayers.length,
  };
  const webhookResponse = webhookUrl
    ? await postToWhatsAppBot(webhookUrl, payload)
    : { ok: true, status: "local-queue", message: "" };

  if (!webhookResponse.ok) {
    await dataService
      .recordAuditEvent({
        actor: userToAuditActor(user),
        action: "system.error",
        entityType: "reminder",
        entityId: period,
        summary: `Fallo el bot de WhatsApp para ${period}.`,
        metadata: {
          period,
          queued: messages.length,
          skippedAlreadyQueued,
          status: webhookResponse.status,
        },
      })
      .catch(() => undefined);

    return NextResponse.json(
      {
        message:
          webhookResponse.message || "El bot externo no pudo recibir los recordatorios.",
        period,
        queued: messages.length,
        skippedAlreadyQueued,
        skippedNoPhone,
        totalPending: pendingPlayers.length,
      },
      { status: 502 },
    );
  }

  const reminderResults = await Promise.allSettled(
    messages.map((item) =>
      dataService.createReminderJob({
        scheduledFor: new Date().toISOString(),
        period,
        playerId: item.playerId,
        playerName: item.playerName,
        phone: item.rawPhone,
        paymentStatus: item.paymentStatus === "debt" ? "debt" : "pending",
        message: item.message,
        status: "queued",
        error: buildWhatsAppBotReminderMarker(runId),
      }),
    ),
  );
  const reminderRecordsFailed = reminderResults.filter(
    (result) => result.status === "rejected",
  ).length;

  if (reminderRecordsFailed === messages.length) {
    return NextResponse.json(
      {
        message:
          "No se pudo crear la cola en la hoja Recordatorios. Revisá que la Service Account tenga permisos de edición y que exista el rango GOOGLE_SHEETS_REMINDERS_RANGE.",
        mode: webhookUrl ? "webhook" : "local-queue",
        period,
        queued: 0,
        reminderRecordsFailed,
        skippedAlreadyQueued,
        skippedNoPhone,
        totalPending: pendingPlayers.length,
      },
      { status: 500 },
    );
  }

  await dataService
    .createNotification({
      title: "Bot de recordatorios iniciado",
      message: webhookUrl
        ? `${messages.length} mensajes de WhatsApp enviados al bot para ${periodLabel}.`
        : `${messages.length} mensajes de WhatsApp quedaron en cola para el bot local de ${periodLabel}.`,
      type: reminderRecordsFailed > 0 ? "warning" : "success",
      targetRole: "all",
      referenceId: runId,
    })
    .catch(() => undefined);
  await dataService
    .recordAuditEvent({
      actor: userToAuditActor(user),
      action: "reminder.queued",
      entityType: "reminder",
      entityId: period,
      summary: `Admin envio ${messages.length} recordatorios de WhatsApp al bot para ${period}.`,
      metadata: {
        mode: webhookUrl ? "webhook" : "local-queue",
        period,
        queued: messages.length - reminderRecordsFailed,
        reminderRecordsFailed,
        skippedAlreadyQueued,
        skippedNoPhone,
        totalPending: pendingPlayers.length,
      },
    })
    .catch(() => undefined);

  return NextResponse.json({
    ok: true,
    mode: webhookUrl ? "webhook" : "local-queue",
    period,
    periodLabel,
    queued: messages.length - reminderRecordsFailed,
    reminderRecordsFailed,
    skippedAlreadyQueued,
    skippedNoPhone,
    totalPending: pendingPlayers.length,
    webhookStatus: webhookResponse.status,
  });
}

async function postToWhatsAppBot(webhookUrl: string, payload: unknown) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);

  try {
    const response = await fetch(webhookUrl, {
      body: JSON.stringify(payload),
      headers: buildWebhookHeaders(),
      method: "POST",
      signal: controller.signal,
    });
    const text = await response.text().catch(() => "");

    return {
      ok: response.ok,
      status: response.status,
      message: response.ok ? "" : text.slice(0, 500),
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      message:
        error instanceof Error
          ? error.message
          : "No se pudo conectar con el bot externo.",
    };
  } finally {
    clearTimeout(timeout);
  }
}

function buildWebhookHeaders() {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  const secret = process.env.WHATSAPP_BOT_WEBHOOK_SECRET?.trim();

  if (secret) {
    headers.authorization = `Bearer ${secret}`;
  }

  return headers;
}

function getCurrentPeriod() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    month: "2-digit",
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;

  return `${year}-${month}`;
}

function formatPeriod(period: string) {
  const [year, month] = period.split("-").map(Number);
  const date = new Date(year, month - 1, 1);

  return new Intl.DateTimeFormat("es-AR", {
    month: "long",
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
  }).format(date);
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return fallback;
}
