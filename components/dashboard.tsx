"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CURRENCIES,
  RESULT_ORDER,
  CURRENCY_META,
  computeSavings,
  convert,
  fmtCur,
  fmtPct,
  fmtRate,
  fmtVes,
  toVes,
  usdtRateFor,
  type Currency,
  type Direction,
  type Rates,
  type Savings,
} from "@/lib/exchange";
import AnimatedNumber from "@/components/animated-number";
import ShareButton from "@/components/share-button";
import ThemeToggle from "@/components/theme-toggle";

const STORAGE_KEY = "dac:input";

/** Deja solo dígitos y separadores: el resto no pinta nada en un monto. */
function sanitizeAmount(s: string): string {
  return s.replace(/[^\d.,]/g, "");
}

/**
 * Parseo estilo Venezuela (punto = miles, coma = decimal) pero tolerante al
 * punto como decimal: el teclado numérico de los teléfonos no trae coma.
 * Manda el último separador, salvo que venga seguido de 3 dígitos —ahí es
 * de miles—. Así "10.50" es 10,5 y "1.000" sigue siendo mil.
 */
function parseAmount(s: string): number {
  const t = sanitizeAmount(s);
  if (!t) return 0;
  const last = Math.max(t.lastIndexOf(","), t.lastIndexOf("."));
  const decimals = last === -1 ? 0 : t.length - last - 1;
  const isDecimal = last !== -1 && decimals > 0 && decimals < 3;
  const int = (isDecimal ? t.slice(0, last) : t).replace(/[.,]/g, "");
  const frac = isDecimal ? t.slice(last + 1) : "";
  const n = Number(frac ? `${int || "0"}.${frac}` : int);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/** Pistas de moneda dentro de un texto pegado. USDT va primero porque "usdt"
 *  contiene "usd". */
const CURRENCY_HINTS: { re: RegExp; cur: Currency }[] = [
  { re: /usdt|tether|₮/i, cur: "USDT" },
  { re: /€|\beur\b|euros?\b/i, cur: "EUR" },
  { re: /\$|\busd\b|d[óo]lar/i, cur: "USD" },
  { re: /\bbs\.?s?\b|\bves\b|bol[íi]var/i, cur: "VES" },
];

/**
 * Lo que se pega rara vez viene limpio: "$400", "Bs. 500,60", "600 USDT".
 * Saca el primer número del texto y, si el texto lo dice, también la moneda.
 */
function parsePasted(
  text: string,
): { amount: string; cur: Currency | null } | null {
  const amount = (text.match(/\d[\d.,]*/)?.[0] ?? "").replace(/[.,]+$/, "");
  if (!amount) return null;
  return { amount, cur: CURRENCY_HINTS.find((h) => h.re.test(text))?.cur ?? null };
}

function fmtCaracasTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat("es-VE", {
      hour: "2-digit",
      minute: "2-digit",
      day: "2-digit",
      month: "short",
      timeZone: "America/Caracas",
    }).format(new Date(iso));
  } catch {
    return "—";
  }
}

