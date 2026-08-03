"use client";

import { Bell, BellOff, Check, ExternalLink, Send } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LoadingModal } from "@/components/ui/loading-modal";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import type { AuthUser } from "@/types/auth";
import type { AppNotification } from "@/types/premium";

type PushStatus =
  | "checking"
  | "unsupported"
  | "unconfigured"
  | "denied"
  | "default"
  | "subscribed"
  | "unsubscribed";

interface PushConfigResponse {
  configured: boolean;
  publicKey: string;
}

interface NotificationHistoryResponse {
  notifications: AppNotification[];
  unreadCount: number;
}

interface NotificationBellProps {
  user: AuthUser;
}

export function NotificationBell({ user }: NotificationBellProps) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<PushStatus>("checking");
  const [publicKey, setPublicKey] = useState("");
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [message, setMessage] = useState("");
  const [loadingMessage, setLoadingMessage] = useState("");

  const loadHistory = useCallback(async () => {
    const response = await fetch("/api/notifications", {
      cache: "no-store",
    });

    if (!response.ok) {
      return;
    }

    const data = (await response.json()) as NotificationHistoryResponse;
    setNotifications(data.notifications);
    setUnreadCount(data.unreadCount);
  }, []);

  useEffect(() => {
    let active = true;

    async function hydrate() {
      await loadHistory();

      if (!isPushSupported()) {
        setStatus("unsupported");
        return;
      }

      const config = await fetch("/api/push/subscriptions")
        .then((response) => response.json() as Promise<PushConfigResponse>)
        .catch(() => ({ configured: false, publicKey: "" }));

      if (!active) {
        return;
      }

      if (!config.configured || !config.publicKey) {
        setStatus("unconfigured");
        return;
      }

      setPublicKey(config.publicKey);

      if (Notification.permission === "denied") {
        setStatus("denied");
        return;
      }

      try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();

        if (!active) {
          return;
        }

        setStatus(subscription ? "subscribed" : "unsubscribed");
      } catch {
        setStatus("unsupported");
      }
    }

    hydrate();

    return () => {
      active = false;
    };
  }, [loadHistory]);

  useEffect(() => {
    if (open) {
      void loadHistory();
    }
  }, [loadHistory, open]);

  async function subscribe() {
    setMessage("");
    setLoadingMessage("Activando notificaciones...");

    try {
      if (!isPushSupported()) {
        setStatus("unsupported");
        return;
      }

      const permission = await Notification.requestPermission();

      if (permission === "denied") {
        setStatus("denied");
        return;
      }

      if (permission !== "granted") {
        setStatus("default");
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
          applicationServerKey: urlBase64ToUint8Array(publicKey),
          userVisibleOnly: true,
        }));

      const response = await fetch("/api/push/subscriptions", {
        body: JSON.stringify({
          ...subscription.toJSON(),
          playerId: user.playerId,
        }),
        headers: {
          "content-type": "application/json",
        },
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("No se pudo guardar la suscripción.");
      }

      setStatus("subscribed");
      setMessage("Notificaciones habilitadas en este dispositivo.");
    } catch {
      setMessage("No se pudieron habilitar las notificaciones.");
    } finally {
      setLoadingMessage("");
    }
  }

  async function unsubscribe() {
    setMessage("");
    setLoadingMessage("Desactivando notificaciones...");

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        await fetch("/api/push/subscriptions", {
          body: JSON.stringify({ endpoint: subscription.endpoint }),
          headers: {
            "content-type": "application/json",
          },
          method: "DELETE",
        });
        await subscription.unsubscribe();
      }

      setStatus("unsubscribed");
      setMessage("Notificaciones desactivadas en este dispositivo.");
    } catch {
      setMessage("No se pudieron desactivar las notificaciones.");
    } finally {
      setLoadingMessage("");
    }
  }

  async function sendTest() {
    setMessage("");
    setLoadingMessage("Enviando notificación de prueba...");

    try {
      const response = await fetch("/api/push/test", { method: "POST" });

      if (!response.ok) {
        throw new Error("No se pudo enviar la prueba.");
      }

      setMessage("Notificación de prueba enviada.");
    } catch {
      setMessage("No se pudo enviar la prueba.");
    } finally {
      setLoadingMessage("");
    }
  }

  async function markRead(notificationId: string) {
    setLoadingMessage("Actualizando notificación...");

    try {
      const response = await fetch("/api/notifications", {
        body: JSON.stringify({ notificationId }),
        headers: {
          "content-type": "application/json",
        },
        method: "PATCH",
      });

      if (!response.ok) {
        throw new Error("No se pudo marcar como leída.");
      }

      await loadHistory();
    } finally {
      setLoadingMessage("");
    }
  }

  const disabled =
    status === "checking" || status === "unsupported" || status === "unconfigured";

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <LoadingModal open={Boolean(loadingMessage)} description={loadingMessage} />
      <SheetTrigger asChild>
        <Button variant="outline" size="icon" className="relative">
          <Bell />
          <span className="sr-only">Abrir notificaciones</span>
          {unreadCount > 0 ? (
            <span className="bg-destructive text-destructive-foreground absolute -top-1 -right-1 grid min-h-5 min-w-5 place-items-center rounded-full px-1 text-[10px] font-bold">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          ) : null}
        </Button>
      </SheetTrigger>
      <SheetContent className="flex w-full flex-col p-0 sm:max-w-md">
        <div className="border-border border-b px-5 py-4">
          <SheetTitle className="flex items-center gap-2 text-base">
            <Bell className="text-primary size-5" />
            Notificaciones
          </SheetTitle>
          <SheetDescription className="text-muted-foreground mt-1 text-sm">
            Cuotas, recordatorios y votaciones del club.
          </SheetDescription>
        </div>

        <div className="grid gap-4 overflow-y-auto px-5 py-4">
          <section className="bg-muted/40 grid gap-3 rounded-md border p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium">Estado del dispositivo</p>
                <p className="text-muted-foreground mt-1 text-xs">
                  {getStatusText(status)}
                </p>
              </div>
              <Badge variant={status === "subscribed" ? "success" : "secondary"}>
                {status === "subscribed" ? "Activo" : "Inactivo"}
              </Badge>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              {status === "subscribed" ? (
                <>
                  <Button type="button" size="sm" variant="outline" onClick={sendTest}>
                    <Send />
                    Probar
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={unsubscribe}>
                    <BellOff />
                    Desactivar
                  </Button>
                </>
              ) : (
                <Button type="button" size="sm" disabled={disabled} onClick={subscribe}>
                  <Bell />
                  Habilitar notificaciones
                </Button>
              )}
            </div>
            {message ? (
              <p className="text-primary text-xs font-medium">{message}</p>
            ) : null}
          </section>

          <section className="grid gap-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold">Historial</h2>
              <Badge variant="outline">{notifications.length}</Badge>
            </div>

            {notifications.length > 0 ? (
              notifications.map((notification) => (
                <article
                  key={notification.id}
                  className="border-border bg-background grid gap-3 rounded-md border p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{notification.title}</p>
                      <p className="text-muted-foreground mt-1 text-xs">
                        {notification.message}
                      </p>
                    </div>
                    <Badge
                      variant={notification.status === "unread" ? "warning" : "secondary"}
                    >
                      {notification.status === "unread" ? "Nueva" : "Leída"}
                    </Badge>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-muted-foreground text-xs">
                      {formatDateTime(notification.createdAt)}
                    </p>
                    <div className="flex gap-2">
                      {notification.url ? (
                        <Button asChild size="sm" variant="outline">
                          <a href={notification.url}>
                            <ExternalLink />
                            Abrir
                          </a>
                        </Button>
                      ) : null}
                      {notification.status === "unread" ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => void markRead(notification.id)}
                        >
                          <Check />
                          Leída
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </article>
              ))
            ) : (
              <div className="border-border rounded-md border border-dashed p-4 text-sm">
                <p className="font-medium">Todavía no hay notificaciones.</p>
                <p className="text-muted-foreground mt-1 text-xs">
                  Cuando haya cuotas impagas o votaciones MVP disponibles van a aparecer
                  acá.
                </p>
              </div>
            )}
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function isPushSupported() {
  return (
    typeof window !== "undefined" &&
    "Notification" in window &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    window.isSecureContext
  );
}

function getStatusText(status: PushStatus) {
  const labels: Record<PushStatus, string> = {
    checking: "Chequeando compatibilidad de notificaciones...",
    default: "Habilitá notificaciones para recibir avisos en este dispositivo.",
    denied:
      "El navegador tiene bloqueadas las notificaciones. Revisá la configuración del sitio.",
    subscribed: "Este dispositivo puede recibir avisos aunque la app no esté abierta.",
    unconfigured: "Faltan las claves VAPID en variables de entorno.",
    unsupported: "Este navegador no soporta push notifications para esta instalación.",
    unsubscribed: "Habilitá notificaciones para recibir avisos en este dispositivo.",
  };

  return labels[status];
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = `${base64String}${padding}`.replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);

  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}
