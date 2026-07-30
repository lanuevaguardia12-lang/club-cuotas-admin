"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  DEFAULT_AUTH_REDIRECT,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
} from "@/lib/auth/constants";
import { createSessionToken } from "@/lib/auth/jwt";
import { getSafeRedirectPath } from "@/lib/auth/redirects";
import { userToAuditActor } from "@/lib/audit";
import { createAuthService } from "@/services/auth/auth-service";
import { getDataService } from "@/services/data-service";
import type { AuthUser } from "@/types/auth";

export interface LoginState {
  error?: string;
}

export async function loginAction(
  _previousState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const requestedRedirectTo =
    getSafeRedirectPath(formData.get("redirectTo")) ?? DEFAULT_AUTH_REDIRECT;

  if (!username || !password) {
    return {
      error: "Ingresa usuario y contraseña.",
    };
  }

  let token: string;
  let authenticatedUser: AuthUser;

  try {
    const authService = createAuthService();
    const user = await authService.authenticate({ username, password });

    if (!user) {
      return {
        error: "Credenciales invalidas.",
      };
    }

    authenticatedUser = user;
    token = await createSessionToken(user);
  } catch {
    return {
      error: "No se pudo iniciar sesion. Revisa la configuracion de entorno.",
    };
  }

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });

  await getDataService()
    .recordAuditEvent({
      actor: userToAuditActor(authenticatedUser),
      action: "auth.login",
      entityType: "auth",
      entityId: authenticatedUser.id,
      summary: `${authenticatedUser.name} inicio sesion.`,
    })
    .catch(() => undefined);

  const redirectTo =
    authenticatedUser.role === "player" && requestedRedirectTo === DEFAULT_AUTH_REDIRECT
      ? "/mi-cuota"
      : requestedRedirectTo;

  redirect(redirectTo);
}
