"use client";

import { THEME_COLORS, THEME_KEY } from "@/lib/theme";

/**
 * Alterna claro/oscuro. Los iconos se muestran por CSS (variante `dark:`), así
 * que no parpadean al hidratar: el tema ya está puesto antes del primer paint.
 */
export default function ThemeToggle() {
  function toggle() {
    const root = document.documentElement;
    const next = root.dataset.theme === "light" ? "dark" : "light";
    root.dataset.theme = next;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", THEME_COLORS[next]);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      /* sin persistencia: el cambio igual aplica en esta sesión */
    }
  }

  return (
    <button
      onClick={toggle}
      aria-label="Cambiar entre tema claro y oscuro"
      title="Cambiar tema"
      className="inline-flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full border border-border bg-surface text-muted shadow-sm transition hover:border-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-400"
    >
      {/* En oscuro ofrecemos el sol; en claro, la luna. */}
      <svg
        className="hidden h-4 w-4 dark:block"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
      </svg>
      <svg
        className="h-4 w-4 dark:hidden"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z" />
      </svg>
    </button>
  );
}
