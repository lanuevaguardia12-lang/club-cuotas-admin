"use client";

import { Bot } from "lucide-react";
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
  skippedUndefinedFee?: number;
  totalPending: number;
}

export function RunWhatsAppReminderBotButton({
  period,
}: RunWhatsAppReminderBotButtonProps) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const selectedPeriodLabel = formatPeriodLabel(period);

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
        `Mes ${result?.periodLabel ?? formatPeriodLabel(period)}. Pendientes con cuota definida ${result?.totalPending ?? 0}. ${target} ${result?.queued ?? 0}. Ya estaban en cola ${result?.skippedAlreadyQueued ?? 0}. Sin telefono ${result?.skippedNoPhone ?? 0}. Sin cuota definida ${result?.skippedUndefinedFee ?? 0}. Registros fallidos ${result?.reminderRecordsFailed ?? 0}.`,
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
      <p className="text-muted-foreground text-xs sm:text-right">
        Mes a enviar: {selectedPeriodLabel}
      </p>
      {message ? (
        <p className="text-muted-foreground max-w-sm text-xs sm:text-right">{message}</p>
      ) : null}
    </div>
  );
}

function formatPeriodLabel(period: string) {
  const [year, month] = period.split("-").map(Number);
  const date = new Date(year, month - 1, 1);

  return new Intl.DateTimeFormat("es-AR", {
    month: "long",
    year: "numeric",
  }).format(date);
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
