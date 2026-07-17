import { MercadoPagoGateway } from "@/services/payments/MercadoPagoGateway";
import type { PaymentGateway } from "@/services/payments/PaymentGateway";
import { StripeGateway } from "@/services/payments/StripeGateway";
import type { PaymentProvider } from "@/types/premium";

export function getPaymentGateway(provider: PaymentProvider): PaymentGateway {
  if (provider === "stripe") {
    return new StripeGateway();
  }

  return new MercadoPagoGateway();
}
