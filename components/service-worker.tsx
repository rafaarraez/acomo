"use client";

import { useEffect } from "react";

/**
 * Registra el service worker para que la app sea instalable y funcione sin
 * conexión. Solo en producción: en `next dev` el SW interfiere con el
 * hot-reload, así que ahí no se registra.
 */
export default function ServiceWorker() {
  useEffect(() => {
    if (
      process.env.NODE_ENV !== "production" ||
      typeof navigator === "undefined" ||
      !("serviceWorker" in navigator)
    ) {
      return;
    }
    const onLoad = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* sin service worker la app sigue funcionando, solo sin offline */
      });
    };
    window.addEventListener("load", onLoad);
    return () => window.removeEventListener("load", onLoad);
  }, []);

  return null;
}
