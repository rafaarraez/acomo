"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CURRENCIES,
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
} from "@/lib/exchange";
import AnimatedNumber from "@/components/animated-number";
import ShareButton from "@/components/share-button";

const STORAGE_KEY = "dac:input";

/** Parseo estilo Venezuela: el punto es separador de miles, la coma decimal. */
function parseAmount(s: string): number {
  if (!s) return 0;
  const t = s
    .replace(/[^\d.,]/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : 0;
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
  const ves = useMemo(
    () => toVes(numeric, fromCur, rates),
    [numeric, fromCur, rates],
  );

  // La tasa USDT se busca para el tamaño real de TU operación: la referencia
  // que se envía a Binance es el monto que estás cambiando, en bolívares.
  const currentRef = useRef(0);
  currentRef.current = Math.round(ves) || 0;

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

  // La comparación oficial usa EUR si el input es en euros; si no, USD.
  const officialCur: Currency = fromCur === "EUR" ? "EUR" : "USD";
  const officialRate = officialCur === "EUR" ? rates.bcvEur : rates.bcvUsd;
  const usdtRate = usdtRateFor(direction, rates);
  const savings = useMemo(
    () => computeSavings(ves, officialRate, usdtRate),
    [ves, officialRate, usdtRate],
  );
  const targets = CURRENCIES.filter((c) => c !== fromCur);

  const shareText = useMemo(
    () => buildShareText(rates, numeric, fromCur, ves, savings, direction, officialCur),
    [rates, numeric, fromCur, ves, savings, direction, officialCur],
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

      <RatesStrip rates={rates} />

      <Converter
        amount={amount}
        setAmount={setAmount}
        fromCur={fromCur}
        setFromCur={setFromCur}
        numeric={numeric}
        rates={rates}
        targets={targets}
      />

      <SavingsCard
        ves={ves}
        numeric={numeric}
        savings={savings}
        rates={rates}
        direction={direction}
        setDirection={setDirection}
        officialCur={officialCur}
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
  ves: number,
  savings: ReturnType<typeof computeSavings>,
  direction: Direction,
  officialCur: Currency,
): string {
  const m = CURRENCY_META[fromCur];
  const om = CURRENCY_META[officialCur];
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
    lines.push("", `${left} = Bs ${fmtVes(ves)}`);
    if (direction === "sell" && savings.usdtIsCheaper) {
      lines.push(
        `👉 En USDT: ₮${fmtCur(savings.costUsdt, "USDT")} en vez de ${om.symbol}${fmtCur(
          savings.officialCost,
          officialCur,
        )} — ahorras ${fmtPct(savings.savingPct)}`,
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
    </header>
  );
}

/* -------------------------------------------------------------------------- */

function RatesStrip({ rates }: { rates: Rates }) {
  const premiumPct = rates.bcvUsd
    ? (rates.usdtAvg / rates.bcvUsd - 1) * 100
    : 0;
  return (
    <section className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
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
      <UsdtCard rates={rates} premiumPct={premiumPct} />
    </section>
  );
}

function UsdtCard({
  rates,
  premiumPct,
}: {
  rates: Rates;
  premiumPct: number;
}) {
  const binance = rates.usdtSource === "binance";
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
          <div className="mt-2 flex gap-4">
            <div>
              <p className="text-[11px] font-medium text-muted">Venta</p>
              <p className="tnum text-xl font-bold text-foreground">
                <AnimatedNumber value={rates.usdtSell} format={fmtRate} />
              </p>
            </div>
            <div className="border-l border-border pl-4">
              <p className="text-[11px] font-medium text-muted">Compra</p>
              <p className="tnum text-xl font-bold text-foreground">
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
}: {
  amount: string;
  setAmount: (s: string) => void;
  fromCur: Currency;
  setFromCur: (c: Currency) => void;
  numeric: number;
  rates: Rates;
  targets: Currency[];
}) {
  const meta = CURRENCY_META[fromCur];
  const [copied, setCopied] = useState<Currency | null>(null);

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
      <h2 className="text-sm font-semibold text-muted">Convertidor</h2>

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
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            placeholder="0"
            className="tnum w-full bg-transparent text-2xl font-bold outline-none placeholder:text-muted/50"
          />
        </div>
      </div>

      {/* Resultados en las otras monedas (toca para copiar) */}
      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
        {targets.map((c) => {
          const m = CURRENCY_META[c];
          const val = convert(numeric, fromCur, c, rates);
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
  ves,
  numeric,
  savings,
  rates,
  direction,
  setDirection,
  officialCur,
}: {
  ves: number;
  numeric: number;
  savings: ReturnType<typeof computeSavings>;
  rates: Rates;
  direction: Direction;
  setDirection: (d: Direction) => void;
  officialCur: Currency;
}) {
  const empty = numeric <= 0 || !savings.officialRate || !savings.usdtRate;
  const sideLabel = direction === "sell" ? "venta" : "compra";
  const overBcvPct = (savings.premium - 1) * 100;
  const om = CURRENCY_META[officialCur]; // moneda oficial: Dólar BCV o Euro BCV
  const usdtSub = rates.usdtSource === "paralelo" ? "≈ paralelo" : "Binance P2P";

  return (
    <section className="mt-4 overflow-hidden rounded-2xl border border-emerald-300/50 bg-gradient-to-br from-emerald-50 to-surface p-5 shadow-sm dark:border-emerald-500/20 dark:from-emerald-950/40 dark:to-surface">
      <h2 className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">
        {direction === "sell"
          ? `💰 ¿Cuánto ahorras pagando en USDT?`
          : "💱 Cambiando bolívares a USDT"}
      </h2>

      {/* Toggle de dirección */}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <DirButton
          active={direction === "sell"}
          onClick={() => setDirection("sell")}
          title="Vendo USDT"
          sub="Recibo bolívares"
        />
        <DirButton
          active={direction === "buy"}
          onClick={() => setDirection("buy")}
          title="Compro USDT"
          sub="Pago con bolívares"
        />
      </div>

      {empty ? (
        <p className="mt-3 text-sm text-muted">
          Escribe un monto arriba para ver el cálculo.
        </p>
      ) : direction === "sell" ? (
        <>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <RouteTile
              label={`Pagando con ${om.label}`}
              amount={`${om.symbol}${fmtCur(savings.officialCost, officialCur)}`}
              sub="Tasa oficial"
              dim
            />
            <RouteTile
              label={`Vendiendo USDT (${fmtRate(savings.usdtRate)})`}
              amount={`₮${fmtCur(savings.costUsdt, "USDT")}`}
              sub={usdtSub}
              highlight
            />
          </div>

          <div className="mt-4 flex items-end justify-between rounded-xl bg-emerald-500/10 px-4 py-3">
            <div>
              <p className="text-xs font-medium text-emerald-700 dark:text-emerald-300">
                Ahorras
              </p>
              <p className="tnum text-3xl font-extrabold text-emerald-600 dark:text-emerald-300">
                {fmtPct(savings.savingPct)}
              </p>
            </div>
            <p className="tnum text-right text-lg font-bold text-emerald-700 dark:text-emerald-200">
              {om.symbol}
              {fmtCur(savings.savingAbs, officialCur)}
              <span className="block text-xs font-normal text-emerald-600/80 dark:text-emerald-300/70">
                menos que a tasa BCV
              </span>
            </p>
          </div>

          <p className="mt-3 text-sm leading-relaxed text-foreground/80">
            Para cubrir <b className="tnum">{fmtVes(ves)} Bs</b> vendes{" "}
            <b className="tnum text-emerald-700 dark:text-emerald-300">
              ₮{fmtCur(savings.costUsdt, "USDT")}
            </b>{" "}
            (a {sideLabel} {fmtRate(savings.usdtRate)}), en vez de gastar{" "}
            <b className="tnum">
              {om.symbol}
              {fmtCur(savings.officialCost, officialCur)}
            </b>{" "}
            en {om.label}. Cada USDT rinde como{" "}
            <b className="tnum">
              {om.symbol}
              {fmtCur(savings.premium, officialCur)}
            </b>{" "}
            del BCV.
          </p>
        </>
      ) : (
        <>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <RouteTile
              label="Valor a tasa BCV"
              amount={`${om.symbol}${fmtCur(savings.officialCost, officialCur)}`}
              sub={`Referencia · ${om.label}`}
              dim
            />
            <RouteTile
              label={`Comprando USDT (${fmtRate(savings.usdtRate)})`}
              amount={`₮${fmtCur(savings.costUsdt, "USDT")}`}
              sub={usdtSub}
              highlight
            />
          </div>

          <div className="mt-4 rounded-xl bg-emerald-500/10 px-4 py-3">
            <p className="text-xs font-medium text-emerald-700 dark:text-emerald-300">
              USDT respecto al {om.label}
            </p>
            <p className="tnum text-2xl font-extrabold text-emerald-600 dark:text-emerald-300">
              {fmtRate(savings.usdtRate)} Bs{" "}
              <span className="text-sm font-semibold">
                (+{fmtPct(overBcvPct)})
              </span>
            </p>
          </div>

          <p className="mt-3 text-sm leading-relaxed text-foreground/80">
            Con <b className="tnum">{fmtVes(ves)} Bs</b> compras{" "}
            <b className="tnum text-emerald-700 dark:text-emerald-300">
              ₮{fmtCur(savings.costUsdt, "USDT")}
            </b>{" "}
            (a {sideLabel} {fmtRate(savings.usdtRate)}). A tasa BCV esos
            bolívares equivalen a{" "}
            <b className="tnum">
              {om.symbol}
              {fmtCur(savings.officialCost, officialCur)}
            </b>
            : el USDT está <b className="tnum">{fmtPct(overBcvPct)}</b> por
            encima del {om.label}.
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

function RouteTile({
  label,
  amount,
  sub,
  highlight,
  dim,
}: {
  label: string;
  amount: string;
  sub: string;
  highlight?: boolean;
  dim?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-3 ${
        highlight
          ? "border-emerald-400 bg-emerald-500/10"
          : "border-border bg-background"
      } ${dim ? "opacity-80" : ""}`}
    >
      <p className="text-xs text-muted">{label}</p>
      <p
        className={`tnum mt-1 text-xl font-bold ${
          highlight ? "text-emerald-600 dark:text-emerald-300" : ""
        }`}
      >
        {amount}
      </p>
      <p className="text-[11px] text-muted">{sub}</p>
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
