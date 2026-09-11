import type { AppNotification, ReminderJob } from "@/types/premium";

export const WHATSAPP_BOT_REMINDER_MARKER = "channel:whatsapp-bot";
const WHATSAPP_BOT_RUN_ID_PREFIX = "whatsapp-reminders:";

export function buildWhatsAppBotReminderMarker(runId: string) {
  return `${WHATSAPP_BOT_REMINDER_MARKER};run:${runId}`;
}

export function isWhatsAppBotReminder(reminder: ReminderJob) {
  return reminder.error?.includes(WHATSAPP_BOT_REMINDER_MARKER) ?? false;
}

export function getWhatsAppBotReminderRunId(reminder: ReminderJob) {
  const [, runId = ""] = reminder.error?.match(/run:([^;]+)/) ?? [];

  return runId;
}

export function isWhatsAppBotNotification(
  notification: Pick<AppNotification, "referenceId" | "title">,
) {
  return (
    notification.referenceId?.startsWith(WHATSAPP_BOT_RUN_ID_PREFIX) === true ||
    notification.title.trim().toLowerCase() === "bot de recordatorios iniciado"
  );
}
