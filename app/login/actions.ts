"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import {
  DEFAULT_AUTH_REDIRECT,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
} from "@/lib/auth/constants";
import { createSessionToken } from "@/lib/auth/jwt";
import { hashPassword } from "@/lib/auth/passwords";
import { getSafeRedirectPath } from "@/lib/auth/redirects";
import { systemAuditActor, userToAuditActor } from "@/lib/audit";
import { createAuthService } from "@/services/auth/auth-service";
import { getConfiguredAuthUsers } from "@/services/auth/env-admin-user-store";
import { getDataService } from "@/services/data-service";
import type { AuthUser } from "@/types/auth";

export interface LoginState {
  error?: string;
}

export interface FanSignupState {
  error?: string;
}

const fanSignupSchema = z
  .object({
    birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ingresá una fecha válida."),
    firstName: z
      .string()
      .trim()
      .min(2, "Ingresá tu nombre.")
      .max(80, "El nombre es demasiado largo."),
    lastName: z
      .string()
      .trim()
      .min(2, "Ingresá tu apellido.")
      .max(80, "El apellido es demasiado largo."),
    password: z
      .string()
      .min(8, "La contraseña debe tener al menos 8 caracteres.")
      .max(100, "La contraseña es demasiado larga."),
    repeatPassword: z.string().min(1, "Repetí la contraseña."),
    username: z
      .string()
      .trim()
      .min(3, "El usuario debe tener al menos 3 caracteres.")
      .max(40, "El usuario es demasiado largo.")
      .regex(
        /^[a-zA-Z0-9._-]+$/,
        "Usá solo letras, números, puntos, guiones o guion bajo.",
      ),
  })
  .refine((value) => value.password === value.repeatPassword, {
    message: "Las contraseñas no coinciden.",
    path: ["repeatPassword"],
  });

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
      : authenticatedUser.role === "fan" && requestedRedirectTo === DEFAULT_AUTH_REDIRECT
        ? "/account"
        : requestedRedirectTo;

  redirect(redirectTo);
}

export async function registerFanAction(
  _previousState: FanSignupState,
  formData: FormData,
): Promise<FanSignupState> {
  const parsed = fanSignupSchema.safeParse({
    birthDate: String(formData.get("birthDate") ?? ""),
    firstName: String(formData.get("firstName") ?? ""),
    lastName: String(formData.get("lastName") ?? ""),
    password: String(formData.get("password") ?? ""),
    repeatPassword: String(formData.get("repeatPassword") ?? ""),
    username: String(formData.get("username") ?? ""),
  });

  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Revisá los datos.",
    };
  }

  const username = parsed.data.username.trim().toLowerCase();
  const name = `${parsed.data.firstName.trim()} ${parsed.data.lastName.trim()}`;
  const userId = `fan-${slugify(username)}`;
  const configuredUserExists = getConfiguredAuthUsers().some(
    (user) => user.username.toLowerCase() === username || user.id === userId,
  );
  const dataService = getDataService();

  if (configuredUserExists) {
    return {
      error: "Ya existe una cuenta con ese usuario.",
    };
  }

  const existingAccount = await dataService
    .getAccountAuthByUsername(username)
    .catch(() => null);

  if (existingAccount) {
    return {
      error: "Ya existe una cuenta con ese usuario.",
    };
  }

  const fanUser: AuthUser = {
    id: userId,
    username,
    name,
    role: "fan",
  };

  try {
    await dataService.createFanAccount({
      birthDate: parsed.data.birthDate,
      name,
      passwordHash: hashPassword(parsed.data.password),
      userId,
      username,
    });
  } catch {
    return {
      error: "No se pudo crear el usuario fan. Intentá de nuevo.",
    };
  }

  const token = await createSessionToken(fanUser);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });

  await dataService
    .recordAuditEvent({
      actor: systemAuditActor,
      action: "api.request",
      entityType: "auth",
      entityId: userId,
      summary: `Cuenta fan creada para ${name}.`,
    })
    .catch(() => undefined);

  redirect("/account");
}

function slugify(value: string) {
  return (
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "fan"
  );
}
