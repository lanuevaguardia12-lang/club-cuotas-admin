import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";
import PDFDocument from "pdfkit";
test(
  "payment receipts remain private and upload/download with matching contents",
  { skip: process.env.RUN_STORAGE_TESTS !== "1" },
  async () => {
    nextEnv.loadEnvConfig(process.cwd());
    assert.ok(process.env.SUPABASE_SECRET_KEY, "Falta configurar la clave del servidor.");
    const client = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SECRET_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const bucket = "club-payment-receipts",
      path = `storage-check/${randomUUID()}.pdf`;
    let uploaded = false;
    try {
      const info = await client.storage.getBucket(bucket);
      assert.ok(!info.error, "No se pudo leer el bucket privado.");
      assert.equal(info.data.public, false);
      const doc = new PDFDocument({ size: "A6" }),
        chunks = [];
      const pdf = new Promise((resolve, reject) => {
        doc.on("data", (c) => chunks.push(c));
        doc.on("end", () => resolve(Buffer.concat(chunks)));
        doc.on("error", reject);
      });
      doc.text("Prueba de comprobante privado");
      doc.end();
      const bytes = await pdf;
      const result = await client.storage
        .from(bucket)
        .upload(path, bytes, { contentType: "application/pdf", upsert: false });
      assert.ok(!result.error, "No se pudo subir el comprobante de prueba.");
      uploaded = true;
      const download = await client.storage.from(bucket).download(path);
      assert.ok(!download.error, "No se pudo descargar el archivo privado.");
      const actual = Buffer.from(await download.data.arrayBuffer());
      assert.equal(
        createHash("sha256").update(actual).digest("hex"),
        createHash("sha256").update(bytes).digest("hex"),
      );
      assert.equal(
        (
          await fetch(
            `${process.env.SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`,
          )
        ).ok,
        false,
      );
    } finally {
      if (uploaded)
        assert.ok(
          !(await client.storage.from(bucket).remove([path])).error,
          "No se pudo eliminar el archivo temporal de prueba.",
        );
    }
  },
);
