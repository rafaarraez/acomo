// Tipos y utilidades puras de conversión — seguras para usar en cliente y servidor.
// No importar nada que dependa del servidor aquí.

export type Currency = "VES" | "USD" | "EUR" | "USDT";

// Orden de los botones del selector (Bs al final).
export const CURRENCIES: Currency[] = ["USD", "EUR", "USDT", "VES"];
// Orden de los resultados del convertidor (Bs primero).
export const RESULT_ORDER: Currency[] = ["VES", "USD", "EUR", "USDT"];

export const CURRENCY_META: Record<
  Currency,
  { label: string; short: string; symbol: string; emoji: string; hint: string }
> = {
  USD: {
    label: "Dólar BCV",
    short: "USD",
    symbol: "$",
    emoji: "🇺🇸",
    hint: "Tasa oficial del Banco Central",
  },
  EUR: {
    label: "Euro BCV",
    short: "EUR",
    symbol: "€",
    emoji: "🇪🇺",
    hint: "Tasa oficial del Banco Central",
  },
  USDT: {
    label: "USDT",
    short: "USDT",
    symbol: "₮",
    emoji: "💵",
    hint: "Promedio Binance P2P",
  },
  VES: {
    label: "Bolívares",
    short: "VES",
    symbol: "Bs",
    emoji: "🇻🇪",
    hint: "Moneda local",
  },
};

/** Estructura que consume la UI. Todos los valores "rate" son VES por 1 unidad. */
export interface Rates {
  /** VES por 1 USD (tasa oficial BCV). */
  bcvUsd: number;
  /** VES por 1 EUR (tasa oficial BCV). */
  bcvEur: number;
  /** VES que recibes al VENDER 1 USDT en Binance P2P (promedio filtrado). */
  usdtSell: number;
  /** VES que pagas al COMPRAR 1 USDT en Binance P2P (promedio filtrado). */
  usdtBuy: number;
  /** Promedio de venta y compra — la "tasa USDT" de referencia. */
  usdtAvg: number;
  /** Monto de referencia (Bs) usado para filtrar los anuncios P2P. */
  refVes: number;
  /** Nº de anuncios P2P que entraron en el promedio (venta + compra). */
  usdtSampleSize: number;
  /** De dónde salió la tasa USDT: Binance directo o aproximación del paralelo. */
  usdtSource: "binance" | "paralelo" | "none";
  /** ISO strings de última actualización de cada fuente. */
  bcvUpdatedAt: string | null;
  fetchedAt: string;
  /** Fuentes que fallaron (para avisar en la UI). */
  errors: string[];
}

/** Devuelve la tasa (VES por 1 unidad) de una moneda. Para VES es 1. */
export function rateOf(cur: Currency, rates: Rates): number {
  switch (cur) {
    case "VES":
      return 1;
    case "USD":
      return rates.bcvUsd;
    case "EUR":
      return rates.bcvEur;
    case "USDT":
      return rates.usdtAvg;
  }
}

/** Convierte un monto de una moneda a su valor en bolívares. */
export function toVes(amount: number, cur: Currency, rates: Rates): number {
  return amount * rateOf(cur, rates);
}

/** Convierte un monto en bolívares a la moneda destino. */
export function fromVes(ves: number, cur: Currency, rates: Rates): number {
  const r = rateOf(cur, rates);
  return r === 0 ? 0 : ves / r;
}

/** Convierte directamente entre dos monedas. */
export function convert(
  amount: number,
  from: Currency,
  to: Currency,
  rates: Rates,
): number {
  return fromVes(toVes(amount, from, rates), to, rates);
}

/** Operación: vendes USDT (recibes Bs) o compras USDT (pagas Bs). */
export type Direction = "sell" | "buy";

/**
 * Tasa USDT que aplica según la operación:
 *  - "sell": vendes USDT → usas el precio de VENTA (lo que te pagan por USDT).
 *  - "buy":  compras USDT → usas el precio de COMPRA (lo que te cuesta el USDT).
 * Cae al promedio si el lado pedido no está disponible.
 */
export function usdtRateFor(dir: Direction, rates: Rates): number {
  const side = dir === "sell" ? rates.usdtSell : rates.usdtBuy;
  return side || rates.usdtAvg;
}

export interface Savings {
  ves: number;
  /** Tasa USDT (VES/USDT) usada en este cálculo. */
  usdtRate: number;
  /** Tasa oficial BCV usada (USD o EUR según el input). */
  officialRate: number;
  /** Cuánto cuesta el monto en la moneda oficial (USD o EUR) a tasa BCV. */
  officialCost: number;
  /** Cuántos USDT equivalen a ese mismo monto en Bs (a la tasa direccional). */
  costUsdt: number;
  /** Diferencia de unidades a favor de USDT (moneda oficial − USDT). */
  savingAbs: number;
  /** Ahorro porcentual respecto a pagar a tasa BCV. */
  savingPct: number;
  /** Cuánto rinde 1 USDT en unidades de la moneda oficial (ej. 1.16). */
  premium: number;
  /** true si la tasa USDT supera la del BCV. */
  usdtIsCheaper: boolean;
}

/**
 * El corazón de la app: dado un valor en bolívares, compara cubrirlo a tasa
 * BCV (en USD o EUR, según lo que se esté valorando) vs. con USDT, usando la
 * tasa que corresponde a la operación (venta o compra), no el promedio.
 */
export function computeSavings(
  ves: number,
  officialRate: number,
  usdtRate: number,
): Savings {
  const oRate = officialRate || 0;
  const uRate = usdtRate || 0;
  const officialCost = oRate ? ves / oRate : 0;
  const costUsdt = uRate ? ves / uRate : 0;
  const savingAbs = officialCost - costUsdt;
  const savingPct = officialCost ? (savingAbs / officialCost) * 100 : 0;
  const premium = oRate ? uRate / oRate : 1;
  return {
    ves,
    usdtRate: uRate,
    officialRate: oRate,
    officialCost,
    costUsdt,
    savingAbs,
    savingPct,
    premium,
    usdtIsCheaper: uRate > oRate,
  };
}

// ---------------------------------------------------------------------------
// Formateo (locale Venezuela)
// ---------------------------------------------------------------------------

const nf = (min: number, max: number) =>
  new Intl.NumberFormat("es-VE", {
    minimumFractionDigits: min,
    maximumFractionDigits: max,
  });

/** Bolívares: sin decimales cuando es grande, con 2 cuando es pequeño. */
export function fmtVes(n: number): string {
  if (!isFinite(n)) return "—";
  const abs = Math.abs(n);
  const decimals = abs >= 1000 ? 2 : 2;
  return nf(2, decimals).format(n);
}

/** Formatea un monto de una divisa (USD/EUR/USDT) con 2 decimales. */
export function fmtCur(n: number, cur: Currency): string {
  if (!isFinite(n)) return "—";
  if (cur === "VES") return fmtVes(n);
  return nf(2, 2).format(n);
}

/** Tasa (VES por unidad) con hasta 2 decimales. */
export function fmtRate(n: number): string {
  if (!isFinite(n) || n === 0) return "—";
  return nf(2, 2).format(n);
}

export function fmtPct(n: number): string {
  if (!isFinite(n)) return "—";
  return nf(1, 2).format(n) + " %";
}

/** Formatea un monto con el símbolo apropiado, para mostrar de forma compacta. */
export function fmtWithSymbol(n: number, cur: Currency): string {
  const m = CURRENCY_META[cur];
  if (cur === "VES") return `${fmtVes(n)} ${m.symbol}`;
  return `${m.symbol}${fmtCur(n, cur)}`;
}
