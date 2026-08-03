"use client";

import { Bell, BellOff, Send } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingModal } from "@/components/ui/loading-modal";

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

interface PushNotificationPanelProps {
  playerId?: string;
}

export function PushNotificationPanel({ playerId }: PushNotificationPanelProps) {
  const [status, setStatus] = useState<PushStatus>("checking");
  const [publicKey, setPublicKey] = useState("");
  const [message, setMessage] = useState("");
  const [loadingMessage, setLoadingMessage] = useState("");

  useEffect(() => {
    let active = true;

    async function hydrateStatus() {
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

    hydrateStatus();

    return () => {
      active = false;
    };
  }, []);

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
          playerId,
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
      setMessage("Notificaciones activadas en este dispositivo.");
    } catch {
      setMessage("No se pudieron activar las notificaciones.");
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

  const disabled =
    status === "checking" || status === "unsupported" || status === "unconfigured";

  return (
    <Card>
      <LoadingModal open={Boolean(loadingMessage)} description={loadingMessage} />
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Bell className="text-muted-foreground size-4" />
          Notificaciones
        </CardTitle>
        <p className="text-muted-foreground text-sm">{getStatusText(status)}</p>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center">
        {status === "subscribed" ? (
          <>
            <Button type="button" variant="outline" onClick={sendTest}>
              <Send />
              Enviar prueba
            </Button>
            <Button type="button" variant="outline" onClick={unsubscribe}>
              <BellOff />
              Desactivar
            </Button>
          </>
        ) : (
          <Button type="button" disabled={disabled} onClick={subscribe}>
            <Bell />
            Activar notificaciones
          </Button>
        )}
        {message ? (
          <span className="text-primary text-sm font-medium">{message}</span>
        ) : null}
      </CardContent>
    </Card>
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
    default: "Activá los avisos para recibir recordatorios de cuota en este dispositivo.",
    denied:
      "El navegador tiene bloqueadas las notificaciones. Podés habilitarlas desde la configuración del sitio.",
    subscribed: "Este dispositivo puede recibir avisos aunque la app no esté abierta.",
    unconfigured: "Faltan las claves VAPID en variables de entorno.",
    unsupported: "Este navegador no soporta push notifications para esta instalación.",
    unsubscribed:
      "Activá los avisos para recibir recordatorios de cuota en este dispositivo.",
  };

  return labels[status];
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = `${base64String}${padding}`.replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);

  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}
