import type { CheckoutResult, CreateCheckoutInput } from "@/types/premium";
import {
  PaymentGatewayError,
  type PaymentGateway,
} from "@/services/payments/PaymentGateway";

interface StripeCheckoutSessionResponse {
  id: string;
  url?: string | null;
  payment_status?: string;
  status?: string;
  error?: {
    message?: string;
  };
}

export class StripeGateway implements PaymentGateway {
  readonly provider = "stripe" as const;

  async createCheckout(input: CreateCheckoutInput): Promise<CheckoutResult> {
    const secretKey = process.env.STRIPE_SECRET_KEY;

    if (!secretKey) {
      throw new PaymentGatewayError(
        "STRIPE_SECRET_KEY no esta configurada.",
        this.provider,
      );
    }

    const appUrl = getAppUrl();
    const amountMultiplier = parseAmountMultiplier(process.env.STRIPE_AMOUNT_MULTIPLIER);
    const body = new URLSearchParams({
      mode: "payment",
      success_url: process.env.STRIPE_SUCCESS_URL ?? `${appUrl}/payments?status=success`,
      cancel_url: process.env.STRIPE_CANCEL_URL ?? `${appUrl}/payments?status=cancelled`,
      client_reference_id: `${input.playerId}:${input.period}`,
      "metadata[player_id]": input.playerId,
      "metadata[player_name]": input.playerName,
      "metadata[period]": input.period,
      "line_items[0][quantity]": "1",
      "line_items[0][price_data][currency]": (input.currency ?? "ARS").toLowerCase(),
      "line_items[0][price_data][unit_amount]": String(
        Math.round(input.amount * amountMultiplier),
      ),
      "line_items[0][price_data][product_data][name]": `Cuota ${input.period}`,
      "line_items[0][price_data][product_data][description]": input.playerName,
    });

    if (input.payerEmail) {
      body.set("customer_email", input.payerEmail);
    }

    const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });
    const payload = (await response.json()) as StripeCheckoutSessionResponse;

    if (!response.ok || !payload.id || !payload.url) {
      throw new PaymentGatewayError(
        payload.error?.message ?? "Stripe no pudo crear la sesion de checkout.",
        this.provider,
        payload,
      );
    }

    return {
      provider: this.provider,
      externalId: payload.id,
      checkoutUrl: payload.url,
      status: payload.payment_status === "paid" ? "paid" : "created",
    };
  }
}

function getAppUrl() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;

  if (!appUrl) {
    throw new PaymentGatewayError("NEXT_PUBLIC_APP_URL no esta configurada.", "stripe");
  }

  return appUrl.replace(/\/$/, "");
}

function parseAmountMultiplier(value?: string) {
  const parsed = Number(value ?? 100);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : 100;
}
