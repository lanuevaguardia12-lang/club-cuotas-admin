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

  const dashboard = await getDataService().getDashboardData();

  return NextResponse.json({ data: dashboard });
}
