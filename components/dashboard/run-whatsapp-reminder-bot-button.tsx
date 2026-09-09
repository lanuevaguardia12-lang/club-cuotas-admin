"use client";

import { Bot, CheckCircle2, Clock3, LoaderCircle, X, XCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { useAppSettings } from "@/components/providers/app-settings-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LoadingModal } from "@/components/ui/loading-modal";

const LOCAL_WHATSAPP_BOT_URL = "lng-whatsapp-bot://start";

interface RunWhatsAppReminderBotButtonProps {
  period: string;
}

interface RunWhatsAppReminderBotResponse {
  jobs?: WhatsAppReminderTrackingJob[];
  mode?: "local-queue" | "webhook";
  period: string;
  periodLabel: string;
  queued: number;
  reminderRecordsFailed?: number;
  replacedQueued?: number;
  runId?: string;
  skippedAlreadyQueued?: number;
  skippedNoPhone: number;
  skippedUndefinedFee?: number;
  totalPending: number;
}

type WhatsAppReminderStatus = "queued" | "processing" | "sent" | "failed" | "skipped";

interface WhatsAppReminderTrackingJob {
  amount: number;
  error?: string;
  fee: string;
  id?: string;
  paymentStatus: string;
  period: string;
  playerId: string;
  playerName: string;
  sentAt?: string;
  status: WhatsAppReminderStatus;
}

interface WhatsAppReminderStatusResponse {
  jobs?: Array<{
    error?: string;
    id: string;
    paymentStatus: string;
    period: string;
    playerId: string;
    playerName: string;
    sentAt?: string;
    status: WhatsAppReminderStatus;
  }>;
  summary?: Record<WhatsAppReminderStatus | "total", number>;
}

export function RunWhatsAppReminderBotButton({
  period,
}: RunWhatsAppReminderBotButtonProps) {
  const { settings } = useAppSettings();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [messageTemplate, setMessageTemplate] = useState(
    settings.whatsAppMessageTemplate,
  );
  const [showLocalLauncher, setShowLocalLauncher] = useState(false);
  const [trackingJobs, setTrackingJobs] = useState<WhatsAppReminderTrackingJob[]>([]);
  const [trackingOpen, setTrackingOpen] = useState(false);
  const [trackingPeriodLabel, setTrackingPeriodLabel] = useState("");
  const [trackingRunId, setTrackingRunId] = useState("");
  const selectedPeriodLabel = formatPeriodLabel(period);

  useEffect(() => {
    setMessageTemplate(settings.whatsAppMessageTemplate);
  }, [settings.whatsAppMessageTemplate]);

  useEffect(() => {
    if (!trackingOpen || !trackingRunId) {
      return;
    }

    let cancelled = false;

    async function refreshStatus() {
      const response = await fetch(
        `/api/bot/whatsapp-reminders/status?runId=${encodeURIComponent(trackingRunId)}`,
      );

      if (!response.ok) {
        return;
      }

      const result = (await response.json()) as WhatsAppReminderStatusResponse;

      if (cancelled || !result.jobs) {
        return;
      }

      setTrackingJobs((currentJobs) => mergeTrackingJobs(currentJobs, result.jobs ?? []));
    }

    void refreshStatus();
    const interval = window.setInterval(() => {
      void refreshStatus();
    }, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [trackingOpen, trackingRunId]);

  async function runBot() {
    setLoading(true);
    setMessage("");
    setShowLocalLauncher(true);
    openLocalBotLauncher();

    try {
      const response = await fetch("/api/bot/whatsapp-reminders", {
        body: JSON.stringify({ messageTemplate, period }),
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
        `Mes ${result?.periodLabel ?? formatPeriodLabel(period)}. Pendientes con cuota definida ${result?.totalPending ?? 0}. ${target} ${result?.queued ?? 0}. Cola anterior reemplazada ${result?.replacedQueued ?? 0}. Sin telefono ${result?.skippedNoPhone ?? 0}. Sin cuota definida ${result?.skippedUndefinedFee ?? 0}. Registros fallidos ${result?.reminderRecordsFailed ?? 0}.${result?.mode === "local-queue" ? " Intente abrir WhatsApp automaticamente; si Chrome no aparece, toca Reintentar abrir bot local." : ""}`,
      );
      setTrackingJobs(result?.jobs ?? []);
      setTrackingPeriodLabel(result?.periodLabel ?? formatPeriodLabel(period));
      setTrackingRunId(result?.runId ?? "");

      setShowLocalLauncher(result?.mode === "local-queue");

      if (result?.runId && (result.jobs?.length ?? 0) > 0) {
        setTrackingOpen(true);
      }
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
    <div className="flex flex-col gap-3 sm:items-end">
      <LoadingModal
        open={loading}
        title="Corriendo bot"
        description="Abriendo WhatsApp y preparando pendientes del mes..."
      />
      <WhatsAppReminderRunModal
        jobs={trackingJobs}
        localLauncherUrl={LOCAL_WHATSAPP_BOT_URL}
        open={trackingOpen}
        periodLabel={trackingPeriodLabel || selectedPeriodLabel}
        showLocalLauncher={showLocalLauncher}
        onClose={() => setTrackingOpen(false)}
      />
      <label className="grid w-full max-w-md gap-2 sm:text-right">
        <span className="text-sm font-medium">Mensaje de esta corrida</span>
        <textarea
          value={messageTemplate}
          onChange={(event) => setMessageTemplate(event.target.value)}
          rows={5}
          maxLength={1200}
          className="border-input bg-background focus:ring-ring min-h-32 rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 sm:text-left"
        />
        <span className="text-muted-foreground text-xs">
          Variables: {"{nombre}"}, {"{mes}"}, {"{monto}"}.
        </span>
      </label>
      <Button type="button" variant="outline" onClick={runBot} disabled={loading}>
        <Bot />
        Abrir WhatsApp y correr bot
      </Button>
      {showLocalLauncher ? (
        <Button asChild variant="secondary">
          <a href={LOCAL_WHATSAPP_BOT_URL}>
            <Bot />
            Reintentar abrir bot local
          </a>
        </Button>
      ) : null}
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

function openLocalBotLauncher() {
  const link = document.createElement("a");

  link.href = LOCAL_WHATSAPP_BOT_URL;
  link.style.display = "none";
  link.setAttribute("aria-hidden", "true");
  document.body.appendChild(link);
  link.click();
  window.setTimeout(() => {
    link.remove();
  }, 1000);
}

function WhatsAppReminderRunModal({
  jobs,
  localLauncherUrl,
  open,
  periodLabel,
  showLocalLauncher,
  onClose,
}: {
  jobs: WhatsAppReminderTrackingJob[];
  localLauncherUrl: string;
  open: boolean;
  periodLabel: string;
  showLocalLauncher: boolean;
  onClose: () => void;
}) {
  const summary = useMemo(() => buildTrackingSummary(jobs), [jobs]);

  if (!open) {
    return null;
  }

  return (
    <div
      aria-labelledby="whatsapp-run-title"
      aria-modal="true"
      className="bg-background/80 fixed inset-0 z-[100] grid place-items-center p-4 backdrop-blur-sm"
      role="dialog"
    >
      <div className="border-border bg-card text-card-foreground flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg border shadow-xl">
        <header className="border-border flex items-start justify-between gap-3 border-b p-4">
          <div className="min-w-0">
            <p className="text-muted-foreground text-xs font-medium uppercase">
              Bot de WhatsApp
            </p>
            <h2 id="whatsapp-run-title" className="text-lg font-semibold">
              Corrida de recordatorios
            </h2>
            <p className="text-muted-foreground mt-1 text-sm">Mes: {periodLabel}</p>
          </div>
          <Button
            aria-label="Cerrar seguimiento"
            onClick={onClose}
            size="icon"
            type="button"
            variant="ghost"
          >
            <X />
          </Button>
        </header>

        <div className="grid gap-4 overflow-y-auto p-4">
          <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-5">
            <StatusCounter label="Jugadores" value={summary.total} />
            <StatusCounter label="Pendientes" value={summary.queued} />
            <StatusCounter label="Enviando" value={summary.processing} />
            <StatusCounter label="Enviados" value={summary.sent} />
            <StatusCounter label="Fallidos" value={summary.failed + summary.skipped} />
          </div>

          <div className="grid gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold">Jugadores a enviar: {summary.total}</p>
              <Badge variant={getSummaryVariant(summary)}>
                {getSummaryLabel(summary)}
              </Badge>
            </div>

            <div className="grid max-h-[48vh] gap-2 overflow-y-auto pr-1">
              {jobs.length > 0 ? (
                jobs.map((job, index) => (
                  <TrackingJobRow
                    index={index}
                    job={job}
                    key={`${job.playerId}-${job.period}-${index}`}
                  />
                ))
              ) : (
                <p className="text-muted-foreground rounded-md border border-dashed p-4 text-center text-sm">
                  Todavia no hay jugadores en esta corrida.
                </p>
              )}
            </div>
          </div>
        </div>

        <footer className="border-border flex flex-col gap-2 border-t p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-muted-foreground text-xs">
            Se actualiza automaticamente mientras el bot procesa la cola.
          </p>
          {showLocalLauncher ? (
            <Button asChild variant="secondary">
              <a href={localLauncherUrl}>
                <Bot />
                Reintentar abrir bot local
              </a>
            </Button>
          ) : null}
        </footer>
      </div>
    </div>
  );
}

function StatusCounter({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-muted/60 rounded-md px-3 py-2">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  );
}

function TrackingJobRow({
  index,
  job,
}: {
  index: number;
  job: WhatsAppReminderTrackingJob;
}) {
  const config = getStatusConfig(job.status);
  const Icon = config.icon;

  return (
    <div className="border-border grid gap-2 rounded-md border p-3 sm:grid-cols-[2rem_minmax(0,1fr)_auto] sm:items-center">
      <span className="text-muted-foreground text-sm font-semibold">{index + 1}.</span>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold">{job.playerName}</p>
        <p className="text-muted-foreground text-xs">
          Cuota {getJobFeeLabel(job)} · {formatPeriodLabel(job.period)}
        </p>
        {job.error && job.status !== "queued" && job.status !== "processing" ? (
          <p className="text-destructive mt-1 line-clamp-2 text-xs">{job.error}</p>
        ) : null}
      </div>
      <Badge className="justify-center gap-1" variant={config.variant}>
        <Icon className={config.spin ? "size-3 animate-spin" : "size-3"} />
        {config.label}
      </Badge>
    </div>
  );
}

function mergeTrackingJobs(
  currentJobs: WhatsAppReminderTrackingJob[],
  statusJobs: NonNullable<WhatsAppReminderStatusResponse["jobs"]>,
) {
  const statusByPlayerId = new Map(statusJobs.map((job) => [job.playerId, job] as const));
  const merged = currentJobs.map((job) => {
    const statusJob = statusByPlayerId.get(job.playerId);

    if (!statusJob) {
      return job;
    }

    return {
      ...job,
      error: statusJob.error,
      id: statusJob.id,
      paymentStatus: statusJob.paymentStatus,
      period: statusJob.period,
      playerName: statusJob.playerName,
      sentAt: statusJob.sentAt,
      status: statusJob.status,
    };
  });
  const existingPlayerIds = new Set(currentJobs.map((job) => job.playerId));

  for (const statusJob of statusJobs) {
    if (existingPlayerIds.has(statusJob.playerId)) {
      continue;
    }

    merged.push({
      amount: 0,
      fee: "-",
      ...statusJob,
    });
  }

  return merged;
}

function buildTrackingSummary(jobs: WhatsAppReminderTrackingJob[]) {
  return jobs.reduce(
    (summary, job) => {
      summary[job.status] += 1;
      summary.total += 1;

      return summary;
    },
    {
      failed: 0,
      processing: 0,
      queued: 0,
      sent: 0,
      skipped: 0,
      total: 0,
    } satisfies Record<WhatsAppReminderStatus | "total", number>,
  );
}

function getStatusConfig(status: WhatsAppReminderStatus) {
  if (status === "processing") {
    return {
      icon: LoaderCircle,
      label: "Enviando...",
      spin: true,
      variant: "default" as const,
    };
  }

  if (status === "sent") {
    return {
      icon: CheckCircle2,
      label: "Enviado",
      spin: false,
      variant: "success" as const,
    };
  }

  if (status === "failed" || status === "skipped") {
    return {
      icon: XCircle,
      label: status === "skipped" ? "Cancelado" : "Falló",
      spin: false,
      variant: "danger" as const,
    };
  }

  return {
    icon: Clock3,
    label: "Pendiente de enviar",
    spin: false,
    variant: "warning" as const,
  };
}

function getSummaryVariant(summary: Record<WhatsAppReminderStatus | "total", number>) {
  if (summary.failed + summary.skipped > 0) {
    return "danger" as const;
  }

  if (summary.queued + summary.processing > 0) {
    return "warning" as const;
  }

  return "success" as const;
}

function getSummaryLabel(summary: Record<WhatsAppReminderStatus | "total", number>) {
  if (summary.total === 0) {
    return "Sin jugadores";
  }

  if (summary.failed + summary.skipped > 0) {
    return "Revisar corrida";
  }

  if (summary.queued + summary.processing > 0) {
    return "En curso";
  }

  return "Completada";
}

function getJobFeeLabel(job: WhatsAppReminderTrackingJob) {
  if (job.fee && job.fee !== "-") {
    return job.fee;
  }

  if (job.amount > 0) {
    return new Intl.NumberFormat("es-AR", {
      currency: "ARS",
      maximumFractionDigits: 0,
      style: "currency",
    }).format(job.amount);
  }

  return "-";
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
