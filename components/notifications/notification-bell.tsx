"use client";

import {
  Bell,
  BellOff,
  Check,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Info,
  RefreshCw,
  Send,
  ShieldAlert,
  TriangleAlert,
} from "lucide-react";
import { useCallback, useEffect, useState, type CSSProperties } from "react";

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
import { roleLabels } from "@/lib/auth/roles";
import { cn } from "@/lib/utils";
import type { AuthUser } from "@/types/auth";
import type { AppNotification, NotificationType } from "@/types/premium";

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
  hydrateDelayMs?: number;
  user: AuthUser;
}

export function NotificationBell({ hydrateDelayMs = 0, user }: NotificationBellProps) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<PushStatus>("checking");
  const [publicKey, setPublicKey] = useState("");
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [message, setMessage] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [markingAllRead, setMarkingAllRead] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("");

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);

    try {
      const response = await fetch("/api/notifications", {
        cache: "no-store",
      });

      if (!response.ok) {
        return;
      }

      const data = (await response.json()) as NotificationHistoryResponse;
      setNotifications(data.notifications);
      setUnreadCount(data.unreadCount);
    } catch {
      setMessage("No se pudo cargar el historial de notificaciones.");
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    let timeoutId: number | undefined;

    async function hydrate() {
      await loadHistory();

      if (!isPushSupported()) {
        if (active) {
          setStatus("unsupported");
          setHydrated(true);
        }
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
        setHydrated(true);
        return;
      }

      setPublicKey(config.publicKey);

      if (Notification.permission === "denied") {
        setStatus("denied");
        setHydrated(true);
        return;
      }

      try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();

        if (!active) {
          return;
        }

        setStatus(subscription ? "subscribed" : "unsubscribed");
        setHydrated(true);
      } catch {
        setStatus("unsupported");
        setHydrated(true);
      }
    }

    if (hydrated) {
      return;
    }

    if (hydrateDelayMs > 0 && !open) {
      timeoutId = window.setTimeout(() => void hydrate(), hydrateDelayMs);
    } else {
      void hydrate();
    }

    return () => {
      active = false;
      window.clearTimeout(timeoutId);
    };
  }, [hydrateDelayMs, hydrated, loadHistory, open]);

  const markAllRead = useCallback(async () => {
    if (markingAllRead || unreadCount <= 0) {
      return;
    }

    setMarkingAllRead(true);

    const readAt = new Date().toISOString();

    setNotifications((current) =>
      current.map((notification) =>
        notification.status === "unread"
          ? {
              ...notification,
              readAt,
              status: "read",
            }
          : notification,
      ),
    );
    setUnreadCount(0);

    try {
      const response = await fetch("/api/notifications", {
        body: JSON.stringify({ markAll: true }),
        headers: {
          "content-type": "application/json",
        },
        method: "PATCH",
      });

      if (!response.ok) {
        throw new Error("No se pudieron marcar como leídas.");
      }

      await loadHistory();
    } catch {
      setMessage("No se pudieron marcar las notificaciones como leídas.");
      await loadHistory();
    } finally {
      setMarkingAllRead(false);
    }
  }, [loadHistory, markingAllRead, unreadCount]);

  useEffect(() => {
    if (open && hydrated) {
      void loadHistory();
    }
  }, [hydrated, loadHistory, open]);

  useEffect(() => {
    if (open && unreadCount > 0) {
      void markAllRead();
    }
  }, [markAllRead, open, unreadCount]);

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);

    if (nextOpen && unreadCount > 0) {
      void markAllRead();
    }
  }

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

      setNotifications((current) =>
        current.map((notification) =>
          notification.id === notificationId
            ? {
                ...notification,
                readAt: new Date().toISOString(),
                status: "read",
              }
            : notification,
        ),
      );
      setUnreadCount((current) => Math.max(0, current - 1));
      await loadHistory();
    } finally {
      setLoadingMessage("");
    }
  }

  const disabled =
    status === "checking" || status === "unsupported" || status === "unconfigured";

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <LoadingModal open={Boolean(loadingMessage)} description={loadingMessage} />
      <SheetTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className={cn("relative", unreadCount > 0 ? "club-bell-attention" : undefined)}
        >
          <Bell />
          <span className="sr-only">Abrir notificaciones</span>
          {unreadCount > 0 ? (
            <span className="club-unread-ping bg-destructive text-destructive-foreground absolute -top-1 -right-1 grid min-h-5 min-w-5 place-items-center rounded-full px-1 text-[10px] font-bold">
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
          <section className="club-animate-fade-up bg-muted/40 grid gap-3 rounded-md border p-3">
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
              <p className="club-animate-fade-up text-primary text-xs font-medium">
                {message}
              </p>
            ) : null}
          </section>

          <section className="grid gap-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold">Historial de tu usuario</h2>
                <p className="text-muted-foreground mt-1 text-xs">
                  Avisos recibidos por usuario, jugador o rol.
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void loadHistory()}
                disabled={historyLoading}
              >
                <RefreshCw
                  className={historyLoading ? "animate-spin" : undefined}
                  aria-hidden="true"
                />
                Actualizar
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="border-border bg-background rounded-md border p-3">
                <p className="text-muted-foreground text-xs font-medium">Nuevas</p>
                <p className="mt-1 text-lg font-semibold">{unreadCount}</p>
              </div>
              <div className="border-border bg-background rounded-md border p-3">
                <p className="text-muted-foreground text-xs font-medium">Total</p>
                <p className="mt-1 text-lg font-semibold">{notifications.length}</p>
              </div>
            </div>

            {notifications.length > 0 ? (
              notifications.map((notification, index) => (
                <article
                  key={notification.id}
                  style={
                    {
                      "--club-list-delay": `${Math.min(index, 10) * 35}ms`,
                    } as CSSProperties
                  }
                  className={cn(
                    "club-animate-list-in border-border bg-background grid gap-3 rounded-md border p-3 transition-[border-color,box-shadow,transform]",
                    notification.status === "unread"
                      ? "border-primary/40 shadow-sm"
                      : undefined,
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 gap-3">
                      <div
                        className={cn(
                          "mt-0.5 grid size-8 shrink-0 place-items-center rounded-md",
                          getNotificationToneClass(notification.type),
                        )}
                      >
                        <NotificationTypeIcon
                          type={notification.type}
                          className="size-4"
                        />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{notification.title}</p>
                        <p className="text-muted-foreground mt-1 text-xs">
                          {notification.message}
                        </p>
                      </div>
                    </div>
                    <Badge
                      variant={notification.status === "unread" ? "warning" : "secondary"}
                    >
                      {getNotificationStatusLabel(notification.status)}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">
                      {getNotificationAudienceLabel(notification, user)}
                    </Badge>
                    <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
                      <Clock3 className="size-3" aria-hidden="true" />
                      {formatDateTime(notification.createdAt)}
                    </span>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-muted-foreground text-xs">
                      {notification.readAt
                        ? `Leída ${formatDateTime(notification.readAt)}`
                        : "Pendiente de lectura"}
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
            ) : historyLoading ? (
              <div className="border-border rounded-md border border-dashed p-4 text-sm">
                <p className="flex items-center gap-2 font-medium">
                  <RefreshCw className="size-4 animate-spin" aria-hidden="true" />
                  Cargando historial...
                </p>
              </div>
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

function NotificationTypeIcon({
  className,
  type,
}: {
  className?: string;
  type: NotificationType;
}) {
  if (type === "success") {
    return <CheckCircle2 className={className} aria-hidden="true" />;
  }

  if (type === "warning") {
    return <TriangleAlert className={className} aria-hidden="true" />;
  }

  if (type === "danger") {
    return <ShieldAlert className={className} aria-hidden="true" />;
  }

  return <Info className={className} aria-hidden="true" />;
}

function getNotificationToneClass(type: NotificationType) {
  const classes: Record<NotificationType, string> = {
    danger: "bg-destructive/10 text-destructive",
    info: "bg-primary/10 text-primary",
    success: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    warning: "bg-[#f4ce0f]/20 text-[#8a7200] dark:text-[#f4ce0f]",
  };

  return classes[type];
}

function getNotificationStatusLabel(status: AppNotification["status"]) {
  if (status === "unread") {
    return "Nueva";
  }

  if (status === "archived") {
    return "Archivada";
  }

  return "Leída";
}

function getNotificationAudienceLabel(notification: AppNotification, user: AuthUser) {
  if (notification.targetUserId && notification.targetUserId === user.id) {
    return "Directa";
  }

  if (
    notification.targetPlayerId &&
    user.playerId &&
    notification.targetPlayerId === user.playerId
  ) {
    return "Jugador";
  }

  if (notification.targetRole === "all") {
    return "Club";
  }

  return roleLabels[notification.targetRole];
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
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value || "-";
  }

  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = `${base64String}${padding}`.replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);

  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}
