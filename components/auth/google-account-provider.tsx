"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { GoogleButton } from "@/components/auth/google-button";
import { Button } from "@/components/ui/button";
import { GOOGLE_MESSAGES } from "@/lib/auth/google-messages";

type Status = {
  enabled: boolean;
  linked?: boolean;
  email?: string | null;
  dismissed?: boolean;
};
const GoogleAccountContext = createContext<{ status: Status | null; error: string }>({
  status: null,
  error: "",
});
export function GoogleAccountProvider({
  children,
  userId,
  enabled,
}: {
  children: React.ReactNode;
  userId: string;
  enabled: boolean;
}) {
  const [status, setStatus] = useState<Status | null>(
    enabled ? null : { enabled: false },
  );
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const pathname = usePathname();
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    fetch("/api/auth/google/status", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("status");
        const data: Status = await response.json();
        if (controller.signal.aborted) return;
        setStatus(data);
        setOpen(data.enabled && !data.linked && !data.dismissed);
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError(
            "No pudimos consultar la vinculación. Recargá la página para intentar nuevamente.",
          );
      });
    return () => controller.abort();
  }, [userId, enabled]);
  async function dismiss() {
    if (saving) return;
    setSaving(true);
    setSaveError("");
    try {
      const response = await fetch("/api/auth/google/status", { method: "POST" });
      if (!response.ok) throw new Error("save");
      setStatus((previous) => (previous ? { ...previous, dismissed: true } : previous));
      setOpen(false);
    } catch {
      setSaveError("No pudimos guardar tu elección. Intentá nuevamente.");
    } finally {
      setSaving(false);
    }
  }
  return (
    <GoogleAccountContext.Provider value={{ status, error }}>
      {children}
      <Dialog.Root open={open && pathname !== "/account"} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[90] bg-black/50" />
          <Dialog.Content className="border-border bg-card fixed top-1/2 left-1/2 z-[91] grid max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 gap-4 overflow-y-auto rounded-2xl border p-5 shadow-xl sm:p-6">
            <Dialog.Title className="pr-7 text-xl font-semibold">
              Todavía no vinculaste tu correo con tu cuenta
            </Dialog.Title>
            <Dialog.Description className="text-muted-foreground text-sm">
              Vinculá Google para ingresar más fácil. Conservás tu cuenta, tus cuotas y
              tus pagos.
            </Dialog.Description>
            <GoogleButton />
            <Button
              variant="ghost"
              onClick={dismiss}
              disabled={saving}
              className="min-h-11"
            >
              {saving ? "Guardando…" : "No tengo Gmail"}
            </Button>
            <p className="text-muted-foreground text-xs">
              Si elegís «No tengo Gmail», no volveremos a mostrarte este aviso. Podés
              vincular Google más adelante desde Mi cuenta.
            </p>
            {saveError ? (
              <p role="alert" className="text-destructive text-sm">
                {saveError}
              </p>
            ) : null}
            <Dialog.Close
              className="text-muted-foreground absolute top-3 right-3 inline-flex size-9 items-center justify-center rounded-md"
              aria-label="Cerrar aviso"
            >
              <X className="size-4" />
            </Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </GoogleAccountContext.Provider>
  );
}
export function GoogleAccountCard({ outcome }: { outcome?: string }) {
  const { status, error } = useContext(GoogleAccountContext);
  if (status && !status.enabled) return null;
  return (
    <section className="border-border bg-card grid gap-3 rounded-xl border p-4 sm:p-6">
      <h2 className="text-lg font-semibold">Acceso con Google</h2>
      {outcome && GOOGLE_MESSAGES[outcome] ? (
        <p role={outcome === "linked" ? "status" : "alert"} className="text-sm">
          {GOOGLE_MESSAGES[outcome]}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm">
          {error}
        </p>
      ) : !status ? (
        <p className="text-muted-foreground text-sm" role="status">
          Consultando vinculación…
        </p>
      ) : status.linked ? (
        <>
          <p className="text-sm">Tu cuenta de Google está vinculada.</p>
          <p className="text-muted-foreground text-sm break-all">{status.email}</p>
        </>
      ) : (
        <>
          <p className="text-muted-foreground text-sm">
            Usá Google para ingresar a tu cuenta actual y conservar toda tu información.
          </p>
          <GoogleButton className="w-full sm:max-w-xs" />
        </>
      )}
    </section>
  );
}
