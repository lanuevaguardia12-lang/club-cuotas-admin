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

const ARGENTINA_TIME_ZONE = "America/Argentina/Buenos_Aires";
const SPANISH_MONTH_NAME_PATTERN =
  /\b(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)(?:\s+de\s+\d{4})?\b/gi;

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

export function normalizeReminderMessageMonth(message: string, currentMonth: string) {
  const normalizedCurrentMonth = currentMonth.trim();

  if (!normalizedCurrentMonth) {
    return message;
  }

  return message.replace(SPANISH_MONTH_NAME_PATTERN, normalizedCurrentMonth);
}

export function sanitizeWhatsAppPhone(phone: string) {
  return phone.replace(/\D/g, "");
}

export function getCurrentReminderPeriod(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    month: "2-digit",
    timeZone: ARGENTINA_TIME_ZONE,
    year: "numeric",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;

  return `${year}-${month}`;
}

export function getCurrentMonthLabel(date = new Date()) {
  return formatReminderPeriodLabel(getCurrentReminderPeriod(date));
}

export function formatReminderPeriodLabel(period: string) {
  const [year, month] = period.split("-").map(Number);

  if (!Number.isFinite(year) || !Number.isFinite(month)) {
    return period;
  }

  const safeDate = new Date(Date.UTC(year, month - 1, 15, 12));

  return new Intl.DateTimeFormat("es-AR", {
    month: "long",
    timeZone: "UTC",
    year: "numeric",
  }).format(safeDate);
}
