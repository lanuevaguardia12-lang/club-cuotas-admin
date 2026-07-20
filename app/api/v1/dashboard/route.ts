import { NextRequest, NextResponse } from "next/server";

import { requireApiPermission } from "@/lib/api/auth";
import { getDataService } from "@/services/data-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireApiPermission(request, "dashboard:read");

  if (auth.response) {
    return auth.response;
  }

  const period = /^\d{4}-\d{2}$/.test(request.nextUrl.searchParams.get("period") ?? "")
    ? (request.nextUrl.searchParams.get("period") ?? undefined)
    : undefined;
  const dashboard = await getDataService().getDashboardData(period);

  return NextResponse.json({ data: dashboard });
}
