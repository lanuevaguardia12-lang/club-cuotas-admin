import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRuntime } from "./runtime.mjs";
const id = randomUUID(),
  quotas = [
    { period: "2026-10", amountCents: 5000000 },
    { period: "2026-11", amountCents: 5000000 },
  ];
function setup({
  role = "player",
  uploadFails = false,
  commitUncertain = false,
  quoteFails = false,
} = {}) {
  const records = new Map(),
    calls = { uploads: 0, removes: 0, registers: 0, downloads: 0 };
  const user = role ? { id: "user-ana", role, playerId: "ana", name: "Ana" } : null;
  const runtime = createRuntime({
    mocks: {
      "@/lib/auth/session": { getCurrentUser: async () => user },
      "@/services/database/payment-receipts-store": {
        PaymentReceiptsStore: class {
          async find(id) {
            return records.get(id) ?? null;
          }
        },
      },
      "@/services/storage/payment-receipts": {
        async uploadPaymentReceipt() {
          calls.uploads++;
          if (uploadFails)
            throw new Error("No se pudo guardar el comprobante. Intentá nuevamente.");
        },
        async removePaymentReceipt() {
          calls.removes++;
        },
        async downloadPaymentReceipt() {
          calls.downloads++;
          return new Blob(["%PDF-1.4"], { type: "application/pdf" });
        },
      },
      "@/services/data-service": {
        getDataService: () => ({
          async getPlayerPaymentData() {
            return {
              playerId: "ana",
              playerName: "Ana Pérez",
              quotas,
              totalDebtCents: 10000000,
              undefinedPeriods: [],
            };
          },
          async registerPlayerPayment(actor, input) {
            calls.registers++;
            assert.equal(actor.id, "user-ana");
            assert.equal("playerId" in input, false);
            if (quoteFails)
              throw new Error("Las cuotas cambiaron o alguna ya está pagada.");
            const record = {
              id: input.id,
              userId: actor.id,
              playerId: "ana",
              playerName: "Ana Pérez",
              totalCents: 10000000,
              createdAt: "2026-11-24",
              quotas: input.expectedQuotas,
              ...input.receipt,
            };
            records.set(input.id, record);
            if (commitUncertain) throw new Error("connection lost after commit");
            return record;
          },
        }),
      },
    },
  });
  const route = runtime.load("app/api/player-payments/route.ts");
  const download = runtime.load("app/api/payment-receipts/[id]/route.ts");
  function request({
    origin = "https://club.test",
    expectedQuotas = quotas,
    bytes = "%PDF-1.4\nreceipt",
    mime = "application/pdf",
  } = {}) {
    const form = new FormData();
    form.set("payload", JSON.stringify({ id, expectedQuotas, playerId: "victim" }));
    form.set("receipt", new File([bytes], "comprobante.pdf", { type: mime }));
    return new Request("https://club.test/api/player-payments", {
      method: "POST",
      headers: { Origin: origin },
      body: form,
    });
  }
  return { route, download, records, calls, request, user };
}
test("manual payment endpoint derives the player from the session and returns one private receipt across retries", async () => {
  const x = setup();
  let response = await x.route.POST(x.request());
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.totalCents, 10000000);
  assert.deepEqual(data.periods, ["2026-10", "2026-11"]);
  assert.ok(data.receiptUrl.startsWith("/api/payment-receipts/"));
  assert.equal(x.calls.registers, 1);
  response = await x.route.POST(x.request());
  assert.equal(response.status, 200);
  assert.equal(x.calls.registers, 1);
  assert.equal(x.calls.uploads, 1);
  const record = x.records.get(id);
  assert.equal(record.playerId, "ana");
  assert.equal(record.userId, "user-ana");
  assert.equal(record.bucket, "club-payment-receipts");
  assert.match(record.objectPath, /^[a-f0-9]{32}\/[a-f0-9-]{36}\.pdf$/);
});
test("receipt endpoints deny cross-player access, unauthorized roles and cross-origin submissions", async () => {
  for (const role of [null, "fan", "coach", "admin", "treasurer"]) {
    const x = setup({ role });
    assert.equal((await x.route.POST(x.request())).status, 403);
    assert.equal(x.calls.uploads, 0);
  }
  const x = setup();
  assert.equal(
    (await x.route.POST(x.request({ origin: "https://other.test" }))).status,
    403,
  );
  assert.equal(x.calls.uploads, 0);
  x.records.set(id, { id, userId: "other-user", objectPath: "private.pdf" });
  assert.equal(
    (
      await x.download.GET(new Request("https://club.test"), {
        params: Promise.resolve({ id }),
      })
    ).status,
    404,
  );
  assert.equal(x.calls.downloads, 0);
});
test("invalid receipt bytes and stale totals are rejected before uploading", async () => {
  const x = setup();
  assert.equal(
    (await x.route.POST(x.request({ bytes: "<html>fake PDF</html>" }))).status,
    400,
  );
  assert.equal(
    (
      await x.route.POST(
        x.request({ expectedQuotas: [{ period: "2026-10", amountCents: 1 }] }),
      )
    ).status,
    400,
  );
  assert.equal(x.calls.uploads, 0);
  assert.equal(x.calls.registers, 0);
});
test("upload and quote failures leave fees untouched and clean up uncommitted objects", async () => {
  const upload = setup({ uploadFails: true });
  assert.equal((await upload.route.POST(upload.request())).status, 400);
  assert.equal(upload.calls.registers, 0);
  const quote = setup({ quoteFails: true });
  assert.equal((await quote.route.POST(quote.request())).status, 400);
  assert.equal(quote.records.size, 0);
  assert.equal(quote.calls.removes, 1);
});
test("an uncertain commit is recovered without deleting the committed receipt", async () => {
  const x = setup({ commitUncertain: true });
  const response = await x.route.POST(x.request());
  assert.equal(response.status, 200);
  assert.equal(x.records.size, 1);
  assert.equal(x.calls.removes, 0);
});
test("owners and payment administrators can download private receipts with no-cache headers", async () => {
  for (const role of ["player", "admin", "treasurer"]) {
    const x = setup({ role });
    x.records.set(id, {
      id,
      userId: role === "player" ? "user-ana" : "other",
      objectPath: "private.pdf",
      mimeType: "application/pdf",
      fileName: "comprobante.pdf",
    });
    const response = await x.download.GET(new Request("https://club.test"), {
      params: Promise.resolve({ id }),
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.match(response.headers.get("content-disposition"), /^attachment;/);
    assert.equal(x.calls.downloads, 1);
  }
});
