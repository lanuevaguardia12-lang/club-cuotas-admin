"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { userToAuditActor } from "@/lib/audit";
import { hashPassword } from "@/lib/auth/passwords";
import { hasPermission } from "@/lib/auth/roles";
import { getCurrentUser } from "@/lib/auth/session";
import { getConfiguredAuthUsers } from "@/services/auth/env-admin-user-store";
import { getDataService } from "@/services/data-service";
import type { AuthRole } from "@/types/auth";

export interface AdminPasswordState {
  error?: string;
  ok?: boolean;
}

export interface AdminCreateUserState {
  error?: string;
  ok?: boolean;
  username?: string;
}

const roleSchema = z.enum(["admin", "treasurer", "coach", "player", "fan"]);

const passwordSchema = z
  .object({
    name: z.string().trim().min(1),
    newPassword: z
      .string()
      .min(8, "La contraseña debe tener al menos 8 caracteres.")
      .max(100, "La contraseña es demasiado larga."),
    repeatPassword: z.string().min(1, "Repetí la contraseña."),
    role: roleSchema,
    userId: z.string().trim().min(1),
    username: z.string().trim().min(1),
  })
  .refine((value) => value.newPassword === value.repeatPassword, {
    message: "Las contraseñas no coinciden.",
    path: ["repeatPassword"],
  });

const createUserSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, "Ingresá el nombre del usuario.")
      .max(100, "El nombre es demasiado largo."),
    newPassword: z
      .string()
      .min(8, "La contraseña debe tener al menos 8 caracteres.")
      .max(100, "La contraseña es demasiado larga."),
    repeatPassword: z.string().min(1, "Repetí la contraseña."),
    role: roleSchema,
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
  .refine((value) => value.newPassword === value.repeatPassword, {
    message: "Las contraseñas no coinciden.",
    path: ["repeatPassword"],
  });

export async function createUserAsAdmin(
  _previousState: AdminCreateUserState,
  formData: FormData,
): Promise<AdminCreateUserState> {
  const currentUser = await getCurrentUser();

  if (!currentUser || !hasPermission(currentUser, "users:manage")) {
    return { error: "No tenés permisos para administrar usuarios." };
  }

  const parsed = createUserSchema.safeParse({
    name: String(formData.get("name") ?? ""),
    newPassword: String(formData.get("newPassword") ?? ""),
    repeatPassword: String(formData.get("repeatPassword") ?? ""),
    role: String(formData.get("role") ?? "coach"),
    username: String(formData.get("username") ?? ""),
  });

  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Revisá los datos del usuario.",
    };
  }

  const data = parsed.data;
  const username = data.username.trim().toLowerCase();
  const userId = `${data.role}-${slugify(username)}`;
  const configuredUserExists = getConfiguredAuthUsers().some(
    (user) => user.username.toLowerCase() === username || user.id === userId,
  );
  const dataService = getDataService();

  if (configuredUserExists) {
    return {
      error: "Ya existe un usuario con ese username en las variables de entorno.",
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

  try {
    await dataService.createAccountUser({
      name: data.name,
      passwordHash: hashPassword(data.newPassword),
      role: data.role as AuthRole,
      userId,
      username,
    });
  } catch {
    return {
      error: "No se pudo crear el usuario. Revisá la conexión con Google Sheets.",
    };
  }

  await dataService
    .recordAuditEvent({
      actor: userToAuditActor(currentUser),
      action: "api.request",
      entityType: "auth",
      entityId: userId,
      summary: `Usuario ${data.name} creado por admin.`,
    })
    .catch(() => undefined);

  revalidatePath("/users");

  return { ok: true, username };
}

export async function changeUserPasswordAsAdmin(
  _previousState: AdminPasswordState,
  formData: FormData,
): Promise<AdminPasswordState> {
  const currentUser = await getCurrentUser();

  if (!currentUser || !hasPermission(currentUser, "users:manage")) {
    return { error: "No tenés permisos para administrar usuarios." };
  }

  const parsed = passwordSchema.safeParse({
    name: String(formData.get("name") ?? ""),
    newPassword: String(formData.get("newPassword") ?? ""),
    repeatPassword: String(formData.get("repeatPassword") ?? ""),
    role: String(formData.get("role") ?? ""),
    userId: String(formData.get("userId") ?? ""),
    username: String(formData.get("username") ?? ""),
  });

  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Revisá la contraseña.",
    };
  }

  const data = parsed.data;

  await getDataService().updateAccountPassword({
    name: data.name,
    passwordHash: hashPassword(data.newPassword),
    role: data.role as AuthRole,
    userId: data.userId,
    username: data.username,
  });
  await getDataService()
    .recordAuditEvent({
      actor: userToAuditActor(currentUser),
      action: "api.request",
      entityType: "auth",
      entityId: data.userId,
      summary: `Contraseña actualizada por admin para ${data.name}.`,
    })
    .catch(() => undefined);

  revalidatePath("/users");

  return { ok: true };
}

function slugify(value: string) {
  return (
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "usuario"
  );
}
