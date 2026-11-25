"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, FileCheck2, LoaderCircle, Upload, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  formatPaymentAmount,
  MAX_RECEIPT_BYTES,
  paymentDebtDescription,
  paymentPeriodLabel,
} from "@/lib/player-payment";
import type { PlayerPaymentData } from "@/types/player-payment";
export function PlayerPaymentForm({
  data,
  initialPeriod,
  paymentAlias,
}: {
  data: PlayerPaymentData;
  initialPeriod?: string;
  paymentAlias: string;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState<string[]>(() =>
    data.quotas.some((q) => q.period === initialPeriod)
      ? [initialPeriod!]
      : data.quotas.map((q) => q.period),
  );
  const [file, setFile] = useState<File | null>(null),
    [error, setError] = useState(""),
    [pending, setPending] = useState(false);
  const [saved, setSaved] = useState<{
    totalCents: number;
    receiptUrl: string;
    periods: string[];
  } | null>(null);
  const requestId = useRef<string | null>(null);
  const quotas = data.quotas.filter((q) => selected.includes(q.period));
  const total = quotas.reduce((sum, q) => sum + q.amountCents, 0);
  function changeFile(next: File | null) {
    setError("");
    if (next && next.size > MAX_RECEIPT_BYTES) {
      setFile(null);
      if (input.current) input.current.value = "";
      setError("El comprobante debe pesar hasta 4 MB.");
      return;
    }
    setFile(next);
    requestId.current = null;
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;
    setError("");
    if (!quotas.length || !file) {
      setError("Seleccioná las cuotas y cargá el comprobante.");
      return;
    }
    setPending(true);
    requestId.current ??= crypto.randomUUID();
    const form = new FormData();
    form.set(
      "payload",
      JSON.stringify({ id: requestId.current, expectedQuotas: quotas }),
    );
    form.set("receipt", file);
    try {
      const response = await fetch("/api/player-payments", {
        method: "POST",
        body: form,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "No se pudo registrar el pago.");
      setSaved(result);
      router.refresh();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "No pudimos registrar el pago. Intentá nuevamente.",
      );
    } finally {
      setPending(false);
    }
  }
  if (saved)
    return (
      <section
        role="status"
        className="border-border bg-card grid gap-4 rounded-2xl border p-6"
      >
        <CheckCircle2 className="size-12 text-emerald-600" />
        <h1 className="text-2xl font-semibold">Pago registrado</h1>
        <p>
          Registramos {formatPaymentAmount(saved.totalCents)} para{" "}
          {paymentDebtDescription(
            saved.periods.map((period) => ({ period, amountCents: 0 })),
          )}
          .
        </p>
        <p className="text-muted-foreground text-sm">
          Las cuotas seleccionadas ya figuran como pagadas y se descontaron de tu deuda.
        </p>
        <a
          href={saved.receiptUrl}
          className="text-primary inline-flex min-h-11 items-center font-medium"
        >
          Ver comprobante
        </a>
        <Button
          type="button"
          onClick={() => {
            setSaved(null);
            setSelected([]);
            setFile(null);
            requestId.current = null;
            router.refresh();
          }}
        >
          Volver a mis cuotas pendientes
        </Button>
      </section>
    );
  return (
    <div className="grid min-w-0 gap-5 pb-60 lg:pb-0">
      <header>
        <p className="text-muted-foreground text-sm">Hola,</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight break-words sm:text-3xl">
          {data.playerName}
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">Tu cuenta de cuotas</p>
      </header>
      <section className="bg-primary text-primary-foreground overflow-hidden rounded-2xl p-5 shadow-sm sm:p-7">
        <div className="flex items-center gap-2 text-sm opacity-90">
          <Wallet className="size-4" />
          Tu deuda actual
        </div>
        <p className="mt-3 text-4xl leading-tight font-semibold tracking-tight break-words tabular-nums sm:text-5xl">
          {formatPaymentAmount(data.totalDebtCents)}
        </p>
        <p className="mt-3 max-w-lg text-sm leading-relaxed opacity-90">
          {data.quotas.length
            ? `Correspondiente a ${paymentDebtDescription(data.quotas)}.`
            : "Estás al día con tus cuotas definidas."}
        </p>
      </section>
      {data.undefinedPeriods.length ? (
        <p className="text-muted-foreground rounded-xl border border-dashed p-3 text-sm">
          Hay {data.undefinedPeriods.length} cuota
          {data.undefinedPeriods.length > 1 ? "s" : ""} todavía sin definir. Se sumarán
          cuando el club confirme sus importes.
        </p>
      ) : null}
      {data.quotas.length ? (
        <form onSubmit={submit} className="grid min-w-0 gap-5">
          <fieldset disabled={pending} className="grid min-w-0 gap-5 disabled:opacity-70">
            <section className="bg-card border-border min-w-0 rounded-2xl border p-4 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-semibold">¿Qué cuotas vas a pagar?</h2>
                <button
                  type="button"
                  className="text-primary min-h-11 text-sm font-medium"
                  onClick={() => {
                    setSelected(
                      quotas.length === data.quotas.length
                        ? []
                        : data.quotas.map((q) => q.period),
                    );
                    requestId.current = null;
                  }}
                >
                  {quotas.length === data.quotas.length
                    ? "Quitar selección"
                    : "Seleccionar todas"}
                </button>
              </div>
              <div className="mt-2 grid gap-2">
                {data.quotas.map((quota) => (
                  <label
                    key={quota.period}
                    className={`flex min-h-16 min-w-0 cursor-pointer items-center gap-3 rounded-xl border p-3 transition-colors ${selected.includes(quota.period) ? "border-primary bg-primary/5" : "border-border"}`}
                  >
                    <input
                      type="checkbox"
                      className="accent-primary size-5 shrink-0"
                      checked={selected.includes(quota.period)}
                      onChange={(event) => {
                        setSelected(
                          event.target.checked
                            ? [...selected, quota.period]
                            : selected.filter((p) => p !== quota.period),
                        );
                        requestId.current = null;
                      }}
                    />
                    <span className="min-w-0 flex-1 text-sm break-words capitalize">
                      {paymentPeriodLabel(quota.period)}
                    </span>
                    <span className="shrink-0 text-sm font-semibold tabular-nums sm:text-base">
                      {formatPaymentAmount(quota.amountCents)}
                    </span>
                  </label>
                ))}
              </div>
            </section>
            {paymentAlias ? (
              <section className="bg-card border-border min-w-0 rounded-2xl border p-4 sm:p-6">
                <h2 className="font-semibold">Transferí al alias del club</h2>
                <div className="mt-2 flex min-w-0 flex-wrap items-center justify-between gap-2">
                  <p className="min-w-0 font-medium break-all">{paymentAlias}</p>
                  <button
                    type="button"
                    className="text-primary min-h-11 text-sm font-medium"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(paymentAlias);
                      } catch {
                        setError(
                          "No se pudo copiar. Podés seleccionar el alias y copiarlo.",
                        );
                      }
                    }}
                  >
                    Copiar alias
                  </button>
                </div>
              </section>
            ) : null}
            <section className="bg-card border-border min-w-0 rounded-2xl border p-4 sm:p-6">
              <h2 className="font-semibold">Cargá tu comprobante</h2>
              <p id="receipt-help" className="text-muted-foreground mt-1 text-sm">
                Un comprobante para las cuotas seleccionadas. PDF, JPG, PNG o WebP, hasta
                4 MB.
              </p>
              <input
                ref={input}
                type="file"
                aria-label="Archivo del comprobante"
                accept="application/pdf,image/jpeg,image/png,image/webp"
                className="sr-only"
                id="payment-receipt"
                aria-describedby="receipt-help"
                onChange={(event) => changeFile(event.target.files?.[0] ?? null)}
              />
              <label
                htmlFor="payment-receipt"
                className="border-primary/40 bg-primary/5 text-primary mt-4 flex min-h-14 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-3 text-center text-sm font-medium"
              >
                <Upload className="size-5 shrink-0" />
                {file ? "Cambiar comprobante" : "Cargar comprobante"}
              </label>
              {file ? (
                <p className="text-muted-foreground mt-3 flex min-w-0 items-start gap-2 text-sm">
                  <FileCheck2 className="mt-0.5 size-4 shrink-0" />
                  <span className="min-w-0 break-all">{file.name}</span>
                </p>
              ) : null}
            </section>
          </fieldset>
          <section className="bg-card/95 border-border fixed inset-x-4 bottom-[calc(5.25rem+env(safe-area-inset-bottom))] z-30 mx-auto max-w-2xl min-w-0 rounded-2xl border p-4 shadow-lg backdrop-blur sm:p-5 lg:static lg:mx-0 lg:w-full">
            <div
              className="mb-3 flex min-w-0 items-center justify-between gap-3"
              aria-live="polite"
            >
              <div className="min-w-0">
                <p className="text-muted-foreground text-xs">Total a pagar</p>
                <p className="text-muted-foreground mt-0.5 text-xs">
                  {quotas.length} cuota{quotas.length === 1 ? "" : "s"} seleccionada
                  {quotas.length === 1 ? "" : "s"}
                </p>
              </div>
              <strong className="text-2xl tabular-nums">
                {formatPaymentAmount(total)}
              </strong>
            </div>
            <Button
              className="min-h-12 w-full text-base"
              type={file ? "submit" : "button"}
              onClick={file ? undefined : () => input.current?.click()}
              disabled={pending || !quotas.length}
            >
              {pending ? (
                <>
                  <LoaderCircle className="size-5 animate-spin" />
                  Registrando pago…
                </>
              ) : file ? (
                "Confirmar pago y comprobante"
              ) : (
                "Cargar comprobante"
              )}
            </Button>
            <p className="text-muted-foreground mt-2 text-center text-xs">
              Al confirmar, las cuotas seleccionadas se marcarán como pagadas.
            </p>
            {error ? (
              <p role="alert" className="text-destructive mt-3 text-sm">
                {error}
              </p>
            ) : null}
          </section>
        </form>
      ) : (
        <div className="text-muted-foreground flex items-center gap-2 rounded-xl border p-4">
          <CheckCircle2 className="size-5 text-emerald-600" />
          <p>No tenés cuotas pendientes para pagar.</p>
        </div>
      )}
    </div>
  );
}
