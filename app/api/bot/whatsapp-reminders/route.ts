import { NextRequest, NextResponse } from "next/server";

import { userToAuditActor } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth/session";
import { buildReminderMessage, sanitizeWhatsAppPhone } from "@/lib/reminders";
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

  if (!webhookUrl) {
    return NextResponse.json(
      {
        message:
          "Falta configurar WHATSAPP_BOT_WEBHOOK_URL para conectar el bot externo.",
      },
      { status: 501 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as { period?: unknown };
  const period =
    typeof body.period === "string" && /^\d{4}-\d{2}$/.test(body.period)
      ? body.period
      : getCurrentPeriod();
  const dataService = getDataService();
  const [dashboard, settingsData] = await Promise.all([
    dataService.getDashboardData(period),
    dataService.getAppSettings(),
  ]);
  const pendingPlayers = dashboard.players.filter((player) => player.status !== "paid");
  const periodLabel = formatPeriod(period);
  const messages: WhatsAppBotPayloadMessage[] = [];
  let skippedNoPhone = 0;

  for (const player of pendingPlayers) {
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
    await dataService.recordAuditEvent({
      actor: userToAuditActor(user),
      action: "reminder.queued",
      entityType: "reminder",
      entityId: period,
      summary: `Bot de WhatsApp no encontro pendientes con telefono para ${period}.`,
      metadata: {
        period,
        skippedNoPhone,
        totalPending: pendingPlayers.length,
      },
    });

    return NextResponse.json({
      ok: true,
      period,
      periodLabel,
      queued: 0,
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
  const webhookResponse = await postToWhatsAppBot(webhookUrl, payload);

  if (!webhookResponse.ok) {
    await dataService.recordAuditEvent({
      actor: userToAuditActor(user),
      action: "system.error",
      entityType: "reminder",
      entityId: period,
      summary: `Fallo el bot de WhatsApp para ${period}.`,
      metadata: {
        period,
        queued: messages.length,
        status: webhookResponse.status,
      },
    });

    return NextResponse.json(
      {
        message:
          webhookResponse.message || "El bot externo no pudo recibir los recordatorios.",
        period,
        queued: messages.length,
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
      }),
    ),
  );
  const reminderRecordsFailed = reminderResults.filter(
    (result) => result.status === "rejected",
  ).length;

  await dataService.createNotification({
    title: "Bot de recordatorios iniciado",
    message: `${messages.length} mensajes de WhatsApp enviados al bot para ${periodLabel}.`,
    type: reminderRecordsFailed > 0 ? "warning" : "success",
    targetRole: "all",
    referenceId: runId,
  });
  await dataService.recordAuditEvent({
    actor: userToAuditActor(user),
    action: "reminder.queued",
    entityType: "reminder",
    entityId: period,
    summary: `Admin envio ${messages.length} recordatorios de WhatsApp al bot para ${period}.`,
    metadata: {
      period,
      queued: messages.length,
      reminderRecordsFailed,
      skippedNoPhone,
      totalPending: pendingPlayers.length,
    },
  });

  return NextResponse.json({
    ok: true,
    period,
    periodLabel,
    queued: messages.length,
    reminderRecordsFailed,
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
