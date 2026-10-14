// Esqueleto que se transmite de inmediato mientras `page.tsx` espera por
// getRates() (BCV + Binance). Sin esto el primer byte no sale hasta que
// responden las dos fuentes, y en iOS eso son varios segundos en blanco.
//
// Va calcado del layout real de components/dashboard.tsx para que al llegar
// los datos no salte nada de sitio. Es un Server Component: no manda JS.

/** Bloque gris de relleno. */
function Bar({ className }: { className: string }) {
  return <div className={`rounded bg-border ${className}`} />;
}

/** Caja con el mismo borde y radio que las tarjetas reales. */
function Box({ className }: { className: string }) {
  return <div className={`rounded-xl border border-border ${className}`} />;
}

export default function Loading() {
  return (
    <div
      role="status"
      aria-busy="true"
      className="mx-auto w-full max-w-2xl flex-1 animate-pulse px-4 pb-16 pt-6 motion-reduce:animate-none sm:pt-10"
    >
      <span className="sr-only">Cargando las tasas…</span>

      {/* Cabecera: el título es estático, así que se pinta de verdad. */}
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            ¿A Cómo?
          </h1>
          <Bar className="mt-2 h-4 w-44" />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Bar className="h-9 w-9 rounded-full" />
          <Bar className="h-9 w-28 rounded-full" />
        </div>
      </header>

      {/* Las tres tarjetas de tasas */}
      <section className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_1.4fr]">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="rounded-2xl border border-border bg-surface p-4 shadow-sm"
          >
            <Bar className="h-4 w-24" />
            <Bar className="mt-3 h-7 w-28" />
            <Bar className="mt-2 h-3 w-32" />
          </div>
        ))}
      </section>

      {/* Convertidor */}
      <section className="mt-4 rounded-2xl border border-border bg-surface p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-muted">Convertidor</h2>

        <div className="mt-3 grid grid-cols-4 gap-2">
          {[0, 1, 2, 3].map((i) => (
            <Box key={i} className="h-14" />
          ))}
        </div>

        <Bar className="mt-4 h-3 w-28" />
        <Box className="mt-1 h-[58px]" />

        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Box key={i} className="h-[72px]" />
          ))}
        </div>
      </section>

      {/* Panel de ahorro */}
      <section className="mt-4 rounded-2xl border border-emerald-300/50 bg-gradient-to-br from-emerald-50 to-surface p-5 shadow-sm dark:border-emerald-500/20 dark:from-emerald-950/40 dark:to-surface">
        <Bar className="h-4 w-56" />
        <Box className="mt-3 h-10 w-full" />
        <div className="mt-4 grid grid-cols-2 gap-3">
          <Box className="h-20" />
          <Box className="h-20" />
        </div>
      </section>

      {/* Botón de compartir */}
      <Bar className="mt-4 h-12 w-full rounded-2xl" />
    </div>
  );
}
