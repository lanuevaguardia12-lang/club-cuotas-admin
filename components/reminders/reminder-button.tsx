"use client";

import { MessageCircle } from "lucide-react";

import { useAppSettings } from "@/components/providers/app-settings-provider";
import { Button } from "@/components/ui/button";
import {
  buildReminderMessage,
  getCurrentMonthLabel,
  sanitizeWhatsAppPhone,
} from "@/lib/reminders";

interface ReminderButtonProps {
  playerName: string;
  phone: string;
  size?: "sm" | "default";
  variant?: "default" | "outline" | "ghost";
}

export function ReminderButton({
  playerName,
  phone,
  size = "sm",
  variant = "outline",
}: ReminderButtonProps) {
  const { settings } = useAppSettings();
  const sanitizedPhone = sanitizeWhatsAppPhone(phone);
  const disabled = sanitizedPhone.length === 0;

  function handleClick() {
    const message = buildReminderMessage(settings.whatsAppMessageTemplate, {
      clubName: settings.clubName,
      playerName,
      currentMonth: getCurrentMonthLabel(),
    });
    const url = `https://wa.me/${sanitizedPhone}?text=${encodeURIComponent(message)}`;

    window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      onClick={handleClick}
      disabled={disabled}
      aria-label={`Enviar recordatorio a ${playerName}`}
    >
      <MessageCircle />
      Enviar recordatorio
    </Button>
  );
}