export default function Dashboard({ initialRates }: { initialRates: Rates }) {
  const [rates, setRates] = useState<Rates>(initialRates);
  const [loading, setLoading] = useState(false);
  const [amount, setAmount] = useState("100");
  const [fromCur, setFromCur] = useState<Currency>("USD");
  const [direction, setDirection] = useState<Direction>("sell");

  const numeric = parseAmount(amount);
  // Todo el USDT de la página va a la tasa de la operación elegida (venta o
  // compra): si arriba escribes ₮180, abajo tienen que salir ₮180.
  const ves = useMemo(
    () => toVes(numeric, fromCur, rates, direction),
    [numeric, fromCur, rates, direction],
  );

  // La tasa USDT se busca para el tamaño real de TU operación: la referencia
  // que se envía a Binance es el monto que estás cambiando, en bolívares.
  // El intervalo y el listener de visibilidad no deben recrearse en cada tecla,
  // así que leen el monto vigente por ref en vez de tenerlo como dependencia.
  const currentRef = useRef(0);
  useEffect(() => {
    currentRef.current = Math.round(ves) || 0;
  }, [ves]);

  const fetchRates = useCallback(async (refVes: number) => {
    setLoading(true);
    try {
      const url = refVes > 0 ? `/api/rates?ref=${refVes}` : "/api/rates";
      const res = await fetch(url, { cache: "no-store" });
      if (res.ok) setRates((await res.json()) as Rates);
    } catch {
      /* silencioso: conservamos las últimas tasas conocidas */
    } finally {
      setLoading(false);
    }
  }, []);

  // Al escribir un monto o cambiar de moneda, recalcula la tasa USDT para ese
  // rango (con debounce para no golpear Binance en cada tecla).
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    const r = currentRef.current;
    const id = setTimeout(() => fetchRates(r), 600);
    return () => clearTimeout(id);
  }, [numeric, fromCur, fetchRates]);

  // Auto-refresco cada 90s, pero SOLO con la pestaña visible: si la dejas
  // abierta en segundo plano no consume nada (ni arriesga rate-limit). Al
  // volver a la pestaña, actualiza de una.
  useEffect(() => {
    let id: ReturnType<typeof setInterval> | undefined;
    const stop = () => {
      if (id) clearInterval(id);
      id = undefined;
    };
    const start = () => {
      stop();
      id = setInterval(() => fetchRates(currentRef.current), 90_000);
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        fetchRates(currentRef.current);
        start();
      } else {
        stop();
      }
    };
    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [fetchRates]);

  // Recordar el último cálculo: cargar al abrir…
  // Va en un efecto (y no en el initializer de useState) porque el servidor no
  // tiene localStorage: leerlo durante el render rompería la hidratación.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const s = JSON.parse(raw);
      if (typeof s.amount === "string") setAmount(s.amount);
      if (CURRENCIES.includes(s.fromCur)) setFromCur(s.fromCur);
      if (s.direction === "sell" || s.direction === "buy")
        setDirection(s.direction);
    } catch {
      /* localStorage no disponible o dato corrupto: usamos los valores por defecto */
    }
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  // …y guardar cuando cambia (saltando el primer render para no pisar lo cargado).
  const firstSave = useRef(true);
  useEffect(() => {
    if (firstSave.current) {
      firstSave.current = false;
      return;
    }
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ amount, fromCur, direction }),
      );
    } catch {
      /* sin persistencia: la app sigue funcionando igual */
    }
  }, [amount, fromCur, direction]);

  const usdtRate = usdtRateFor(direction, rates);
  const savings = useMemo(
    () => computeSavings(ves, rates.bcvUsd, usdtRate),
    [ves, rates.bcvUsd, usdtRate],
  );
  const targets = RESULT_ORDER.filter((c) => c !== fromCur);

  const shareText = useMemo(
    () => buildShareText(rates, numeric, fromCur, savings, direction),
    [rates, numeric, fromCur, savings, direction],
  );

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-4 pb-16 pt-6 sm:pt-10">
      <Header
        rates={rates}
        loading={loading}
        onRefresh={() => fetchRates(currentRef.current)}
      />

      {rates.errors.length > 0 && (
        <div className="mt-4 rounded-xl border border-amber-300/60 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-950/40 dark:text-amber-200">
          ⚠️ No se pudo actualizar: {rates.errors.join(", ")}. Mostrando el
          último valor disponible.
        </div>
      )}

      <RatesStrip rates={rates} direction={direction} />

      <Converter
        amount={amount}
        setAmount={setAmount}
        fromCur={fromCur}
        setFromCur={setFromCur}
        numeric={numeric}
        rates={rates}
        targets={targets}
        direction={direction}
      />

      <SavingsCard
        numeric={numeric}
        savings={savings}
        rates={rates}
        direction={direction}
        setDirection={setDirection}
      />

      <ShareButton text={shareText} />

      <Footer />
    </div>
  );
}

/** Arma el texto que se comparte por WhatsApp / menú nativo. */
function buildShareText(
  rates: Rates,
  numeric: number,
  fromCur: Currency,
  savings: Savings,
  direction: Direction,
): string {
  const m = CURRENCY_META[fromCur];
  const lines: string[] = [
    "👀 ¿A Cómo? — el cambio de hoy",
    `BCV: Bs ${fmtRate(rates.bcvUsd)} · USDT: vende ${fmtRate(
      rates.usdtSell,
    )} / compra ${fmtRate(rates.usdtBuy)}`,
  ];
  if (numeric > 0) {
    const left =
      fromCur === "VES"
        ? `Bs ${fmtVes(numeric)}`
        : `${m.symbol}${fmtCur(numeric, fromCur)} ${m.short}`;
    lines.push("", `${left} = Bs ${fmtVes(savings.ves)}`);
    if (direction === "sell" && savings.diff > 0) {
      lines.push(
        `👉 Vendiendo USDT: ₮${fmtCur(savings.usdt, "USDT")} en vez de $${fmtCur(
          savings.usd,
          "USD",
        )} en divisas — ahorras ${fmtPct(savings.savingPct)}`,
      );
    }
  }
  return lines.join("\n");
}

