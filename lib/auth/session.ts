import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";

import { SESSION_COOKIE_NAME } from "@/lib/auth/constants";
import { verifySessionToken } from "@/lib/auth/jwt";

export const getCurrentSession = cache(async () => {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  return verifySessionToken(token);
});

export const getCurrentUser = cache(async () => {
  const session = await getCurrentSession();

  return session?.user ?? null;
});
