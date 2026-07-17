import { NextRequest, NextResponse } from "next/server";

import { systemAuditActor } from "@/lib/audit";
import { verifyMercadoPagoSignature } from "@/lib/webhooks/signatures";
import { getDataService } from "@/services/data-service";
import type { PaymentStatus } from "@/types/premium";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface MercadoPagoWebhookPayload {
  id?: string | number;
  type?: string;
  action?: string;
  data?: {
    id?: string | number;
  };
}

interface MercadoPagoPaymentResponse {
  id?: string | number;
  status?: string;
  external_reference?: string;
  transaction_amount?: number;
  currency_id?: string;
  metadata?: Record<string, unknown>;
}

export async function POST(request: NextRequest) {
  const secret = process.env.MERCADO_PAGO_WEBHOOK_SECRET;

  if (!secret) {
    return NextResponse.json(
      { message: "MERCADO_PAGO_WEBHOOK_SECRET no esta configurado." },
      { status: 500 },
    );
  }

  const rawBody = await request.text();
  const payload = JSON.parse(rawBody) as MercadoPagoWebhookPayload;
  const dataId =
    request.nextUrl.searchParams.get("data.id") ??
    request.nextUrl.searchParams.get("data_id") ??
    String(payload.data?.id ?? "");
  const isValid = verifyMercadoPagoSignature({
    xSignature: request.headers.get("x-signature"),
    xRequestId: request.headers.get("x-request-id"),
    dataId,
    secret,
  });

  if (!isValid) {
    return NextResponse.json({ message: "Firma invalida." }, { status: 401 });
  }

  const payment = await fetchMercadoPagoPayment(dataId);
  const reference = payment?.external_reference ?? "";
  const [playerId = "", period = new Date().toISOString().slice(0, 7)] =
    reference.split(":");
  const dataService = getDataService();
  const status = mapMercadoPagoStatus(payment?.status);
  const amount = Number(payment?.transaction_amount ?? 0);
  const currency = payment?.currency_id ?? process.env.MERCADO_PAGO_CURRENCY ?? "ARS";

  await dataService.upsertPaymentRecord({
    provider: "mercado-pago",
    externalId: String(payment?.id ?? dataId),
    playerId: String(payment?.metadata?.player_id ?? playerId),
    playerName: String(payment?.metadata?.player_name ?? ""),
    period: String(payment?.metadata?.period ?? period),
    amount,
    currency,
    status,
    rawEventType: payload.action ?? payload.type ?? "mercado_pago.webhook",
  });
  await dataService.recordAuditEvent({
    actor: systemAuditActor,
    action: "payment.webhook_received",
    entityType: "payment",
    entityId: String(payment?.id ?? dataId),
    summary: `Webhook Mercado Pago recibido: ${payload.action ?? payload.type ?? "evento"}.`,
    metadata: {
      dataId,
      status,
    },
  });

  if (status === "approved" || status === "paid") {
    await dataService.createNotification({
      title: "Pago confirmado por Mercado Pago",
      message: `Se confirmo un pago de ${currency} ${amount}.`,
      type: "success",
      targetRole: "treasurer",
    });
  }

  return NextResponse.json({ received: true });
}

async function fetchMercadoPagoPayment(dataId: string) {
  const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;

  if (!accessToken || !dataId) {
    return null;
  }

  const response = await fetch(`https://api.mercadopago.com/v1/payments/${dataId}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    return null;
  }

  return (await response.json()) as MercadoPagoPaymentResponse;
}

function mapMercadoPagoStatus(status?: string): PaymentStatus {
  if (status === "approved") {
    return "approved";
  }

  if (status === "pending" || status === "in_process" || status === "authorized") {
    return "pending";
  }

  if (status === "rejected") {
    return "rejected";
  }

  if (status === "cancelled") {
    return "cancelled";
  }

  if (status === "refunded" || status === "charged_back") {
    return "refunded";
  }

  return "unknown";
}
