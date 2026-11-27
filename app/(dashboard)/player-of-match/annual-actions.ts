"use server";

import { revalidatePath } from "next/cache";

import { annualMvpYearSchema } from "@/lib/annual-mvp";
import { hasPermission } from "@/lib/auth/roles";
import { getCurrentUser } from "@/lib/auth/session";
import { AnnualMvpError, AnnualMvpStore } from "@/services/database/annual-mvp-store";

export async function submitAnnualMvpVote(
  _previous: { ok: boolean; message: string; votedFor?: string } | null,
  formData: FormData,
) {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user, "player-of-match:vote")) {
    return {
      ok: false,
      message: "La votación está disponible solo para usuarios habilitados.",
    };
  }
  const year = annualMvpYearSchema.safeParse(formData.get("year"));
  const candidateId = formData.get("candidateId");
  if (
    !year.success ||
    typeof candidateId !== "string" ||
    !candidateId ||
    candidateId.length > 500
  ) {
    return { ok: false, message: "Elegí un jugador de la votación." };
  }

  try {
    const votedFor = await new AnnualMvpStore().vote(year.data, candidateId, user);
    revalidatePath("/player-of-match");
    return { ok: true, message: "Voto registrado correctamente.", votedFor };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof AnnualMvpError
          ? error.message
          : "No se pudo registrar el voto. Intentá de nuevo.",
    };
  }
}
