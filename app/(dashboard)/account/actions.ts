"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { userToAuditActor } from "@/lib/audit";
import { hashPassword } from "@/lib/auth/passwords";
import { getCurrentUser } from "@/lib/auth/session";
import { createAuthService } from "@/services/auth/auth-service";
import { getDataService } from "@/services/data-service";

const MAX_PROFILE_PHOTO_LENGTH = 45000;

const accountProfileSchema = z.object({
  birthDate: z.string().trim().max(20).optional(),
  dni: z.string().trim().max(20).optional(),
  email: z.string().trim().email("Ingresá un email válido.").optional().or(z.literal("")),
  name: z.string().trim().min(2, "Ingresá tu nombre.").max(120),
  phone: z.string().trim().max(40).optional(),
  position: z.string().trim().max(80).optional(),
  profilePhotoDataUrl: z
    .string()
    .trim()
    .max(MAX_PROFILE_PHOTO_LENGTH, "La foto es demasiado grande.")
    .refine(
      (value) => !value || /^data:image\/(png|jpeg|webp);base64,/.test(value),
      "La foto debe ser una imagen válida.",
    )
    .optional(),
  secondPosition: z.string().trim().max(80).optional(),
});

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, "Ingresá tu contraseña actual."),
    newPassword: z
      .string()
      .min(8, "La nueva contraseña debe tener al menos 8 caracteres.")
      .max(100, "La contraseña es demasiado larga."),
    repeatPassword: z.string().min(1, "Repetí la nueva contraseña."),
  })
  .refine((value) => value.newPassword === value.repeatPassword, {
    message: "Las contraseñas nuevas no coinciden.",
    path: ["repeatPassword"],
  });

export async function saveAccountProfile(input: unknown) {
  const user = await getCurrentUser();

  if (!user) {
    return { message: "Iniciá sesión para editar tu cuenta.", ok: false };
  }

  const parsed = accountProfileSchema.safeParse(input);

  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Revisá los datos.",
    };
  }

  const dataService = getDataService();

  await dataService.updateAccountProfile({
    ...parsed.data,
    email: parsed.data.email || undefined,
    phone: parsed.data.phone || undefined,
    profilePhotoDataUrl: parsed.data.profilePhotoDataUrl || undefined,
    role: user.role,
    playerId: user.playerId,
    userId: user.id,
    username: user.username,
  });
  await dataService
    .recordAuditEvent({
      actor: userToAuditActor(user),
      action: "api.request",
      entityType: "auth",
      entityId: user.id,
      summary: "Perfil de cuenta actualizado.",
    })
    .catch(() => undefined);

  revalidatePath("/account");

  return { message: "Cuenta actualizada.", ok: true };
}

export async function changeAccountPassword(input: unknown) {
  const user = await getCurrentUser();

  if (!user) {
    return { message: "Iniciá sesión para cambiar tu contraseña.", ok: false };
  }

  const parsed = passwordSchema.safeParse(input);

  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Revisá la contraseña.",
    };
  }

  const authenticatedUser = await createAuthService().authenticate({
    password: parsed.data.currentPassword,
    username: user.username,
  });

  if (!authenticatedUser || authenticatedUser.id !== user.id) {
    return { message: "La contraseña actual no es correcta.", ok: false };
  }

  const dataService = getDataService();

  await dataService.updateAccountPassword({
    name: user.name,
    passwordHash: hashPassword(parsed.data.newPassword),
    role: user.role,
    userId: user.id,
    username: user.username,
  });
  await dataService
    .recordAuditEvent({
      actor: userToAuditActor(user),
      action: "api.request",
      entityType: "auth",
      entityId: user.id,
      summary: "Contraseña de cuenta actualizada.",
    })
    .catch(() => undefined);

  revalidatePath("/account");

  return { message: "Contraseña actualizada.", ok: true };
}
