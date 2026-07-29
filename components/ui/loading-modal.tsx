"use client";

import { LoaderCircle } from "lucide-react";
import { useId } from "react";

interface LoadingModalProps {
  description?: string;
  open: boolean;
  title?: string;
}

export function LoadingModal({
  description = "Estamos procesando la solicitud. Esto puede tardar unos segundos.",
  open,
  title = "Cargando",
}: LoadingModalProps) {
  const titleId = useId();
  const descriptionId = useId();

  if (!open) {
    return null;
  }

  return (
    <div
      className="bg-background/80 fixed inset-0 z-[100] grid place-items-center p-4 backdrop-blur-sm"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      aria-busy="true"
    >
      <div className="border-border bg-card text-card-foreground grid w-full max-w-sm gap-4 rounded-lg border p-6 text-center shadow-xl">
        <div className="bg-primary/10 text-primary mx-auto grid size-12 place-items-center rounded-full">
          <LoaderCircle className="size-6 animate-spin" aria-hidden="true" />
        </div>
        <div className="grid gap-2">
          <h2 id={titleId} className="text-lg font-semibold">
            {title}
          </h2>
          <p id={descriptionId} className="text-muted-foreground text-sm">
            {description}
          </p>
        </div>
      </div>
    </div>
  );
}
