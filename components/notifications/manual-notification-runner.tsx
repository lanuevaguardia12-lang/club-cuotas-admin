"use client";

import { BellRing, Send } from "lucide-react";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { LoadingModal } from "@/components/ui/loading-modal";

type NotificationAuditType =
  "all" | "birthday" | "fee" | "match-registration" | "mvp" | "upcoming-match";

type ManualRunKind =
  | "birthday"
  | "fee-defined"
  | "fee-reminder"
  | "match-registration"
  | "mvp"
  | "upcoming-match";

interface NotificationManualRunPanelProps {
  period: string;
  selectedType: NotificationAuditType;
}

interface ManualRunAction {
  body: Record<string, unknown>;
  kind: ManualRunKind;
  label: string;
  loadingLabel: string;
  path: string;
}

export function NotificationManualRunPanel({
  period,
  selectedType,
}: NotificationManualRunPanelProps) {
  const router = useRouter();
  const actions = useMemo(
    () => getManualRunActions(selectedType, period),
    [period, selectedType],
  );
  const [loadingKind, setLoadingKind] = useState<ManualRunKind | null>(null);
  const [message, setMessage] = useState("");
  const [tone, setTone] = useState<"error" | "success">("success");

  async function runAction(action: ManualRunAction) {
    const confirmed = window.confirm(`${action.label} ahora?`);

    if (!confirmed) {
      return;
    }

    setLoadingKind(action.kind);
    setMessage("");
    setTone("success");

    try {
      const response = await fetch(action.path, {
        body: JSON.stringify(action.body),
        headers: {
          "content-type": "application/json",
        },
        method: "POST",
      });
      const result = (await response.json().catch(() => null)) as Record<
        string,
        unknown
      > | null;

      if (!response.ok) {
        throw new Error(
          typeof result?.message === "string"
            ? result.message
            : "No se pudo enviar la notificación.",
        );
      }

      setMessage(buildSuccessMessage(action.kind, result));
      router.refresh();
    } catch (error) {
      setTone("error");
      setMessage(
        error instanceof Error ? error.message : "No se pudo enviar la notificación.",
      );
    } finally {
      setLoadingKind(null);
    }
  }

  if (actions.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        Elegí un tipo para enviar una rutina puntual.
      </p>
    );
  }

  const loadingAction = actions.find((action) => action.kind === loadingKind);

  return (
    <div className="grid gap-2 sm:justify-items-end">
      <LoadingModal
        open={Boolean(loadingAction)}
        description={loadingAction?.loadingLabel}
      />
      <div className="flex flex-wrap gap-2 sm:justify-end">
        {actions.map((action) => (
          <Button
            key={action.kind}
            type="button"
            size="sm"
            onClick={() => void runAction(action)}
            disabled={Boolean(loadingKind)}
          >
            {action.kind === "fee-reminder" ? <BellRing /> : <Send />}
            {action.label}
          </Button>
        ))}
      </div>
      {message ? (
        <p
          className={
            tone === "error"
              ? "text-destructive max-w-md text-xs sm:text-right"
              : "text-muted-foreground max-w-md text-xs sm:text-right"
          }
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}

function getManualRunActions(
  selectedType: NotificationAuditType,
  period: string,
): ManualRunAction[] {
  if (selectedType === "upcoming-match") {
    return [
      {
        body: { all: true, ignoreAlreadyNotified: true },
        kind: "upcoming-match",
        label: "Enviar próximo partido",
        loadingLabel: "Enviando notificaciones de próximo partido...",
        path: "/api/cron/upcoming-match-reminders",
      },
    ];
  }

  if (selectedType === "fee") {
    return [
      {
        body: { period },
        kind: "fee-defined",
        label: "Enviar cuota definida",
        loadingLabel: "Enviando notificaciones de cuota definida...",
        path: "/api/cron/player-fee-defined",
      },
      {
        body: { period },
        kind: "fee-reminder",
        label: "Enviar cuota vencida",
        loadingLabel: "Enviando notificaciones de cuota vencida...",
        path: "/api/cron/player-fee-reminders",
      },
    ];
  }

  if (selectedType === "mvp") {
    return [
      {
        body: { all: true, ignoreAlreadyNotified: true },
        kind: "mvp",
        label: "Enviar MVP",
        loadingLabel: "Enviando notificaciones de MVP...",
        path: "/api/cron/player-of-match-reminders",
      },
    ];
  }

  if (selectedType === "match-registration") {
    return [
      {
        body: { ignoreAlreadyNotified: true },
        kind: "match-registration",
        label: "Enviar recordatorio DT",
        loadingLabel: "Enviando recordatorio al DT...",
        path: "/api/cron/match-registration-reminders",
      },
    ];
  }

  if (selectedType === "birthday") {
    return [
      {
        body: { ignoreAlreadyNotified: true },
        kind: "birthday",
        label: "Enviar cumpleaños",
        loadingLabel: "Enviando notificaciones de cumpleaños...",
        path: "/api/cron/birthday-reminders",
      },
    ];
  }

  return [];
}

function buildSuccessMessage(
  kind: ManualRunKind,
  result: Record<string, unknown> | null,
) {
  if (kind === "upcoming-match") {
    return `Próximo partido: ${numberValue(result?.sent)} enviadas, ${numberValue(
      result?.skippedNoSubscriptions,
    )} sin dispositivo, ${numberValue(result?.failed)} fallidas.`;
  }

  if (kind === "fee-defined") {
    return `Cuota definida: ${numberValue(
      result?.notificationsCreated,
    )} registros, ${numberValue(result?.pushSent)} push enviados, ${numberValue(
      result?.skippedNoPush,
    )} sin dispositivo.`;
  }

  if (kind === "fee-reminder") {
    return `Cuota vencida: ${numberValue(result?.totalPending)} pendientes, ${numberValue(
      result?.sent,
    )} enviadas, ${numberValue(result?.skippedNoPush)} sin dispositivo, ${numberValue(
      result?.failed,
    )} fallidas.`;
  }

  if (kind === "mvp") {
    return `MVP: ${numberValue(result?.sent)} enviadas, ${numberValue(
      result?.skippedNoSubscriptions,
    )} sin dispositivo, ${numberValue(result?.failed)} fallidas.`;
  }

  if (kind === "match-registration") {
    const reason = typeof result?.reason === "string" ? ` Motivo: ${result.reason}.` : "";

    return `DT: ${numberValue(result?.sent)} enviadas, ${numberValue(
      result?.skipped,
    )} omitidas, ${numberValue(result?.failed)} fallidas.${reason}`;
  }

  return `Cumpleaños: ${numberValue(result?.birthdays)} cumpleaños, ${numberValue(
    result?.sent,
  )} enviadas, ${numberValue(result?.skipped)} omitidas, ${numberValue(
    result?.failed,
  )} fallidas.`;
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
