import { createHmac, timingSafeEqual } from "node:crypto";

interface StripeSignatureVerificationInput {
  payload: string;
  signatureHeader: string | null;
  secret: string;
  toleranceSeconds?: number;
}

interface MercadoPagoSignatureVerificationInput {
  xSignature: string | null;
  xRequestId: string | null;
  dataId: string | null;
  secret: string;
}

export function verifyStripeSignature({
  payload,
  signatureHeader,
  secret,
  toleranceSeconds = 300,
}: StripeSignatureVerificationInput) {
  if (!signatureHeader) {
    return false;
  }

  const parts = parseSignatureHeader(signatureHeader);
  const timestamp = Number(parts.get("t"));
  const signatures = parts.getAll("v1");

  if (!Number.isFinite(timestamp) || signatures.length === 0) {
    return false;
  }

  const age = Math.abs(Math.floor(Date.now() / 1000) - timestamp);

  if (age > toleranceSeconds) {
    return false;
  }

  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${payload}`, "utf8")
    .digest("hex");

  return signatures.some((signature) => safeCompareHex(signature, expected));
}

export function verifyMercadoPagoSignature({
  xSignature,
  xRequestId,
  dataId,
  secret,
}: MercadoPagoSignatureVerificationInput) {
  if (!xSignature || !xRequestId || !dataId) {
    return false;
  }

  const parts = parseSignatureHeader(xSignature);
  const timestamp = parts.get("ts");
  const signature = parts.get("v1");

  if (!timestamp || !signature) {
    return false;
  }

  const manifest = `id:${dataId};request-id:${xRequestId};ts:${timestamp};`;
  const expected = createHmac("sha256", secret).update(manifest).digest("hex");

  return safeCompareHex(signature, expected);
}

function parseSignatureHeader(header: string) {
  const entries = header.split(",").flatMap((part) => {
    const [key, value] = part.split("=");

    if (!key || !value) {
      return [];
    }

    return [[key.trim(), value.trim()] as const];
  });

  return {
    get(key: string) {
      return entries.find(([entryKey]) => entryKey === key)?.[1];
    },
    getAll(key: string) {
      return entries.filter(([entryKey]) => entryKey === key).map(([, value]) => value);
    },
  };
}

function safeCompareHex(left: string, right: string) {
  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}
