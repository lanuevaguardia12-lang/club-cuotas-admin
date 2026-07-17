import type {
  CheckoutResult,
  CreateCheckoutInput,
  PaymentProvider,
} from "@/types/premium";

export interface PaymentGateway {
  readonly provider: PaymentProvider;
  createCheckout(input: CreateCheckoutInput): Promise<CheckoutResult>;
}

export class PaymentGatewayError extends Error {
  constructor(
    message: string,
    readonly provider: PaymentProvider,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "PaymentGatewayError";
  }
}
