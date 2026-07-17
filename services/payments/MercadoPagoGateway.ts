import type { CheckoutResult, CreateCheckoutInput } from "@/types/premium";
import {
  PaymentGatewayError,
  type PaymentGateway,
} from "@/services/payments/PaymentGateway";

interface MercadoPagoPreferenceResponse {
  id: string;
  init_point?: string;
  sandbox_init_point?: string;
  message?: string;
  error?: string;
}

export class MercadoPagoGateway implements PaymentGateway {
  readonly provider = "mercado-pago" as const;

  async createCheckout(input: CreateCheckoutInput): Promise<CheckoutResult> {
    const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;

    if (!accessToken) {
      throw new PaymentGatewayError(
        "MERCADO_PAGO_ACCESS_TOKEN no esta configurada.",
        this.provider,
      );
    }

    const appUrl = getAppUrl();
    const currency = input.currency ?? process.env.MERCADO_PAGO_CURRENCY ?? "ARS";
    const response = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        items: [
          {
            id: `${input.playerId}-${input.period}`,
            title: `Cuota ${input.period}`,
            description: input.playerName,
            quantity: 1,
            currency_id: currency,
            unit_price: input.amount,
          },
        ],
        payer: input.payerEmail
          ? {
              email: input.payerEmail,
            }
          : undefined,
        back_urls: {
          success:
            process.env.MERCADO_PAGO_SUCCESS_URL ?? `${appUrl}/payments?status=success`,
          pending:
            process.env.MERCADO_PAGO_PENDING_URL ?? `${appUrl}/payments?status=pending`,
          failure:
            process.env.MERCADO_PAGO_FAILURE_URL ?? `${appUrl}/payments?status=failure`,
        },
        notification_url:
          process.env.MERCADO_PAGO_NOTIFICATION_URL ??
          `${appUrl}/api/webhooks/mercado-pago`,
        auto_return: "approved",
        external_reference: `${input.playerId}:${input.period}`,
        metadata: {
          player_id: input.playerId,
          player_name: input.playerName,
          period: input.period,
        },
      }),
    });
    const payload = (await response.json()) as MercadoPagoPreferenceResponse;
    const checkoutUrl = payload.init_point ?? payload.sandbox_init_point;

    if (!response.ok || !payload.id || !checkoutUrl) {
      throw new PaymentGatewayError(
        payload.message ?? payload.error ?? "Mercado Pago no pudo crear la preferencia.",
        this.provider,
        payload,
      );
    }

    return {
      provider: this.provider,
      externalId: payload.id,
      checkoutUrl,
      status: "created",
    };
  }
}

function getAppUrl() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;

  if (!appUrl) {
    throw new PaymentGatewayError(
      "NEXT_PUBLIC_APP_URL no esta configurada.",
      "mercado-pago",
    );
  }

  return appUrl.replace(/\/$/, "");
}
