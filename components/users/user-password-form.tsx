"use client";

import { KeyRound } from "lucide-react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  changeUserPasswordAsAdmin,
  type AdminPasswordState,
} from "@/app/(dashboard)/users/actions";
import { Button } from "@/components/ui/button";
import { LoadingModal } from "@/components/ui/loading-modal";
import type { AccountUser } from "@/types/account";

const initialState: AdminPasswordState = {};

interface UserPasswordFormProps {
  user: AccountUser;
}

export function UserPasswordForm({ user }: UserPasswordFormProps) {
  const [state, formAction] = useActionState(changeUserPasswordAsAdmin, initialState);

  return (
    <form action={formAction} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
      <input type="hidden" name="userId" value={user.userId} />
      <input type="hidden" name="username" value={user.username} />
      <input type="hidden" name="role" value={user.role} />
      <input type="hidden" name="name" value={user.name} />
      <input
        name="newPassword"
        type="password"
        autoComplete="new-password"
        placeholder="Nueva contraseña"
        className="border-input bg-background focus-visible:ring-ring h-10 min-w-0 rounded-md border px-3 text-sm outline-none focus-visible:ring-2"
        required
      />
      <input
        name="repeatPassword"
        type="password"
        autoComplete="new-password"
        placeholder="Repetir contraseña"
        className="border-input bg-background focus-visible:ring-ring h-10 min-w-0 rounded-md border px-3 text-sm outline-none focus-visible:ring-2"
        required
      />
      <SubmitButton />
      {state.error ? (
        <p className="text-destructive text-sm sm:col-span-3">{state.error}</p>
      ) : state.ok ? (
        <p className="text-primary text-sm sm:col-span-3">Contraseña actualizada.</p>
      ) : null}
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <>
      <LoadingModal open={pending} description="Actualizando contraseña..." />
      <Button type="submit" disabled={pending}>
        <KeyRound />
        {pending ? "Guardando..." : "Cambiar"}
      </Button>
    </>
  );
}
