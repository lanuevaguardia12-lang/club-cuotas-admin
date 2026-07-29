"use client";

import { LockKeyhole, LogIn, UserRound } from "lucide-react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { loginAction, type LoginState } from "@/app/login/actions";
import { Button } from "@/components/ui/button";
import { LoadingModal } from "@/components/ui/loading-modal";

interface LoginFormProps {
  redirectTo?: string;
}

const initialState: LoginState = {};

export function LoginForm({ redirectTo = "/" }: LoginFormProps) {
  const [state, formAction] = useActionState(loginAction, initialState);

  return (
    <form action={formAction} className="grid gap-4">
      <input type="hidden" name="redirectTo" value={redirectTo} />

      <div className="grid gap-2">
        <label htmlFor="username" className="text-sm font-medium">
          Usuario administrador
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

      <SubmitButton />
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <>
      <LoadingModal open={pending} description="Ingresando al sistema..." />
      <Button type="submit" disabled={pending}>
        <LogIn />
        {pending ? "Ingresando..." : "Ingresar"}
      </Button>
    </>
  );
}
