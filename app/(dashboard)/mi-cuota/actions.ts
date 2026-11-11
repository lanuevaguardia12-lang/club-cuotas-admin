"use server";

import { revalidatePath, unstable_expireTag } from "next/cache";

import { getCurrentUser } from "@/lib/auth/session";

export interface RefreshMyFeeFromFormsActionResult {
  ok: boolean;
  message: string;
}

export async function refreshMyFeeFromFormsAction(): Promise<RefreshMyFeeFromFormsActionResult> {
  const user = await getCurrentUser();

  if (!user) {
    return {
      ok: false,
      message: "Iniciá sesión para actualizar tu cuota.",
    };
  }

  if (user.role !== "player") {
    return {
      ok: false,
      message: "Esta actualización está pensada para usuarios jugadores.",
    };
  }

  try {
    unstable_expireTag(
      "google-sheets:dashboard",
      "google-sheets:player-profile",
      "google-sheets:fee-calculator",
    );
    revalidatePath("/");
    revalidatePath("/mi-cuota");

    return {
      ok: true,
      message: "Consulta actualizada. Revisá el estado de tu cuota.",
    };
  } catch {
    return {
      ok: false,
      message: "No se pudo buscar el pago en el formulario.",
    };
  }
}
