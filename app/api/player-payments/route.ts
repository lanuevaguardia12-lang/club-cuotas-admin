import { createHash, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/session";
import { limitedPaymentForm } from "@/lib/payment-upload";
import {
  assertReceiptReplay,
  MAX_RECEIPT_BYTES,
  playerPaymentSchema,
  receiptExtension,
  RECEIPT_BUCKET,
  selectPaymentQuotas,
} from "@/lib/player-payment";
import { getDataService } from "@/services/data-service";
import { PaymentReceiptsStore } from "@/services/database/payment-receipts-store";
import {
  uploadPaymentReceipt,
  removePaymentReceipt,
} from "@/services/storage/payment-receipts";
import type { PaymentReceiptRecord } from "@/types/player-payment";
export const runtime = "nodejs";
export const maxDuration = 60;
function success(record: PaymentReceiptRecord) {
  return Response.json(
    {
      id: record.id,
      totalCents: record.totalCents,
      periods: record.quotas.map((q) => q.period),
      receiptUrl: `/api/payment-receipts/${record.id}`,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== "player")
    return Response.json({ error: "No autorizado." }, { status: 403 });
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return Response.json({ error: "Origen inválido." }, { status: 403 });
  let path: string | undefined, id: string | undefined, sha256: string | undefined;
  let expectedQuotas: PaymentReceiptRecord["quotas"] = [];
  try {
    const form = await limitedPaymentForm(request);
    const payload = playerPaymentSchema.safeParse(
      JSON.parse(String(form.get("payload") ?? "null")),
    );
    if (!payload.success)
      return Response.json(
        { error: payload.error.issues[0]?.message ?? "Seleccioná las cuotas." },
        { status: 400 },
      );
    id = payload.data.id;
    expectedQuotas = payload.data.expectedQuotas;
    const file = form.get("receipt");
    if (!(file instanceof File) || file.size === 0 || file.size > MAX_RECEIPT_BYTES)
      return Response.json(
        { error: "Cargá un comprobante de hasta 4 MB." },
        { status: 400 },
      );
    const bytes = new Uint8Array(await file.arrayBuffer());
    const { mime, extension } = receiptExtension(bytes, file.type);
    sha256 = createHash("sha256").update(bytes).digest("hex");
    const receipts = new PaymentReceiptsStore();
    const existing = await receipts.find(id);
    if (existing) {
      assertReceiptReplay(existing, user.id, { expectedQuotas, sha256 });
      return success(existing);
    }
    const dataService = getDataService();
    const debt = await dataService.getPlayerPaymentData(user);
    selectPaymentQuotas(debt, expectedQuotas);
    const folder = createHash("sha256").update(debt.playerId).digest("hex").slice(0, 32);
    path = `${folder}/${randomUUID()}.${extension}`;
    await uploadPaymentReceipt(path, bytes, mime);
    const record = await dataService.registerPlayerPayment(user, {
      id,
      expectedQuotas,
      receipt: {
        bucket: RECEIPT_BUCKET,
        objectPath: path,
        fileName:
          file.name.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 150) ||
          `comprobante.${extension}`,
        mimeType: mime,
        fileSize: file.size,
        sha256,
      },
    });
    if (record.objectPath !== path) {
      try {
        await removePaymentReceipt(path);
      } catch {
        /* A private orphan can be cleaned up later; the payment is already committed. */
      }
    }
    for (const page of [
      "/",
      "/mi-cuota",
      "/pagar-cuota",
      "/players",
      "/payments",
      "/cash-flow",
    ])
      revalidatePath(page);
    return success(record);
  } catch (error) {
    if (path && id && sha256) {
      try {
        const committed = await new PaymentReceiptsStore().find(id);
        if (committed) {
          assertReceiptReplay(committed, user.id, { expectedQuotas, sha256 });
          if (committed.objectPath !== path) {
            try {
              await removePaymentReceipt(path);
            } catch {
              /* Cleanup must not turn a committed payment into an error. */
            }
          }
          return success(committed);
        }
        await removePaymentReceipt(path);
      } catch {
        /* Do not delete a potentially committed receipt if confirmation is unavailable. */
      }
    }
    const safe =
      error instanceof Error &&
      [
        "Las cuotas cambiaron",
        "El comprobante debe",
        "Esta solicitud de pago",
        "La carga de comprobantes",
        "No se pudo guardar el comprobante",
      ].some((prefix) => error.message.startsWith(prefix));
    return Response.json(
      {
        error: safe
          ? (error as Error).message
          : "No se pudo registrar el pago. Actualizá la pantalla e intentá nuevamente.",
      },
      { status: 400 },
    );
  }
}
