"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { userToAuditActor } from "@/lib/audit";
import { hashPassword } from "@/lib/auth/passwords";
import { hasPermission } from "@/lib/auth/roles";
import { getCurrentUser } from "@/lib/auth/session";
import { getDataService } from "@/services/data-service";
import type { AuthRole } from "@/types/auth";

export interface AdminPasswordState {
  error?: string;
  ok?: boolean;
}

const passwordSchema = z
  .object({
    name: z.string().trim().min(1),
    newPassword: z
      .string()
      .min(8, "La contraseña debe tener al menos 8 caracteres.")
      .max(100, "La contraseña es demasiado larga."),
    repeatPassword: z.string().min(1, "Repetí la contraseña."),
    role: z.enum(["admin", "treasurer", "coach", "player", "fan"]),
    userId: z.string().trim().min(1),
    username: z.string().trim().min(1),
  })
  .refine((value) => value.newPassword === value.repeatPassword, {
    message: "Las contraseñas no coinciden.",
    path: ["repeatPassword"],
  });

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
