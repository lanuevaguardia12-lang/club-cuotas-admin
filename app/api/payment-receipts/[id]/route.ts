import { getCurrentUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/roles";
import { PaymentReceiptsStore } from "@/services/database/payment-receipts-store";
import { downloadPaymentReceipt } from "@/services/storage/payment-receipts";
export const runtime = "nodejs";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return new Response("No autorizado.", { status: 401 });
  const { id } = await params;
  if (!/^[\da-f-]{36}$/i.test(id)) return new Response("No encontrado.", { status: 404 });
  const record = await new PaymentReceiptsStore().find(id);
  if (!record || (record.userId !== user.id && !hasPermission(user, "payments:manage")))
    return new Response("No encontrado.", { status: 404 });
  try {
    const file = await downloadPaymentReceipt(record.objectPath);
    return new Response(file, {
      headers: {
        "Content-Type": record.mimeType,
        "Content-Disposition": `attachment; filename="comprobante.${record.mimeType === "application/pdf" ? "pdf" : record.mimeType === "image/jpeg" ? "jpg" : record.mimeType === "image/png" ? "png" : "webp"}"; filename*=UTF-8''${encodeURIComponent(record.fileName)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("No se pudo obtener el comprobante.", { status: 503 });
  }
}
