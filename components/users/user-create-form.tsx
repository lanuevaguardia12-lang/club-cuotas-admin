"use client";

import { UserPlus } from "lucide-react";
import type { ReactNode } from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  createUserAsAdmin,
  type AdminCreateUserState,
} from "@/app/(dashboard)/users/actions";
import { Button } from "@/components/ui/button";
import { LoadingModal } from "@/components/ui/loading-modal";
import { roleLabels } from "@/lib/auth/roles";
import type { AuthRole } from "@/types/auth";

const initialState: AdminCreateUserState = {};
const roles: AuthRole[] = ["coach", "treasurer", "player", "fan", "admin"];

export function UserCreateForm() {
  const [state, formAction] = useActionState(createUserAsAdmin, initialState);

  return (
    <form action={formAction} className="grid gap-3">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <Field label="Nombre">
          <input
            name="name"
            type="text"
            autoComplete="name"
            placeholder="Joaco DT"
            className="border-input bg-background focus-visible:ring-ring h-10 min-w-0 rounded-md border px-3 text-sm outline-none focus-visible:ring-2"
            required
          />
        </Field>
        <Field label="Usuario">
          <input
            name="username"
            type="text"
            autoComplete="username"
            placeholder="joaco"
            className="border-input bg-background focus-visible:ring-ring h-10 min-w-0 rounded-md border px-3 text-sm outline-none focus-visible:ring-2"
            required
          />
        </Field>
        <Field label="Rol">
          <select
            name="role"
            defaultValue="coach"
            className="border-input bg-background focus-visible:ring-ring h-10 min-w-0 rounded-md border px-3 text-sm outline-none focus-visible:ring-2"
          >
            {roles.map((role) => (
              <option key={role} value={role}>
                {roleLabels[role]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Contraseña">
          <input
            name="newPassword"
            type="password"
            autoComplete="new-password"
            placeholder="Mínimo 8 caracteres"
            className="border-input bg-background focus-visible:ring-ring h-10 min-w-0 rounded-md border px-3 text-sm outline-none focus-visible:ring-2"
            required
          />
        </Field>
        <Field label="Repetir">
          <input
            name="repeatPassword"
            type="password"
            autoComplete="new-password"
            placeholder="Repetir contraseña"
            className="border-input bg-background focus-visible:ring-ring h-10 min-w-0 rounded-md border px-3 text-sm outline-none focus-visible:ring-2"
            required
          />
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton />
        {state.error ? (
          <p className="text-destructive text-sm">{state.error}</p>
        ) : state.ok ? (
          <p className="text-primary text-sm">
            Usuario {state.username} creado correctamente.
          </p>
        ) : null}
      </div>
    </form>
  );
}

function Field({ children, label }: { children: ReactNode; label: string }) {
  return (
    <label className="grid gap-1.5 text-sm font-medium">
      <span>{label}</span>
      {children}
    </label>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <>
      <LoadingModal open={pending} description="Creando usuario..." />
      <Button type="submit" disabled={pending}>
        <UserPlus />
        {pending ? "Creando..." : "Crear usuario"}
      </Button>
    </>
  );
}
