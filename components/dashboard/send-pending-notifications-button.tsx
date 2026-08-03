"use client";

import { BellRing } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { LoadingModal } from "@/components/ui/loading-modal";

interface SendPendingNotificationsButtonProps {
  period: string;
}

interface SendPendingNotificationsResponse {
  failed: number;
  period: string;
  sent: number;
  skipped: number;
  totalPending: number;
}

export function SendPendingNotificationsButton({
  period,
}: SendPendingNotificationsButtonProps) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function sendNotifications() {
    setLoading(true);
    setMessage("");

    try {
      const response = await fetch("/api/cron/player-fee-reminders", {
        body: JSON.stringify({ period }),
        headers: {
          "content-type": "application/json",
        },
        method: "POST",
      });

      if (!response.ok) {
        const error = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;

        throw new Error(error?.message ?? "No se pudieron enviar las notificaciones.");
      }

      const result = (await response.json()) as SendPendingNotificationsResponse;

      setMessage(
        `Pendientes ${result.totalPending}. Enviadas ${result.sent}. Sin dispositivo ${result.skipped}. Fallidas ${result.failed}.`,
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "No se pudieron enviar las notificaciones.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 sm:items-end">
      <LoadingModal
        open={loading}
        description="Enviando notificaciones a jugadores pendientes..."
      />
      <Button type="button" onClick={sendNotifications} disabled={loading}>
        <BellRing />
        Enviar notificacion a pendientes
      </Button>
      {message ? (
        <p className="text-muted-foreground max-w-sm text-xs sm:text-right">{message}</p>
      ) : null}
    </div>
  );
}
