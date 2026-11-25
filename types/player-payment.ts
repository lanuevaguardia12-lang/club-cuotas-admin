export interface PayableQuota {
  period: string;
  amountCents: number;
}
export interface PlayerPaymentData {
  playerId: string;
  playerName: string;
  quotas: PayableQuota[];
  totalDebtCents: number;
  undefinedPeriods: string[];
}
export interface PaymentReceiptRecord {
  id: string;
  userId: string;
  playerId: string;
  playerName: string;
  totalCents: number;
  createdAt: string;
  bucket: string;
  objectPath: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  sha256: string;
  quotas: PayableQuota[];
}
export interface RegisterPlayerPaymentInput {
  id: string;
  expectedQuotas: PayableQuota[];
  receipt: Pick<
    PaymentReceiptRecord,
    "bucket" | "objectPath" | "fileName" | "mimeType" | "fileSize" | "sha256"
  >;
}
