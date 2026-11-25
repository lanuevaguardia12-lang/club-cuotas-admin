import { z } from "zod";
import type {
  PayableQuota,
  PaymentReceiptRecord,
  PlayerPaymentData,
} from "@/types/player-payment";
export const RECEIPT_BUCKET = "club-payment-receipts";
export const MAX_RECEIPT_BYTES = 4 * 1024 * 1024;
export const RECEIPT_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;
export const playerPaymentSchema = z.object({
  id: z.uuid(),
  expectedQuotas: z
    .array(
      z.object({
        period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
        amountCents: z.number().int().positive().safe(),
      }),
    )
    .min(1, "Seleccioná al menos una cuota.")
    .max(240)
    .refine(
      (items) => new Set(items.map((i) => i.period)).size === items.length,
      "No repitas cuotas.",
    ),
});
export const paymentReceiptSchema = z.object({
  bucket: z.literal(RECEIPT_BUCKET),
  objectPath: z.string().regex(/^[a-f0-9]{32}\/[a-f0-9-]{36}\.(pdf|jpg|png|webp)$/),
  fileName: z.string().min(1).max(150),
  mimeType: z.enum(RECEIPT_MIME_TYPES),
  fileSize: z.number().int().positive().max(MAX_RECEIPT_BYTES),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
});
export function moneyCents(amount: number) {
  const value = Math.round((amount + Number.EPSILON) * 100);
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("Importe inválido.");
  return value;
}
export function selectPaymentQuotas(data: PlayerPaymentData, expected: PayableQuota[]) {
  const selected = expected
    .map((item) => {
      const quota = data.quotas.find((q) => q.period === item.period);
      if (!quota || quota.amountCents !== item.amountCents)
        throw new Error(
          "Las cuotas cambiaron o alguna ya está pagada. Actualizá la pantalla y volvé a seleccionar.",
        );
      return quota;
    })
    .sort((a, b) => a.period.localeCompare(b.period));
  const total = selected.reduce((sum, q) => sum + q.amountCents, 0);
  if (!Number.isSafeInteger(total) || total <= 0)
    throw new Error("El total a pagar no es válido.");
  return { selected, total };
}
export function assertReceiptReplay(
  record: PaymentReceiptRecord,
  userId: string,
  input: { expectedQuotas: PayableQuota[]; sha256: string },
) {
  const sort = (items: PayableQuota[]) =>
    [...items].sort((a, b) => a.period.localeCompare(b.period));
  if (
    record.userId !== userId ||
    record.sha256 !== input.sha256 ||
    JSON.stringify(sort(record.quotas)) !== JSON.stringify(sort(input.expectedQuotas))
  )
    throw new Error("Esta solicitud de pago ya fue utilizada con otros datos.");
}
export function receiptExtension(bytes: Uint8Array, declaredMime: string) {
  let mime: string | undefined, extension: string | undefined;
  if (
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46 &&
    bytes[4] === 0x2d
  ) {
    mime = "application/pdf";
    extension = "pdf";
  } else if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    mime = "image/jpeg";
    extension = "jpg";
  } else if ([137, 80, 78, 71, 13, 10, 26, 10].every((n, i) => bytes[i] === n)) {
    mime = "image/png";
    extension = "png";
  } else if (
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  ) {
    mime = "image/webp";
    extension = "webp";
  }
  if (!mime || mime !== declaredMime)
    throw new Error(
      "El comprobante debe ser un PDF o una imagen JPG, PNG o WebP válida.",
    );
  return { mime, extension: extension! };
}
export function formatPaymentAmount(cents: number) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: cents % 100 ? 2 : 0,
  }).format(cents / 100);
}
export function paymentPeriodLabel(period: string) {
  const [year, month] = period.split("-").map(Number);
  return new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric" }).format(
    new Date(year, month - 1, 1),
  );
}
export function paymentDebtDescription(quotas: PayableQuota[]) {
  if (quotas.length > 3)
    return `${quotas.length} cuotas pendientes, desde ${paymentPeriodLabel(quotas[0].period)} hasta ${paymentPeriodLabel(quotas.at(-1)!.period)}`;
  return new Intl.ListFormat("es-AR", { style: "long", type: "conjunction" }).format(
    quotas.map((q) => paymentPeriodLabel(q.period)),
  );
}

export function currentPaymentDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = (type: string) => parts.find((part) => part.type === type)!.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}
