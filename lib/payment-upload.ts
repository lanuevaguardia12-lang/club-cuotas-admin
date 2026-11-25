import { MAX_RECEIPT_BYTES } from "@/lib/player-payment";
export async function limitedPaymentForm(request: Request) {
  const limit = MAX_RECEIPT_BYTES + 128 * 1024;
  if (!request.headers.get("content-type")?.startsWith("multipart/form-data"))
    throw new Error("Adjuntá el comprobante con el formulario.");
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > limit) throw new Error("El comprobante debe pesar hasta 4 MB.");
  if (!request.body) throw new Error("Falta el comprobante.");
  const reader = request.body.getReader();
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new Error("El comprobante debe pesar hasta 4 MB.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return new Response(bytes, {
    headers: { "content-type": request.headers.get("content-type")! },
  }).formData();
}
