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
  if (!parsed.data.id && !parsed.data.fixtureId)
    return { error: "Abrí el partido desde el fixture para cargar su asistencia." };
  let id: string;
  try {
    id = await getDataService().upsertMatchAttendance(parsed.data);
  } catch {
    return {
      error:
        "No se pudo guardar. Verificá los jugadores y que el partido no esté cargado con otra ficha.",
    };
  }
  try {
    for (const path of [
      "/match-attendance",
      "/fixture",
      "/",
      "/account",
      "/mi-cuota",
      "/fee-calculator",
      "/coach-records",
      "/player-of-match",
    ])
      revalidatePath(path);
    return { ok: true, id };
  } catch {
    return {
      ok: true,
      id,
      warning:
        "La asistencia se guardó. Recargá la página para actualizar las otras vistas.",
    };
  }
}
