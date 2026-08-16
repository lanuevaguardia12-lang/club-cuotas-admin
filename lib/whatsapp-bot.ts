import type { ReminderJob } from "@/types/premium";

export const WHATSAPP_BOT_REMINDER_MARKER = "channel:whatsapp-bot";

export function buildWhatsAppBotReminderMarker(runId: string) {
  return `${WHATSAPP_BOT_REMINDER_MARKER};run:${runId}`;
}

export function isWhatsAppBotReminder(reminder: ReminderJob) {
  return reminder.error?.includes(WHATSAPP_BOT_REMINDER_MARKER) ?? false;
}
