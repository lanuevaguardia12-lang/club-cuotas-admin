"use client";

import { ExternalLink } from "lucide-react";
import { useActionState, useEffect } from "react";

import {
  createCheckoutAction,
  type CheckoutActionState,
} from "@/app/(dashboard)/payments/actions";
import { Button } from "@/components/ui/button";
import { LoadingModal } from "@/components/ui/loading-modal";

const initialState: CheckoutActionState = {};

export function CreateCheckoutForm() {
  const [state, formAction, isPending] = useActionState(
    createCheckoutAction,
    initialState,
  );

  useEffect(() => {
    if (state.checkoutUrl) {
      window.open(state.checkoutUrl, "_blank", "noopener,noreferrer");
    }
  }, [state.checkoutUrl]);

  return (
    <form
      action={formAction}
      className="border-border bg-card grid gap-4 rounded-lg border p-5"
    >
      <LoadingModal open={isPending} description="Creando link de pago..." />

      <div>
        <h2 className="text-lg font-semibold">Crear link de pago</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Genera una preferencia de Mercado Pago o una sesion de Stripe Checkout.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Proveedor">
          <select
            name="provider"
            className="border-input bg-background focus:ring-ring h-10 rounded-md border px-3 text-sm outline-none focus:ring-2"
            defaultValue="mercado-pago"
          >
            <option value="mercado-pago">Mercado Pago</option>
            <option value="stripe">Stripe</option>
          </select>
        </Field>

        <Field label="Periodo">
          <input
            name="period"
            placeholder="2026-07"
            defaultValue={new Date().toISOString().slice(0, 7)}
            className="border-input bg-background focus:ring-ring h-10 rounded-md border px-3 text-sm outline-none focus:ring-2"
          />
        </Field>

        <Field label="ID jugador">
          <input
            name="playerId"
            placeholder="JUG-001"
            className="border-input bg-background focus:ring-ring h-10 rounded-md border px-3 text-sm outline-none focus:ring-2"
          />
        </Field>

        <Field label="Nombre jugador">
          <input
            name="playerName"
            placeholder="Nombre y apellido"
            className="border-input bg-background focus:ring-ring h-10 rounded-md border px-3 text-sm outline-none focus:ring-2"
          />
        </Field>

        <Field label="Monto">
          <input
            name="amount"
            type="number"
            min="1"
            step="1"
            placeholder="25000"
            className="border-input bg-background focus:ring-ring h-10 rounded-md border px-3 text-sm outline-none focus:ring-2"
          />
        </Field>

        <Field label="Moneda">
          <input
            name="currency"
            defaultValue="ARS"
            maxLength={3}
            className="border-input bg-background focus:ring-ring h-10 rounded-md border px-3 text-sm uppercase outline-none focus:ring-2"
          />
        </Field>

        <Field label="Email pagador">
          <input
            name="payerEmail"
            type="email"
            placeholder="opcional"
            className="border-input bg-background focus:ring-ring h-10 rounded-md border px-3 text-sm outline-none focus:ring-2"
          />
        </Field>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Button type="submit" disabled={isPending}>
          <ExternalLink />
          {isPending ? "Creando..." : "Crear link"}
        </Button>
        {state.message ? (
          <span className="text-primary text-sm font-medium">{state.message}</span>
        ) : null}
        {state.error ? (
          <span className="text-destructive text-sm">{state.error}</span>
        ) : null}
      </div>
    </form>
  );
}

function Field({
  children,
  label,
}: Readonly<{
  children: React.ReactNode;
  label: string;
}>) {
  return (
    <label className="grid gap-2">
      <span className="text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}
