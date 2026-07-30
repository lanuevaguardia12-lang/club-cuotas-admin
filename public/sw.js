/* global self, caches, URL, Promise, fetch */

const CACHE_NAME = "club-cuotas-admin-v2";
const STATIC_ASSETS = [
  "/favicon.ico",
  "/favicon.svg",
  "/icons/favicon-16x16.png",
  "/icons/favicon-32x32.png",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/maskable-icon-512.png",
  "/manifest.webmanifest",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .catch(() => undefined),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)),
        ),
      ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);

  if (url.origin !== self.location.origin) {
    return;
  }

  if (request.mode === "navigate" || url.pathname.startsWith("/api/")) {
    return;
  }

  const isStaticAsset =
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/favicon.svg" ||
    url.pathname === "/manifest.webmanifest";

  if (!isStaticAsset) {
    return;
  }

  event.respondWith(staleWhileRevalidate(request));
});

self.addEventListener("push", (event) => {
  const payload = getPushPayload(event);
  const title = payload.title || "La Nueva Guardia";

  event.waitUntil(
    self.registration.showNotification(title, {
      badge: payload.badge || "/icons/favicon-32x32.png",
      body: payload.body || "Tenés una nueva notificación.",
      data: {
        url: payload.url || "/mi-cuota",
      },
      icon: payload.icon || "/icons/icon-192.png",
      renotify: Boolean(payload.tag),
      tag: payload.tag,
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl = new URL(event.notification.data?.url || "/", self.location.origin);

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        const existingClient = clientList.find((client) => {
          const clientUrl = new URL(client.url);

          return clientUrl.origin === targetUrl.origin;
        });

        if (existingClient) {
          existingClient.focus();
          return existingClient.navigate(targetUrl.href);
        }

        return self.clients.openWindow(targetUrl.href);
      }),
  );
});

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cachedResponse = await cache.match(request);
  const networkResponsePromise = fetch(request)
    .then((networkResponse) => {
      if (networkResponse.ok) {
        cache.put(request, networkResponse.clone());
      }

      return networkResponse;
    })
    .catch(() => cachedResponse);

  return cachedResponse || networkResponsePromise;
}

function getPushPayload(event) {
  if (!event.data) {
    return {};
  }

  try {
    return event.data.json();
  } catch {
    return {
      body: event.data.text(),
    };
  }
}
