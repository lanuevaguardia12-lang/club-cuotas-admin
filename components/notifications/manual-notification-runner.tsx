"use client";

import { BellRing, Send } from "lucide-react";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { LoadingModal } from "@/components/ui/loading-modal";

export type NotificationAuditType =
  | "all"
  | "annual-mvp"
  | "manual"
  | "birthday"
  | "fee"
  | "match-registration"
  | "mvp"
  | "upcoming-match";

type ManualRunKind =
  | "annual-mvp"
  | "birthday"
  | "fee-defined"
  | "fee-reminder"
  | "match-registration"
  | "mvp"
  | "upcoming-match";

interface NotificationManualRunPanelProps {
  annualMvpYears: number[] | null;
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
  annualMvpYears,
  period,
  selectedType,
}: NotificationManualRunPanelProps) {
  const router = useRouter();
  const [chosenYear, setChosenYear] = useState<number>();
  const year = annualMvpYears?.includes(chosenYear ?? 0)
    ? chosenYear
    : annualMvpYears?.[0];
  const actions = useMemo(
    () => getManualRunActions(selectedType, period, year),
    [period, selectedType, year],
  );
  const [loadingKind, setLoadingKind] = useState<ManualRunKind | null>(null);
  const [message, setMessage] = useState("");
  const [tone, setTone] = useState<"error" | "success">("success");

  async function runAction(action: ManualRunAction) {
    const confirmed = window.confirm(
      `¿${action.label}${action.kind === "annual-mvp" ? ` ${action.body.year}` : ""} ahora?`,
    );

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
        {selectedType === "annual-mvp"
          ? annualMvpYears
            ? "Publicá una votación en Encuestas para enviar el aviso."
            : "No se pudieron cargar las votaciones."
          : "Elegí un tipo para enviar una rutina puntual."}
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
        {selectedType === "annual-mvp" && year !== undefined ? (
          <select
            aria-label="Año de la votación"
            value={year}
            onChange={(event) => setChosenYear(Number(event.target.value))}
            disabled={Boolean(loadingKind)}
            className="border-input bg-background h-8 rounded-md border px-2 text-sm"
          >
            {annualMvpYears?.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        ) : null}
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
  year?: number,
): ManualRunAction[] {
  if (selectedType === "annual-mvp" && year !== undefined) {
    return [
      {
        body: { year },
        kind: "annual-mvp",
        label: "Enviar aviso de MVP del año",
        loadingLabel: "Enviando aviso de MVP del año...",
        path: "/api/notifications/annual-mvp",
      },
    ];
  }
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
  if (kind === "annual-mvp") {
    return (
      [
        `${numberValue(result?.created)} avisos en la campana`,
        `${numberValue(result?.pushSent)} push entregados`,
        `${numberValue(result?.noDevice)} sin dispositivo`,
        `${numberValue(result?.pushFailed)} push fallidos`,
        `${numberValue(result?.alreadyCreated)} ya registrados`,
      ].join(" · ") +
      (result?.deliveryTrackingFailed
        ? ". No se pudo guardar el estado de entrega."
        : ".")
    );
  }
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
    const sent = numberValue(result?.sent);
    const failed = numberValue(result?.failed);
    const skipped = numberValue(result?.skipped);
    const skippedNoSubscriptions = numberValue(result?.skippedNoSubscriptions);
    const skippedAlreadyNotified = numberValue(result?.skippedAlreadyNotified);
    const otherSkipped = Math.max(
      0,
      skipped - skippedNoSubscriptions - skippedAlreadyNotified,
    );
    const matchLabel =
      typeof result?.matchLabel === "string" && result.matchLabel
        ? ` Partido: ${result.matchLabel}.`
        : "";
    const reason =
      typeof result?.reason === "string"
        ? ` Motivo: ${getMatchRegistrationReasonLabel(result.reason)}.`
        : "";
    const details = [
      `${sent} enviadas`,
      `${skippedNoSubscriptions} sin dispositivo`,
      skippedAlreadyNotified > 0 ? `${skippedAlreadyNotified} ya avisadas` : "",
      otherSkipped > 0 ? `${otherSkipped} omitidas` : "",
      `${failed} fallidas`,
    ].filter(Boolean);

    return `DT: ${details.join(", ")}.${reason}${matchLabel}`;
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

function getMatchRegistrationReasonLabel(reason: string) {
  if (reason === "already-registered") {
    return "el último partido ya tiene jugadores cargados";
  }

  if (reason === "no-played-match") {
    return "no se encontró un último partido jugado";
  }

  if (reason === "registration-status-error") {
    return "no se pudo verificar si el partido tiene jugadores cargados";
  }

  return reason;
}
