import "server-only";
import { createClient } from "@supabase/supabase-js";
import { RECEIPT_BUCKET } from "@/lib/player-payment";
let client: ReturnType<typeof createClient> | undefined;
function storage() {
  const url = process.env.SUPABASE_URL,
    key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key)
    throw new Error("La carga de comprobantes todavía no está configurada.");
  client ??= createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      fetch: (input, init) =>
        fetch(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(30000) }),
    },
  });
  return client.storage.from(RECEIPT_BUCKET);
}
export async function uploadPaymentReceipt(
  path: string,
  bytes: Uint8Array,
  mimeType: string,
) {
  const { error } = await storage().upload(path, bytes, {
    contentType: mimeType,
    upsert: false,
    cacheControl: "0",
  });
  if (error) throw new Error("No se pudo guardar el comprobante. Intentá nuevamente.");
}
export async function removePaymentReceipt(path: string) {
  const { error } = await storage().remove([path]);
  if (error) throw new Error("No se pudo eliminar el archivo temporal.");
}
export async function downloadPaymentReceipt(path: string) {
  const { data, error } = await storage().download(path);
  if (error || !data) throw new Error("No se pudo obtener el comprobante.");
  return data;
}
