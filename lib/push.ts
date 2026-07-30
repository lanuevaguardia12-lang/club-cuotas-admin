import "server-only";

import webPush from "web-push";

import type { PushSubscriptionRecord } from "@/types/premium";

export interface WebPushPayload {
  body: string;
  tag?: string;
  title: string;
  url?: string;
}

export function getVapidPublicKey() {
  return process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
}

export function isPushConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY &&
    process.env.VAPID_PRIVATE_KEY &&
    process.env.VAPID_SUBJECT,
  );
}

export async function sendPushNotification(
  subscription: PushSubscriptionRecord,
  payload: WebPushPayload,
) {
  assertPushConfigured();
  webPush.setVapidDetails(
    process.env.VAPID_SUBJECT ?? "",
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "",
    process.env.VAPID_PRIVATE_KEY ?? "",
  );

  return webPush.sendNotification(
    {
      endpoint: subscription.endpoint,
      keys: subscription.keys,
    },
    JSON.stringify({
      badge: "/icons/favicon-32x32.png",
      body: payload.body,
      icon: "/icons/icon-192.png",
      tag: payload.tag,
      title: payload.title,
      url: payload.url ?? "/mi-cuota",
    }),
  );
}

function assertPushConfigured() {
  if (!isPushConfigured()) {
    throw new Error(
      "Push notifications require NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT.",
    );
  }
}
