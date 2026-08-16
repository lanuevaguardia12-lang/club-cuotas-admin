"use client";

import { Bot } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { LoadingModal } from "@/components/ui/loading-modal";

interface RunWhatsAppReminderBotButtonProps {
  period: string;
}

interface RunWhatsAppReminderBotResponse {
  period: string;
  periodLabel: string;
  queued: number;
  reminderRecordsFailed?: number;
  skippedNoPhone: number;
  totalPending: number;
}

export function RunWhatsAppReminderBotButton({
  period,
}: RunWhatsAppReminderBotButtonProps) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function runBot() {
    setLoading(true);
    setMessage("");

    try {
      const response = await fetch("/api/bot/whatsapp-reminders", {
        body: JSON.stringify({ period }),
        headers: {
          "content-type": "application/json",
        },
        method: "POST",
      });
      const result = (await response.json().catch(() => null)) as
        (Partial<RunWhatsAppReminderBotResponse> & { message?: string }) | null;

      if (!response.ok) {
        throw new Error(result?.message ?? "No se pudo correr el bot de recordatorios.");
      }

      setMessage(
        `Mes ${result?.periodLabel ?? period}. Pendientes ${result?.totalPending ?? 0}. Enviados al bot ${result?.queued ?? 0}. Sin telefono ${result?.skippedNoPhone ?? 0}. Registros fallidos ${result?.reminderRecordsFailed ?? 0}.`,
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "No se pudo correr el bot de recordatorios.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 sm:items-end">
      <LoadingModal
        open={loading}
        title="Corriendo bot"
        description="Preparando pendientes del mes y enviandolos al bot externo..."
      />
      <Button type="button" variant="outline" onClick={runBot} disabled={loading}>
        <Bot />
        Correr bot recordatorios
      </Button>
      {message ? (
        <p className="text-muted-foreground max-w-sm text-xs sm:text-right">{message}</p>
      ) : null}
    </div>
  );
}
