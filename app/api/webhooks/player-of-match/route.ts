import { timingSafeEqual } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import { apiAuditActor } from "@/lib/audit";
import {
  expirePlayerOfMatchCache,
  sendOpenPlayerOfMatchNotifications,
} from "@/lib/player-of-match-notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  }

  expirePlayerOfMatchCache();

  const result = await sendOpenPlayerOfMatchNotifications({
    actor: apiAuditActor,
    trigger: "webhook",
  });

  return NextResponse.json(result);
}

function isAuthorized(request: NextRequest) {
  const authorization = request.headers.get("authorization");
  const token = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : "";
  const allowedSecrets = [process.env.CRON_SECRET, process.env.API_SECRET].filter(
    (secret): secret is string => Boolean(secret),
  );

  return Boolean(token) && allowedSecrets.some((secret) => safeCompare(token, secret));
}

function safeCompare(value: string, expected: string) {
  const valueBuffer = Buffer.from(value);
  const expectedBuffer = Buffer.from(expected);

  return (
    valueBuffer.length === expectedBuffer.length &&
    timingSafeEqual(valueBuffer, expectedBuffer)
  );
}
