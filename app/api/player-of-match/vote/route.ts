import { NextRequest, NextResponse } from "next/server";
import { submitPlayerOfMatchVote } from "@/app/(dashboard)/player-of-match/actions";

export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) {
    return NextResponse.json(
      { ok: false, message: "Origen no autorizado." },
      { status: 403 },
    );
  }
  const result = await submitPlayerOfMatchVote(await request.json().catch(() => null));
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
