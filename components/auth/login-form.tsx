"use client";

import { ArrowLeft, LockKeyhole, LogIn, UserPlus, UserRound } from "lucide-react";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import {
  loginAction,
  registerFanAction,
  type FanSignupState,
  type LoginState,
} from "@/app/login/actions";
import { Button } from "@/components/ui/button";
import { LoadingModal } from "@/components/ui/loading-modal";

interface LoginFormProps {
  redirectTo?: string;
}

const initialState: LoginState = {};
const initialFanSignupState: FanSignupState = {};

export function LoginForm({ redirectTo = "/" }: LoginFormProps) {
  const [state, formAction] = useActionState(loginAction, initialState);
  const [fanSignupState, fanSignupAction] = useActionState(
    registerFanAction,
    initialFanSignupState,
  );
  const [mode, setMode] = useState<"club" | "fan-login" | "fan-signup">("club");

  if (mode === "fan-signup") {
    return (
      <form action={fanSignupAction} className="grid gap-4">
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground inline-flex w-fit items-center gap-2 text-sm font-medium"
          onClick={() => setMode("fan-login")}
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Volver al acceso fan
        </button>

        <div className="grid gap-4 sm:grid-cols-2">
          <TextField autoComplete="given-name" label="Nombre" name="firstName" required />
          <TextField
            autoComplete="family-name"
            label="Apellido"
            name="lastName"
            required
          />
        </div>
        <TextField autoComplete="username" label="Usuario" name="username" required />
        <TextField label="Fecha de nacimiento" name="birthDate" required type="date" />
        <TextField
          autoComplete="new-password"
          label="Contraseña"
          name="password"
          required
          type="password"
        />
        <TextField
          autoComplete="new-password"
          label="Repetir contraseña"
          name="repeatPassword"
          required
          type="password"
        />

        {fanSignupState.error ? (
          <div className="border-destructive/30 bg-destructive/10 text-destructive rounded-md border px-3 py-2 text-sm">
            {fanSignupState.error}
          </div>
        ) : null}

        <FanSignupSubmitButton />
      </form>
    );
  }

  return (
    <form action={formAction} className="grid gap-4">
      <input type="hidden" name="redirectTo" value={redirectTo} />

      <div className="grid gap-2">
        <label htmlFor="username" className="text-sm font-medium">
          {mode === "fan-login" ? "Usuario fan" : "Usuario administrador"}
        </label>
        <div className="border-input bg-background focus-within:ring-ring flex items-center gap-2 rounded-md border px-3 py-2 focus-within:ring-2">
          <UserRound className="text-muted-foreground size-4" aria-hidden="true" />
          <input
            id="username"
            name="username"
            type="text"
            autoComplete="username"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none"
            required
          />
        </div>
      </div>

      <div className="grid gap-2">
        <label htmlFor="password" className="text-sm font-medium">
          Contraseña
        </label>
        <div className="border-input bg-background focus-within:ring-ring flex items-center gap-2 rounded-md border px-3 py-2 focus-within:ring-2">
          <LockKeyhole className="text-muted-foreground size-4" aria-hidden="true" />
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none"
            required
          />
        </div>
      </div>

      {state.error ? (
        <div className="border-destructive/30 bg-destructive/10 text-destructive rounded-md border px-3 py-2 text-sm">
          {state.error}
        </div>
      ) : null}

      <SubmitButton label={mode === "fan-login" ? "Ingresar como fan" : "Ingresar"} />

      <div className="border-border grid gap-3 border-t pt-4">
        {mode === "fan-login" ? (
          <>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setMode("fan-signup")}
            >
              <UserPlus />
              Crear usuario
            </Button>
            <Button type="button" variant="ghost" onClick={() => setMode("club")}>
              Acceso administrador
            </Button>
          </>
        ) : (
          <Button type="button" variant="ghost" onClick={() => setMode("fan-login")}>
            Iniciar sesion como fan
          </Button>
        )}
      </div>
    </form>
  );
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();

  return (
    <>
      <LoadingModal open={pending} description="Ingresando al sistema..." />
      <Button type="submit" disabled={pending}>
        <LogIn />
        {pending ? "Ingresando..." : label}
      </Button>
    </>
  );
}

function FanSignupSubmitButton() {
  const { pending } = useFormStatus();

  return (
    <>
      <LoadingModal open={pending} description="Creando usuario fan..." />
      <Button type="submit" disabled={pending}>
        <UserPlus />
        {pending ? "Creando..." : "Crear usuario"}
      </Button>
    </>
  );
}

function TextField({
  autoComplete,
  label,
  name,
  required,
  type = "text",
}: {
  autoComplete?: string;
  label: string;
  name: string;
  required?: boolean;
  type?: string;
}) {
  return (
    <div className="grid gap-2">
      <label htmlFor={name} className="text-sm font-medium">
        {label}
      </label>
      <div className="border-input bg-background focus-within:ring-ring flex items-center gap-2 rounded-md border px-3 py-2 focus-within:ring-2">
        <UserRound className="text-muted-foreground size-4" aria-hidden="true" />
        <input
          id={name}
          name={name}
          type={type}
          autoComplete={autoComplete}
          className="min-w-0 flex-1 bg-transparent text-sm outline-none"
          required={required}
        />
      </div>
    </div>
  );
}
