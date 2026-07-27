"use client";

import { useState } from "react";

/**
 * Comparte el cálculo actual. En móvil abre el menú nativo (incluye WhatsApp);
 * si no hay Web Share API, cae directo a WhatsApp Web.
 */
export default function ShareButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function onShare() {
    const url = typeof window !== "undefined" ? window.location.origin : "";
    const full = `${text}\n\n${url}`;

    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: "¿A cómo?", text, url });
        return;
      } catch {
        /* el usuario canceló: no hacemos nada */
        return;
      }
    }
    // Fallback: abrir WhatsApp con el texto listo.
    if (typeof window !== "undefined") {
      window.open(
        `https://wa.me/?text=${encodeURIComponent(full)}`,
        "_blank",
        "noopener,noreferrer",
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }

  return (
    <button
      onClick={onShare}
      className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-500 active:scale-[0.99]"
    >
      <svg
        className="h-4 w-4"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7" />
        <path d="M16 6l-4-4-4 4" />
        <path d="M12 2v14" />
      </svg>
      {copied ? "Abriendo WhatsApp…" : "Compartir cálculo"}
    </button>
  );
}
