"use server";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/roles";
import { matchAttendanceSchema } from "@/lib/match-attendance";
import { getDataService } from "@/services/data-service";

export async function saveMatchAttendance(input: unknown) {
  const user = await getCurrentUser();
  if (!hasPermission(user, "matches:manage")) return { error: "No autorizado." };
  const parsed = matchAttendanceSchema.safeParse(input);
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  try {
    await getDataService().upsertMatchAttendance(parsed.data);
    for (const path of [
      "/match-attendance",
      "/fixture",
      "/",
      "/account",
      "/my-fee",
      "/fee-calculator",
      "/coach-records",
      "/player-of-match",
    ])
      revalidatePath(path);
    return { ok: true };
  } catch {
    return {
      error:
        "No se pudo guardar. Verificá los jugadores y que el partido no esté cargado con otra ficha.",
    };
  }
}
