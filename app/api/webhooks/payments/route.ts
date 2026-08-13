import { timingSafeEqual } from "node:crypto";

import { unstable_expireTag } from "next/cache";
import { NextRequest, NextResponse } from "next/server";

import { apiAuditActor } from "@/lib/audit";
import { getDataService } from "@/services/data-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface PaymentsFormWebhookPayload {
  range?: string;
  row?: number;
  sheetName?: string;
  source?: string;
  timestamp?: string;
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  }

  const payload = await readPayload(request);

  expirePaymentsCache();
  await recordPaymentWebhook(payload);

  return NextResponse.json({
    received: true,
    expired: ["google-sheets", "google-sheets:dashboard", "google-sheets:player-profile"],
  });
}

function isAuthorized(request: NextRequest) {
  const authorization = request.headers.get("authorization");
  const token = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : "";
  const allowedSecrets = [
    process.env.PAYMENTS_WEBHOOK_SECRET,
    process.env.CRON_SECRET,
    process.env.API_SECRET,
  ].filter((secret): secret is string => Boolean(secret));

  return Boolean(token) && allowedSecrets.some((secret) => safeCompare(token, secret));
}

function safeCompare(value: string, expected: string) {
  const valueBuffer = Buffer.from(value);
  const expectedBuffer = Buffer.from(expected);

  return (
    valueBuffer.length === expectedBuffer.length &&
    timingSafeEqual(valueBuffer, expectedBuffer)
  );
}

async function readPayload(request: NextRequest): Promise<PaymentsFormWebhookPayload> {
  try {
    return (await request.json()) as PaymentsFormWebhookPayload;
  } catch {
    return {};
  }
}

function expirePaymentsCache() {
  try {
    unstable_expireTag(
      "google-sheets",
      "google-sheets:dashboard",
      "google-sheets:player-profile",
    );
  } catch {
    // Cache expiration is best-effort. The webhook must still answer Apps Script
    // even if Next has no cache store in the current runtime context.
  }
}

async function recordPaymentWebhook(payload: PaymentsFormWebhookPayload) {
  try {
    await getDataService().recordAuditEvent({
      actor: apiAuditActor,
      action: "payment.webhook_received",
      entityType: "payment",
      entityId: payload.timestamp ?? new Date().toISOString(),
      summary: "Webhook de formulario de pagos recibido. Cache de pagos expirado.",
      metadata: {
        range: payload.range ?? null,
        row: payload.row ?? null,
        sheetName: payload.sheetName ?? null,
        source: payload.source ?? "google-forms",
      },
    });
  } catch {
    // Audit should not block cache expiration for form submissions.
  }
}
