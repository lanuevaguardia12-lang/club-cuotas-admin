"use server";

import { revalidatePath, revalidateTag } from "next/cache";

import { getCurrentUser } from "@/lib/auth/session";

type RevalidateTagWithProfile = (
  tag: string,
  profile: "max" | { expire?: number },
) => void;

const revalidateTagWithProfile = revalidateTag as unknown as RevalidateTagWithProfile;

function revalidateGoogleSheetsTag(tag: string) {
  revalidateTagWithProfile(tag, "max");
}

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
    revalidateGoogleSheetsTag("google-sheets");
    revalidateGoogleSheetsTag("google-sheets:dashboard");
    revalidateGoogleSheetsTag("google-sheets:player-profile");
    revalidatePath("/mi-cuota");

    return {
      ok: true,
      message: "Buscando tu pago en el formulario...",
    };
  } catch {
    return {
      ok: false,
      message: "No se pudo buscar el pago en el formulario.",
    };
  }
}
