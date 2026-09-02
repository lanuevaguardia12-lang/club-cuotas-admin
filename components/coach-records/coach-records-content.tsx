"use client";

import { Check, Clipboard, Mail, RefreshCw, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { sendCoachRecordsEmail } from "@/app/(dashboard)/coach-records/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingModal } from "@/components/ui/loading-modal";
import type { CoachRecordsData } from "@/types/coach-records";

interface CoachRecordsContentProps {
  data: CoachRecordsData;
}

export function CoachRecordsContent({ data }: CoachRecordsContentProps) {
  const router = useRouter();
  const [period, setPeriod] = useState(data.period);
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const emailRecipients =
    data.emailCc.length > 0
      ? `${data.emailTo} con copia a ${data.emailCc.join(", ")}`
      : data.emailTo;

  function handlePeriodSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    router.push(`/coach-records?period=${period}`);
  }

  async function handleCopy() {
    setMessage("");

    try {
      await navigator.clipboard.writeText(data.emailBody);
      setMessage("Texto copiado.");
    } catch {
      setMessage("No se pudo copiar el texto.");
    }
  }

  function handleSendEmail() {
    setMessage("");
    startTransition(async () => {
      const result = await sendCoachRecordsEmail({ period: data.period });

      setMessage(
        "error" in result && result.error
          ? result.error
          : `Correo enviado a ${emailRecipients}.`,
      );
    });
  }

  return (
    <section className="grid gap-5">
      <LoadingModal open={isPending} description="Enviando desglose DT por correo..." />

      <Card>
        <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-end sm:justify-between">
          <form
            className="flex flex-col gap-2 sm:flex-row sm:items-end"
            onSubmit={handlePeriodSubmit}
          >
            <label className="grid gap-2">
              <span className="text-sm font-medium">Mes trabajado</span>
              <input
                type="month"
                value={period}
                onChange={(event) => setPeriod(event.target.value)}
                className="border-input bg-background focus:ring-ring h-10 rounded-md border px-3 text-sm outline-none focus:ring-2"
              />
            </label>
            <Button type="submit" variant="outline">
              <RefreshCw />
              Ver mes
            </Button>
          </form>

          <div className="text-muted-foreground text-sm sm:text-right">
            <p>
              Se paga en{" "}
              <span className="text-foreground font-medium">
                {formatPeriodLabel(data.paymentPeriod)}
              </span>
            </p>
            <p>Pago a mes vencido</p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        <MetricCard
          title="Horas reales"
          value={formatNumber(data.totalHours)}
          detail={`${data.matches.length} partidos con DT`}
        />
        <MetricCard
          title="Valor hora DT"
          value={formatCurrency(data.hourlyRate)}
          detail={data.costName || "Costo DT no definido"}
        />
        <MetricCard
          title="Total a pagar"
          value={formatCurrency(data.totalCost)}
          detail={`Desglose ${formatPeriodLabel(data.period)}`}
        />
      </div>

      {data.source.status === "error" ? (
        <section className="border-destructive/30 bg-destructive/10 text-destructive rounded-lg border p-4 text-sm">
          {data.source.message}
        </section>
      ) : null}

      {!data.costName && data.source.status !== "error" ? (
        <section className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          No encontré un costo de Director técnico para este mes. El listado de partidos
          se muestra igual, pero el valor hora y el total quedan en $0 hasta cargar el
          costo en el calculador.
        </section>
      ) : null}

      <Card>
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>Partidos con asistencia del DT</CardTitle>
            <p className="text-muted-foreground mt-1 text-sm">
              Se toma de los partidos cargados con “Asistió Joaco” marcado.
            </p>
          </div>
          <Badge variant={data.matches.length > 0 ? "success" : "secondary"}>
            {data.matches.length} registros
          </Badge>
        </CardHeader>
        <CardContent>
          {data.matches.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-sm">
                <thead>
                  <tr className="border-border text-muted-foreground border-b text-left">
                    <th className="py-3 pr-4 font-medium">Fecha</th>
                    <th className="px-4 py-3 font-medium">Rival</th>
                    <th className="px-4 py-3 font-medium">Competencia</th>
                    <th className="px-4 py-3 font-medium">Condición</th>
                    <th className="py-3 pl-4 text-right font-medium">Horas</th>
                  </tr>
                </thead>
                <tbody>
                  {data.matches.map((match) => (
                    <tr key={match.id} className="border-border border-b last:border-0">
                      <td className="py-3 pr-4 font-medium">{formatDate(match.date)}</td>
                      <td className="px-4 py-3">{match.rival}</td>
                      <td className="px-4 py-3">{match.competitionLabel}</td>
                      <td className="px-4 py-3">{match.venue}</td>
                      <td className="py-3 pl-4 text-right font-medium">
                        {formatNumber(match.hours)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="border-border bg-muted/20 text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm">
              {data.emptyState.description}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>Texto para enviar</CardTitle>
            <p className="text-muted-foreground mt-1 text-sm">
              Asunto: {data.emailSubject}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={handleCopy}>
              <Clipboard />
              Copiar
            </Button>
            <Button
              type="button"
              disabled={data.source.status === "error" || isPending}
              onClick={handleSendEmail}
            >
              <Send />
              Enviar correo
            </Button>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3">
          <div className="border-border bg-muted/20 flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
            <Mail className="text-muted-foreground size-4" aria-hidden="true" />
            <span className="text-muted-foreground">Para</span>
            <span className="font-medium">{data.emailTo}</span>
          </div>
          {data.emailCc.length > 0 ? (
            <div className="border-border bg-muted/20 flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
              <Mail className="text-muted-foreground size-4" aria-hidden="true" />
              <span className="text-muted-foreground">Copia</span>
              <span className="font-medium">{data.emailCc.join(", ")}</span>
            </div>
          ) : null}
          <textarea
            readOnly
            value={data.emailBody}
            className="border-input bg-background min-h-80 rounded-md border p-3 font-mono text-sm outline-none"
          />
          {message ? (
            <p className="text-muted-foreground flex items-center gap-2 text-sm">
              {message === "Texto copiado." ? (
                <Check className="text-primary size-4" aria-hidden="true" />
              ) : null}
              {message}
            </p>
          ) : null}
        </CardContent>
      </Card>
    </section>
  );
}

function MetricCard({
  detail,
  title,
  value,
}: {
  detail: string;
  title: string;
  value: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-muted-foreground text-sm font-medium">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold">{value}</p>
        <p className="text-muted-foreground mt-1 text-sm">{detail}</p>
      </CardContent>
    </Card>
  );
}

function formatPeriodLabel(period: string) {
  const [year, month] = period.split("-").map(Number);
  const date = new Date(year, month - 1, 1, 12);

  return new Intl.DateTimeFormat("es-AR", {
    month: "long",
    year: "numeric",
  }).format(date);
}

function formatDate(value: string) {
  const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const date = isoMatch
    ? new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]), 12)
    : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-AR", {
    currency: "ARS",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(value);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("es-AR", {
    maximumFractionDigits: 2,
    minimumFractionDigits: Number.isInteger(value) ? 0 : 1,
  }).format(value);
}
