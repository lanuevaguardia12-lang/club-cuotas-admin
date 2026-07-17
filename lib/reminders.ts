export const REMINDER_TEMPLATE_STORAGE_KEY = "club-cuotas-reminder-template";

export const DEFAULT_REMINDER_TEMPLATE =
  process.env.NEXT_PUBLIC_REMINDER_TEMPLATE ??
  "Hola {nombre}.\n\nTe recordamos que la cuota del mes actual figura pendiente.\n\nMuchas gracias.\n\nLa Nueva Guardia.";

export interface ReminderTemplateValues {
  clubName: string;
  playerName: string;
  currentMonth: string;
}

export function buildReminderMessage(template: string, values: ReminderTemplateValues) {
  return template
    .replaceAll("{nombre}", values.playerName)
    .replaceAll("{mes}", values.currentMonth)
    .replaceAll("{club}", values.clubName);
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