/* -------------------------------------------------------------------------- */

function Header({
  rates,
  loading,
  onRefresh,
}: {
  rates: Rates;
  loading: boolean;
  onRefresh: () => void;
}) {
  return (
    <header className="flex items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          ¿A Cómo?
        </h1>
        <p className="mt-1 flex items-center gap-2 text-sm text-muted">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          Actualizado{" "}
          <span suppressHydrationWarning>
            {fmtCaracasTime(rates.fetchedAt)}
          </span>
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <ThemeToggle />
        <button
          onClick={onRefresh}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-2 text-sm font-medium shadow-sm transition hover:border-indigo-400 hover:text-indigo-600 disabled:opacity-60 dark:hover:text-indigo-400"
        >
          <svg
            className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 12a9 9 0 1 1-2.64-6.36" />
            <path d="M21 3v6h-6" />
          </svg>
          {loading ? "Actualizando" : "Actualizar"}
        </button>
      </div>
    </header>
  );
}

/* -------------------------------------------------------------------------- */

function RatesStrip({
  rates,
  direction,
}: {
  rates: Rates;
  direction: Direction;
}) {
  // Brecha del lado que se está usando, para que cuadre con el panel de abajo.
  const premiumPct = rates.bcvUsd
    ? (usdtRateFor(direction, rates) / rates.bcvUsd - 1) * 100
    : 0;
  return (
    // La tarjeta USDT lleva dos cifras lado a lado: va más ancha para que
    // quepan tasas de cuatro dígitos (1.006,82) sin salirse.
    <section className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_1.4fr]">
      <RateCard
        emoji="🇺🇸"
        title="Dólar BCV"
        value={rates.bcvUsd}
        caption="Tasa oficial · Banco Central"
        accent="indigo"
      />
      <RateCard
        emoji="🇪🇺"
        title="Euro BCV"
        value={rates.bcvEur}
        caption="Tasa oficial · Banco Central"
        accent="violet"
      />
      <UsdtCard rates={rates} premiumPct={premiumPct} direction={direction} />
    </section>
  );
}

