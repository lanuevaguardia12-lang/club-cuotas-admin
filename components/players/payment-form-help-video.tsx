"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { CirclePlay, X } from "lucide-react";
import { useRef, useState } from "react";

const PAYMENT_FORM_VIDEO_URL = "/videos/formulario-cuota.mp4?v=695bf485af";

export function PaymentFormHelpVideo() {
  const [open, setOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) videoRef.current?.pause();
        setOpen(nextOpen);
      }}
    >
      <Dialog.Trigger asChild>
        <button
          type="button"
          className="border-primary/20 bg-primary/5 hover:bg-primary/10 focus-visible:ring-ring flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-left text-sm transition-colors outline-none focus-visible:ring-2"
        >
          <CirclePlay className="text-primary size-6 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <span className="block font-medium">
              ¿No sabés cómo completar el formulario de pago?
            </span>
            <span className="text-muted-foreground mt-0.5 block text-xs">
              Mirá el video paso a paso.
            </span>
          </span>
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="club-sheet-overlay fixed inset-0 z-[80] bg-black/60" />
        <Dialog.Content className="bg-card text-card-foreground fixed top-1/2 left-1/2 z-[81] grid max-h-[calc(100dvh-2rem)] w-[calc(100%_-_2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 gap-3 overflow-y-auto rounded-xl border p-4 shadow-xl outline-none sm:p-5">
          <div className="grid gap-1 pr-9">
            <Dialog.Title className="text-base font-semibold">
              Cómo completar el formulario de pago
            </Dialog.Title>
            <Dialog.Description className="text-muted-foreground text-sm">
              Seguí los pasos del video. Podés pausarlo o verlo en pantalla completa.
            </Dialog.Description>
          </div>
          <video
            ref={videoRef}
            className="mx-auto max-h-[calc(100dvh-11rem)] w-auto max-w-full rounded-lg bg-black"
            controls
            playsInline
            preload="metadata"
          >
            <source src={PAYMENT_FORM_VIDEO_URL} type="video/mp4" />
            Tu navegador no puede reproducir este video.{" "}
            <a href={PAYMENT_FORM_VIDEO_URL}>Abrir el tutorial</a>.
          </video>
          <Dialog.Close
            className="focus-visible:ring-ring hover:bg-muted absolute top-3 right-3 grid size-9 place-items-center rounded-md outline-none focus-visible:ring-2"
            aria-label="Cerrar video"
          >
            <X className="size-5" aria-hidden="true" />
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
