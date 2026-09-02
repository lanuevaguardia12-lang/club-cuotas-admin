"use server";

import { z } from "zod";

import { userToAuditActor } from "@/lib/audit";
import { assertPermission } from "@/lib/auth/roles";
import { getCurrentUser } from "@/lib/auth/session";
import { sendCoachRecordsEmailReport } from "@/lib/coach-records-email";

const sendCoachRecordsEmailSchema = z.object({
  period: z.string().regex(/^\d{4}-\d{2}$/, "El periodo debe tener formato AAAA-MM."),
});

export async function sendCoachRecordsEmail(input: unknown) {
  const user = await getCurrentUser();

  if (!user) {
    return { error: "No autorizado." };
  }

  assertPermission(user, "coach-records:manage");

  const parsed = sendCoachRecordsEmailSchema.safeParse(input);

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Periodo inválido." };
  }

  try {
    await sendCoachRecordsEmailReport({
      actor: userToAuditActor(user),
      period: parsed.data.period,
      trigger: "admin",
    });

    return { ok: true };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "No se pudo enviar el correo del desglose DT.",
    };
  }
}
