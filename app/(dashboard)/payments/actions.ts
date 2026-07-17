"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { userToAuditActor } from "@/lib/audit";
import { hasPermission } from "@/lib/auth/roles";
import { getCurrentUser } from "@/lib/auth/session";
import { getDataService } from "@/services/data-service";
import { getPaymentGateway } from "@/services/payments/payment-gateway";

const checkoutSchema = z.object({
  provider: z.enum(["mercado-pago", "stripe"]),
  playerId: z.string().trim().min(1, "Ingresá el ID del jugador."),
  playerName: z.string().trim().min(1, "Ingresá el nombre del jugador."),
  period: z.string().regex(/^\d{4}-\d{2}$/, "Usá formato AAAA-MM."),
  amount: z.coerce.number().positive("El monto debe ser mayor a cero."),
  currency: z.string().trim().min(3).max(3).default("ARS"),
  payerEmail: z.string().trim().email().optional().or(z.literal("")),
});

export interface CheckoutActionState {
  checkoutUrl?: string;
  error?: string;
  message?: string;
}

export async function createCheckoutAction(
  _previousState: CheckoutActionState,
  formData: FormData,
): Promise<CheckoutActionState> {
  const user = await getCurrentUser();

  if (!user || !hasPermission(user, "payments:manage")) {
    return {
      error: "No tenés permisos para crear links de pago.",
    };
  }

  const parsed = checkoutSchema.safeParse({
    provider: formData.get("provider"),
    playerId: formData.get("playerId"),
    playerName: formData.get("playerName"),
    period: formData.get("period"),
    amount: formData.get("amount"),
    currency: formData.get("currency") || "ARS",
    payerEmail: formData.get("payerEmail") || "",
  });

  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Datos invalidos.",
    };
  }

  const input = {
    ...parsed.data,
    payerEmail: parsed.data.payerEmail || undefined,
  };
  const gateway = getPaymentGateway(input.provider);
  const checkout = await gateway.createCheckout(input);
  const dataService = getDataService();

  await dataService.upsertPaymentRecord({
    provider: checkout.provider,
    externalId: checkout.externalId,
    playerId: input.playerId,
    playerName: input.playerName,
    period: input.period,
    amount: input.amount,
    currency: input.currency,
    status: checkout.status,
    checkoutUrl: checkout.checkoutUrl,
    rawEventType: "checkout.created",
  });
  await dataService.recordAuditEvent({
    actor: userToAuditActor(user),
    action: "payment.checkout_created",
    entityType: "payment",
    entityId: checkout.externalId,
    summary: `Link de pago creado para ${input.playerName}`,
    metadata: {
      provider: input.provider,
      period: input.period,
      amount: input.amount,
    },
  });

  revalidatePath("/payments");

  return {
    checkoutUrl: checkout.checkoutUrl,
    message: "Link de pago creado.",
  };
}
