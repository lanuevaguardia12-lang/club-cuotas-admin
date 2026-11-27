"use server";

import { revalidatePath } from "next/cache";

import { annualMvpYearSchema, getAnnualMvpCandidates } from "@/lib/annual-mvp";
import { hasPermission } from "@/lib/auth/roles";
import { getCurrentUser } from "@/lib/auth/session";
import { attendanceToday } from "@/lib/match-attendance";
import { getDataService } from "@/services/data-service";
import { AnnualMvpError, AnnualMvpStore } from "@/services/database/annual-mvp-store";

export async function manageAnnualMvpSurvey(
  _previous: { ok: boolean; message: string } | null,
  formData: FormData,
) {
  const user = await getCurrentUser();
  if (!hasPermission(user, "surveys:manage")) {
    return { ok: false, message: "Solo un administrador puede gestionar encuestas." };
  }
  const year = annualMvpYearSchema.safeParse(formData.get("year"));
  const today = attendanceToday();
  if (!year.success || year.data > Number(today.slice(0, 4))) {
    return { ok: false, message: "Elegí un año válido." };
  }
  const intent = formData.get("intent");
  if (intent !== "publish" && intent !== "close") {
    return { ok: false, message: "Elegí una acción válida." };
  }

  try {
    const store = new AnnualMvpStore();
    if (intent === "publish") {
      const attendance = await getDataService().getMatchAttendanceData();
      await store.publish(
        year.data,
        getAnnualMvpCandidates(attendance, year.data, today),
      );
    } else {
      await store.close(year.data);
    }
    revalidatePath("/encuestas");
    revalidatePath("/player-of-match");
    revalidatePath("/notifications");
    return {
      ok: true,
      message: intent === "publish" ? "Votación publicada." : "Votación cerrada.",
    };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof AnnualMvpError
          ? error.message
          : "No se pudo guardar la votación. Intentá de nuevo.",
    };
  }
}
