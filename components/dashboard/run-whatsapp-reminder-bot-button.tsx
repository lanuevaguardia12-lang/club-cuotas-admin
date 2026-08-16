"use client";

import { Bot } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { LoadingModal } from "@/components/ui/loading-modal";

interface RunWhatsAppReminderBotButtonProps {
  period: string;
}

interface RunWhatsAppReminderBotResponse {
  mode?: "local-queue" | "webhook";
  period: string;
  periodLabel: string;
  queued: number;
  reminderRecordsFailed?: number;
  skippedAlreadyQueued?: number;
  skippedNoPhone: number;
  totalPending: number;
}

export function RunWhatsAppReminderBotButton({
  period,
}: RunWhatsAppReminderBotButtonProps) {
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const selectedPeriod = getSelectedPeriod(searchParams.get("period"), period);

  async function runBot() {
    setLoading(true);
    setMessage("");

    try {
      const response = await fetch("/api/bot/whatsapp-reminders", {
        body: JSON.stringify({ period: selectedPeriod }),
        headers: {
          "content-type": "application/json",
        },
        method: "POST",
      });
      const responseText = await response.text();
      const result = parseBotResponse(responseText);

      if (!response.ok) {
        throw new Error(
          result?.message ??
            responseText.slice(0, 240) ??
            `No se pudo correr el bot de recordatorios. HTTP ${response.status}.`,
        );
      }

      const target =
        result?.mode === "webhook" ? "Enviados al bot" : "En cola para tu PC";

      setMessage(
        `Mes ${result?.periodLabel ?? selectedPeriod}. Pendientes ${result?.totalPending ?? 0}. ${target} ${result?.queued ?? 0}. Ya estaban en cola ${result?.skippedAlreadyQueued ?? 0}. Sin telefono ${result?.skippedNoPhone ?? 0}. Registros fallidos ${result?.reminderRecordsFailed ?? 0}.`,
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
        description="Preparando pendientes del mes y dejandolos listos para el bot..."
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

function getSelectedPeriod(urlPeriod: string | null, fallback: string) {
  return urlPeriod && /^\d{4}-\d{2}$/.test(urlPeriod) ? urlPeriod : fallback;
}

function parseBotResponse(responseText: string) {
  if (!responseText) {
    return null;
  }

  try {
    return JSON.parse(responseText) as Partial<RunWhatsAppReminderBotResponse> & {
      message?: string;
    };
  } catch {
    return null;
  }
}