function UsdtCard({
  rates,
  premiumPct,
  direction,
}: {
  rates: Rates;
  premiumPct: number;
  direction: Direction;
}) {
  const binance = rates.usdtSource === "binance";
  // Marca el lado que usa el resto de la página (según "Vendo / Compro USDT").
  const sideLabel = (side: Direction) =>
    `text-[11px] font-medium ${
      side === direction ? "text-emerald-600 dark:text-emerald-300" : "text-muted"
    }`;
  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-border bg-surface bg-gradient-to-br p-4 shadow-sm ${ACCENTS.emerald}`}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-muted">
          <span aria-hidden className="mr-1">
            💵
          </span>
          USDT
        </span>
        {premiumPct > 0.5 && (
          <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-300">
            +{fmtPct(premiumPct)} vs BCV
          </span>
        )}
      </div>

      {binance ? (
        <>
          {/* flex-wrap: si algún día no caben (tasas de cinco dígitos), la
              compra baja de línea en vez de cortarse. */}
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
            <div>
              <p className={sideLabel("sell")}>Venta</p>
              <p className="tnum whitespace-nowrap text-xl font-bold text-foreground">
                <AnimatedNumber value={rates.usdtSell} format={fmtRate} />
              </p>
            </div>
            <div className="border-l border-border pl-3">
              <p className={sideLabel("buy")}>Compra</p>
              <p className="tnum whitespace-nowrap text-xl font-bold text-foreground">
                <AnimatedNumber value={rates.usdtBuy} format={fmtRate} />
              </p>
            </div>
          </div>
          <p className="mt-1 text-xs text-muted">Bs · Binance P2P</p>
        </>
      ) : (
        <>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="tnum text-2xl font-bold text-foreground">
              {fmtRate(rates.usdtAvg)}
            </span>
            <span className="text-sm text-muted">Bs</span>
          </div>
          <p className="mt-1 text-xs text-muted">
            {rates.usdtSource === "paralelo"
              ? "Aprox. mercado paralelo"
              : "No disponible"}
          </p>
        </>
      )}
    </div>
  );
}

const ACCENTS: Record<string, string> = {
  indigo: "from-indigo-500/10 to-indigo-500/0 text-indigo-600 dark:text-indigo-300",
  violet: "from-violet-500/10 to-violet-500/0 text-violet-600 dark:text-violet-300",
  emerald:
    "from-emerald-500/10 to-emerald-500/0 text-emerald-600 dark:text-emerald-300",
};

function RateCard({
  emoji,
  title,
  value,
  caption,
  accent,
  badge,
}: {
  emoji: string;
  title: string;
  value: number;
  caption: string;
  accent: keyof typeof ACCENTS;
  badge?: string;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-border bg-surface bg-gradient-to-br p-4 shadow-sm ${ACCENTS[accent]}`}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-muted">
          <span aria-hidden className="mr-1">
            {emoji}
          </span>
          {title}
        </span>
        {badge && (
          <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-300">
            {badge}
          </span>
        )}
      </div>
      <div className="mt-2 flex items-baseline gap-1">
        <span className="tnum text-2xl font-bold text-foreground">
          <AnimatedNumber value={value} format={fmtRate} />
        </span>
        <span className="text-sm text-muted">Bs</span>
      </div>
      <p className="mt-1 text-xs text-muted">{caption}</p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function Converter({
  amount,
  setAmount,
  fromCur,
  setFromCur,
  numeric,
  rates,
  targets,
  direction,
}: {
  amount: string;
  setAmount: (s: string) => void;
  fromCur: Currency;
  setFromCur: (c: Currency) => void;
  numeric: number;
  rates: Rates;
  targets: Currency[];
  direction: Direction;
}) {
  const meta = CURRENCY_META[fromCur];
  const [copied, setCopied] = useState<Currency | null>(null);
  const [pasteHint, setPasteHint] = useState<string | null>(null);

  function applyPasted(text: string): boolean {
    const parsed = parsePasted(text);
    if (!parsed) return false;
    setAmount(parsed.amount);
    if (parsed.cur) setFromCur(parsed.cur);
    return true;
  }

  function hint(msg: string) {
    setPasteHint(msg);
    setTimeout(() => setPasteHint(null), 2200);
  }

  async function pasteFromClipboard() {
    try {
      const text = await navigator.clipboard.readText();
      if (!applyPasted(text)) hint("No hay ningún monto en el portapapeles");
    } catch {
      /* Firefox y los contextos no seguros no dejan leer el portapapeles */
      hint("Tu navegador no deja leer el portapapeles: pega con Ctrl+V");
    }
  }

  async function copyValue(c: Currency, val: number) {
    const digits = fmtCur(val, c); // lo que se ve, sin símbolo
    try {
      await navigator.clipboard.writeText(digits);
      setCopied(c);
      setTimeout(() => setCopied(null), 1300);
    } catch {
      /* clipboard no disponible (contexto no seguro): no hacemos nada */
    }
  }

  return (
    <section className="mt-4 rounded-2xl border border-border bg-surface p-5 shadow-sm">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold text-muted">Convertidor</h2>
        <span className="tnum text-xs text-muted">
          USDT a {direction === "sell" ? "venta" : "compra"}{" "}
          {fmtRate(usdtRateFor(direction, rates))}
        </span>
      </div>

      {/* Selector de moneda de entrada */}
      <div className="mt-3 grid grid-cols-4 gap-2">
        {CURRENCIES.map((c) => {
          const m = CURRENCY_META[c];
          const active = c === fromCur;
          return (
            <button
              key={c}
              onClick={() => setFromCur(c)}
              className={`flex flex-col items-center gap-0.5 rounded-xl border px-2 py-2 text-xs font-medium transition ${
                active
                  ? "border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-200"
                  : "border-border bg-background text-muted hover:border-indigo-300"
              }`}
            >
              <span aria-hidden className="text-base">
                {m.emoji}
              </span>
              {m.short}
            </button>
          );
        })}
      </div>

      {/* Input del monto */}
      <div className="mt-4">
        <label className="text-xs text-muted">
          Monto en {meta.label}
        </label>
        <div className="mt-1 flex items-center gap-2 rounded-xl border border-border bg-background px-4 py-3 focus-within:border-indigo-500">
          <span className="text-lg font-semibold text-muted">{meta.symbol}</span>
          <input
            value={amount}
            onChange={(e) => setAmount(sanitizeAmount(e.target.value))}
            onPaste={(e) => {
              const text = e.clipboardData.getData("text");
              // Si ya viene limpio dejamos el pegado normal (inserta donde está
              // el cursor); solo tomamos el control si hay que sanearlo.
              if (text.trim() === sanitizeAmount(text.trim())) return;
              if (applyPasted(text)) e.preventDefault();
            }}
            inputMode="decimal"
            placeholder="0"
            className="tnum w-full bg-transparent text-2xl font-bold outline-none placeholder:text-muted/50"
          />
          <button
            type="button"
            onClick={pasteFromClipboard}
            title="Pegar un monto del portapapeles"
            className="shrink-0 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-muted transition hover:border-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-300"
          >
            Pegar
          </button>
        </div>
        {pasteHint && (
          <p className="mt-1.5 text-xs text-muted">{pasteHint}</p>
        )}
      </div>

      {/* Resultados en las otras monedas (toca para copiar) */}
      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
        {targets.map((c) => {
          const m = CURRENCY_META[c];
          const val = convert(numeric, fromCur, c, rates, direction);
          const isCopied = copied === c;
          return (
            <button
              key={c}
              onClick={() => copyValue(c, val)}
              title="Toca para copiar"
              className="group relative rounded-xl border border-border bg-background px-3 py-3 text-left transition hover:border-indigo-400"
            >
              <div className="flex items-center justify-between text-xs text-muted">
                <span className="flex items-center gap-1">
                  <span aria-hidden>{m.emoji}</span>
                  {m.label}
                </span>
                <span
                  className={`text-[10px] font-medium ${
                    isCopied
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-muted/0 group-hover:text-muted"
                  }`}
                >
                  {isCopied ? "¡Copiado!" : "copiar"}
                </span>
              </div>
              <div className="tnum mt-1 text-lg font-bold">
                {c === "VES" ? "" : m.symbol}
                {fmtCur(val, c)}
                {c === "VES" ? " Bs" : ""}
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */

function SavingsCard({
  numeric,
  savings,
  rates,
  direction,
  setDirection,
}: {
  numeric: number;
  savings: Savings;
  rates: Rates;
  direction: Direction;
  setDirection: (d: Direction) => void;
}) {
  const empty = numeric <= 0 || !savings.bcvRate || !savings.usdtRate;
  const sell = direction === "sell";
  const source = rates.usdtSource === "paralelo" ? "≈ paralelo" : "Binance P2P";
  const usd = `$${fmtCur(savings.usd, "USD")}`;
  const saves = savings.diff >= 0;

  // Las dos puntas de la operación: al vender entregas USDT y recibes Bs; al
  // comprar, al revés. El monto que escribiste arriba sale tal cual en una.
  const usdtTile = (
    <TradeTile
      label={sell ? "Vendes" : "Recibes"}
      amount={`₮${fmtCur(savings.usdt, "USDT")}`}
      sub={`a ${fmtRate(savings.usdtRate)} Bs c/u · ${source}`}
      highlight
    />
  );
  const vesTile = (
    <TradeTile
      label={sell ? "Recibes" : "Pagas"}
      amount={fmtVes(savings.ves)}
      unit="Bs"
      sub={`= ${usd} a tasa BCV`}
    />
  );

  return (
    <section className="mt-4 overflow-hidden rounded-2xl border border-emerald-300/50 bg-gradient-to-br from-emerald-50 to-surface p-5 shadow-sm dark:border-emerald-500/20 dark:from-emerald-950/40 dark:to-surface">
      <h2 className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">
        💰 USDT vs. dólar BCV
      </h2>

      {/* Toggle de dirección */}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <DirButton
          active={sell}
          onClick={() => setDirection("sell")}
          title="Vendo USDT"
          sub="Recibo bolívares"
        />
        <DirButton
          active={!sell}
          onClick={() => setDirection("buy")}
          title="Compro USDT"
          sub="Pago con bolívares"
        />
      </div>

      {empty ? (
        <p className="mt-3 text-sm text-muted">
          Escribe un monto arriba para ver el cálculo.
        </p>
      ) : (
        <>
          <div className="mt-3 grid grid-cols-2 gap-3">
            {sell ? usdtTile : vesTile}
            {sell ? vesTile : usdtTile}
          </div>

          <div className="mt-4 flex items-end justify-between gap-3 rounded-xl bg-emerald-500/10 px-4 py-3">
            <div>
              <p className="text-xs font-medium text-emerald-700 dark:text-emerald-300">
                {sell
                  ? saves
                    ? "Ahorras"
                    : "Pagas de más"
                  : "USDT sobre el dólar BCV"}
              </p>
              <p className="tnum whitespace-nowrap text-3xl font-extrabold text-emerald-600 dark:text-emerald-300">
                {sell
                  ? fmtPct(Math.abs(savings.savingPct))
                  : `${savings.gapPct >= 0 ? "+" : "−"}${fmtPct(Math.abs(savings.gapPct))}`}
              </p>
            </div>
            <p className="tnum text-right text-lg font-bold text-emerald-700 dark:text-emerald-200">
              {sell
                ? `₮${fmtCur(Math.abs(savings.diff), "USDT")}`
                : `${fmtRate(savings.usdtRate)} Bs`}
              <span className="block text-xs font-normal text-emerald-600/80 dark:text-emerald-300/70">
                {sell
                  ? `${saves ? "menos" : "más"} que pagar ${usd} en divisas`
                  : `vs ${fmtRate(savings.bcvRate)} Bs del BCV`}
              </span>
            </p>
          </div>

          <p className="mt-3 text-sm leading-relaxed text-foreground/80">
            {sell ? (
              <>
                Cada USDT que vendes rinde como{" "}
                <b className="tnum">${fmtCur(savings.premium, "USD")}</b> a tasa
                BCV: por eso te alcanza con menos que pagando en divisas.
              </>
            ) : (
              <>
                Cada USDT que compras te cuesta lo que{" "}
                <b className="tnum">${fmtCur(savings.premium, "USD")}</b> a tasa
                BCV.
              </>
            )}
          </p>
        </>
      )}
    </section>
  );
}

function DirButton({
  active,
  onClick,
  title,
  sub,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  sub: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-xl border px-3 py-2 text-left transition ${
        active
          ? "border-emerald-500 bg-emerald-500/10"
          : "border-border bg-background hover:border-emerald-300"
      }`}
    >
      <span
        className={`block text-sm font-semibold ${
          active ? "text-emerald-700 dark:text-emerald-300" : ""
        }`}
      >
        {title}
      </span>
      <span className="block text-[11px] text-muted">{sub}</span>
    </button>
  );
}

function TradeTile({
  label,
  amount,
  unit,
  sub,
  highlight,
}: {
  label: string;
  amount: string;
  unit?: string;
  sub: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`min-w-0 rounded-xl border p-3 ${
        highlight
          ? "border-emerald-400 bg-emerald-500/10"
          : "border-border bg-background"
      }`}
    >
      <p className="text-xs text-muted">{label}</p>
      <p
        className={`tnum mt-1 flex flex-wrap items-baseline gap-x-1 text-lg font-bold sm:text-xl ${
          highlight ? "text-emerald-600 dark:text-emerald-300" : ""
        }`}
      >
        <span className="whitespace-nowrap">{amount}</span>
        {unit && <span className="text-sm font-semibold text-muted">{unit}</span>}
      </p>
      <p className="tnum text-[11px] text-muted">{sub}</p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function Footer() {
  return (
    <footer className="mt-8 text-center text-xs leading-relaxed text-muted">
      <p>
        Tasas BCV vía{" "}
        <a
          href="https://ve.dolarapi.com"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-foreground"
        >
          dolarapi.com
        </a>{" "}
        · USDT vía Binance P2P (mejores anuncios para ~100 USD).
      </p>
      <p className="mt-1">
        Valores referenciales. Verifica siempre antes de operar. 🙌
      </p>
    </footer>
  );
}
