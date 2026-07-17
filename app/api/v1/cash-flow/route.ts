import { NextRequest, NextResponse } from "next/server";

import { requireApiPermission } from "@/lib/api/auth";
import { getDataService } from "@/services/data-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireApiPermission(request, "cash-flow:read");

  if (auth.response) {
    return auth.response;
  }

  const cashFlow = await getDataService().getCashFlowData();

  return NextResponse.json({ data: cashFlow });
}
