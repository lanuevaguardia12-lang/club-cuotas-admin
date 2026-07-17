import { NextRequest, NextResponse } from "next/server";

import { systemAuditActor } from "@/lib/audit";
import { verifyStripeSignature } from "@/lib/webhooks/signatures";
import { getDataService } from "@/services/data-service";
import type { PaymentStatus } from "@/types/premium";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface StripeEvent {
  id: string;
  type: string;
  data: {
    object: Record<string, unknown>;
  };
}

export async function POST(request: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!secret) {
    return NextResponse.json(
      { message: "STRIPE_WEBHOOK_SECRET no esta configurado." },
      { status: 500 },
    );
  }

  const rawBody = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!verifyStripeSignature({ payload: rawBody, secret, signatureHeader: signature })) {
    return NextResponse.json({ message: "Firma invalida." }, { status: 401 });
  }

  const event = JSON.parse(rawBody) as StripeEvent;
  const stripeObject = event.data.object;
  const metadata = toRecord(stripeObject.metadata);
  const amount = Number(stripeObject.amount_total ?? stripeObject.amount ?? 0) / 100;
  const currency = String(stripeObject.currency ?? "ars").toUpperCase();
  const status = mapStripeStatus(
    String(stripeObject.payment_status ?? stripeObject.status ?? ""),
  );
  const dataService = getDataService();

  await dataService.upsertPaymentRecord({
    provider: "stripe",
    externalId: String(stripeObject.id ?? event.id),
    playerId: String(metadata.player_id ?? metadata.playerId ?? ""),
    playerName: String(metadata.player_name ?? metadata.playerName ?? ""),
    period: String(metadata.period ?? new Date().toISOString().slice(0, 7)),
    amount,
    currency,
    status,
    rawEventType: event.type,
  });
  await dataService.recordAuditEvent({
    actor: systemAuditActor,
    action: "payment.webhook_received",
    entityType: "payment",
    entityId: String(stripeObject.id ?? event.id),
    summary: `Webhook Stripe recibido: ${event.type}.`,
    metadata: {
      eventId: event.id,
      status,
    },
  });

  if (status === "paid") {
    await dataService.createNotification({
      title: "Pago confirmado por Stripe",
      message: `Se confirmo un pago de ${currency} ${amount}.`,
      type: "success",
      targetRole: "treasurer",
    });
  }

  return NextResponse.json({ received: true });
}

function mapStripeStatus(status: string): PaymentStatus {
  if (status === "paid" || status === "succeeded" || status === "complete") {
    return "paid";
  }

  if (
    status === "open" ||
    status === "processing" ||
    status === "requires_payment_method"
  ) {
    return "pending";
  }

  if (status === "expired" || status === "canceled") {
    return "cancelled";
  }

  return "unknown";
}

function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}
