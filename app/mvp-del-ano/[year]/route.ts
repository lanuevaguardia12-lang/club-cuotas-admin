import { redirect } from "next/navigation";

import { annualMvpHref, annualMvpYearSchema } from "@/lib/annual-mvp";
import { getCurrentUser } from "@/lib/auth/session";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ year: string }> },
) {
  const year = annualMvpYearSchema.safeParse((await params).year);
  const href = annualMvpHref(year.success ? year.data : undefined);
  const user = await getCurrentUser();
  redirect(user ? href : `/login?redirectTo=${encodeURIComponent(href)}`);
}
