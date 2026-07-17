import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { userToAuditActor } from "@/lib/audit";
import { requireApiPermission } from "@/lib/api/auth";
import { getDataService } from "@/services/data-service";
import { getPaymentGateway } from "@/services/payments/payment-gateway";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const checkoutSchema = z.object({
  provider: z.enum(["mercado-pago", "stripe"]),
  playerId: z.string().trim().min(1),
  playerName: z.string().trim().min(1),
  period: z.string().regex(/^\d{4}-\d{2}$/),
  amount: z.number().positive(),
  currency: z.string().trim().min(3).max(3).default("ARS"),
  payerEmail: z.string().trim().email().optional(),
});

export async function POST(request: NextRequest) {
  const auth = await requireApiPermission(request, "payments:manage");

  if (auth.response) {
    return auth.response;
  }

  const parsed = checkoutSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json({ message: "Payload invalido." }, { status: 400 });
  }

  const gateway = getPaymentGateway(parsed.data.provider);
  const checkout = await gateway.createCheckout(parsed.data);
  const dataService = getDataService();

  await dataService.upsertPaymentRecord({
    provider: checkout.provider,
    externalId: checkout.externalId,
    playerId: parsed.data.playerId,
    playerName: parsed.data.playerName,
    period: parsed.data.period,
    amount: parsed.data.amount,
    currency: parsed.data.currency,
    status: checkout.status,
    checkoutUrl: checkout.checkoutUrl,
    rawEventType: "api.checkout.created",
  });
  await dataService.recordAuditEvent({
    actor: userToAuditActor(auth.user),
    action: "payment.checkout_created",
    entityType: "payment",
    entityId: checkout.externalId,
    summary: `Checkout creado por API para ${parsed.data.playerName}.`,
    metadata: {
      provider: checkout.provider,
      period: parsed.data.period,
      amount: parsed.data.amount,
    },
  });

  return NextResponse.json({ data: checkout }, { status: 201 });
}
