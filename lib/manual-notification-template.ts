import { z } from "zod";
import type { AccountUser } from "@/types/account";

export const notificationVariables = [
  "nombre",
  "apellido",
  "nombre_completo",
  "usuario",
] as const;

export const manualNotificationSchema = z
  .object({
    requestId: z.string().uuid(),
    userIds: z
      .array(z.string().trim().min(1).max(200))
      .min(1, "Seleccioná al menos un usuario.")
      .max(500),
    title: z.string().trim().min(1, "Escribí un título.").max(120),
    message: z.string().trim().min(1, "Escribí el texto.").max(2000),
  })
  .superRefine((input, context) => {
    for (const field of ["title", "message"] as const) {
      const unknown = [...input[field].matchAll(/\{\{([\s\S]*?)\}\}/g)]
        .map((match) => match[1].trim())
        .filter(
          (name) =>
            !notificationVariables.includes(
              name as (typeof notificationVariables)[number],
            ),
        );
      if (unknown.length || input[field].replace(/\{\{[\s\S]*?\}\}/g, "").match(/[{}]/)) {
        context.addIssue({
          code: "custom",
          path: [field],
          message:
            "Usá las variables disponibles: {{nombre}}, {{apellido}}, {{nombre_completo}} y {{usuario}}.",
        });
      }
    }
  });

export type ManualNotificationInput = z.infer<typeof manualNotificationSchema>;
export type NotificationRecipient = Pick<
  AccountUser,
  "userId" | "username" | "name" | "role"
>;

export function renderNotificationTemplate(
  template: string,
  user: NotificationRecipient,
) {
  const parts = user.name.trim().split(/\s+/).filter(Boolean);
  const values = {
    nombre: parts[0] || user.username,
    apellido: parts.slice(1).join(" "),
    nombre_completo: user.name.trim() || user.username,
    usuario: user.username,
  };
  return template.replace(
    /\{\{\s*(nombre_completo|nombre|apellido|usuario)\s*\}\}/g,
    (_, key: keyof typeof values) => values[key],
  );
}
