export const REMINDER_TEMPLATE_STORAGE_KEY = "club-cuotas-reminder-template";

export const DEFAULT_REMINDER_TEMPLATE =
  process.env.NEXT_PUBLIC_REMINDER_TEMPLATE ??
  "Buenas {nombre}, ¿cómo estás? Porfa acordate de pagar la cuota de {mes}.\nEl monto es {monto}.\nY completar el formulario! https://forms.gle/FFmGxDKRM4UNhM5h6";

export interface ReminderTemplateValues {
  clubName: string;
  playerName: string;
  currentMonth: string;
  feeAmount: string;
}

export function buildReminderMessage(template: string, values: ReminderTemplateValues) {
  return template
    .replaceAll("{nombre}", values.playerName)
    .replaceAll("{mes}", values.currentMonth)
    .replaceAll("{monto}", values.feeAmount)
    .replaceAll("{club}", values.clubName)
    .replaceAll("((nombre del jugador))", values.playerName)
    .replaceAll("((mes de la cuota))", values.currentMonth)
    .replaceAll("((monto de la cuota del mes))", values.feeAmount);
}

export function sanitizeWhatsAppPhone(phone: string) {
  return phone.replace(/\D/g, "");
}

export function getCurrentMonthLabel(date = new Date()) {
  return new Intl.DateTimeFormat("es-AR", {
    month: "long",
    year: "numeric",
  }).format(date);
}
