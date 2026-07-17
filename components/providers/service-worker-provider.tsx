"use client";

import { useEffect } from "react";

export function ServiceWorkerProvider() {
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_PWA_ENABLED === "false") {
      return;
    }

    if (!("serviceWorker" in navigator) || !window.isSecureContext) {
      return;
    }

    const registerServiceWorker = () => {
      navigator.serviceWorker.register("/sw.js").catch((error: unknown) => {
        if (process.env.NODE_ENV !== "production") {
          console.warn("Service worker registration failed", error);
        }
      });
    };

    if (document.readyState === "complete") {
      registerServiceWorker();
      return;
    }

    window.addEventListener("load", registerServiceWorker, { once: true });

    return () => {
      window.removeEventListener("load", registerServiceWorker);
    };
  }, []);

  return null;
}
