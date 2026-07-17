import "server-only";

import { cookies } from "next/headers";

import { SESSION_COOKIE_NAME } from "@/lib/auth/constants";
import { verifySessionToken } from "@/lib/auth/jwt";

export async function getCurrentSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  return verifySessionToken(token);
}

export async function getCurrentUser() {
  const session = await getCurrentSession();

  return session?.user ?? null;
}
