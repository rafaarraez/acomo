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

/**
 * Devuelve la tasa (VES por 1 unidad) de una moneda. Para VES es 1.
 * El USDT va a la tasa de la operación si se indica (así el convertidor y el
 * panel de ahorro dan las mismas cifras); si no, al promedio.
 */
export function rateOf(cur: Currency, rates: Rates, dir?: Direction): number {
  switch (cur) {
    case "VES":
      return 1;
    case "USD":
      return rates.bcvUsd;
    case "EUR":
      return rates.bcvEur;
    case "USDT":
      return dir ? usdtRateFor(dir, rates) : rates.usdtAvg;
  }
}

/** Convierte un monto de una moneda a su valor en bolívares. */
export function toVes(
  amount: number,
  cur: Currency,
  rates: Rates,
  dir?: Direction,
): number {
  return amount * rateOf(cur, rates, dir);
}

/** Convierte un monto en bolívares a la moneda destino. */
export function fromVes(
  ves: number,
  cur: Currency,
  rates: Rates,
  dir?: Direction,
): number {
  const r = rateOf(cur, rates, dir);
  return r === 0 ? 0 : ves / r;
}

/** Convierte directamente entre dos monedas. */
export function convert(
  amount: number,
  from: Currency,
  to: Currency,
  rates: Rates,
  dir?: Direction,
): number {
  return fromVes(toVes(amount, from, rates, dir), to, rates, dir);
}

export interface Savings {
  /** Bolívares de la operación. */
  ves: number;
  /** Tasa USDT (VES/USDT) usada: la de venta o la de compra. */
  usdtRate: number;
  /** Tasa del dólar BCV usada. */
  bcvRate: number;
  /** USDT que se venden o compran por esos bolívares. */
  usdt: number;
  /** Esos mismos bolívares en dólares a tasa BCV. */
  usd: number;
  /** usd − usdt: lo que te ahorras (o dejas de recibir) frente a la tasa BCV. */
  diff: number;
  /** diff sobre usd: cuánto menos pagas vendiendo USDT que en divisas. */
  savingPct: number;
  /** Cuánto está el USDT por encima del dólar BCV. */
  gapPct: number;
  /** Cuántos dólares BCV vale 1 USDT (ej. 1,15). */
  premium: number;
}

/**
 * El corazón de la app: dado un monto en bolívares, compara moverlo con USDT
 * (a la tasa de la operación, no al promedio) contra el dólar a tasa BCV.
 * Siempre contra el dólar, aunque el monto venga en euros: el USDT vale un
 * dólar, así que comparar 1 € con 1 ₮ daría un ahorro que no existe.
 */
export function computeSavings(
  ves: number,
  bcvRate: number,
  usdtRate: number,
): Savings {
  const bRate = bcvRate || 0;
  const uRate = usdtRate || 0;
  const usd = bRate ? ves / bRate : 0;
  const usdt = uRate ? ves / uRate : 0;
  const diff = usd - usdt;
  return {
    ves,
    usdtRate: uRate,
    bcvRate: bRate,
    usdt,
    usd,
    diff,
    savingPct: usd ? (diff / usd) * 100 : 0,
    gapPct: bRate ? (uRate / bRate - 1) * 100 : 0,
    premium: bRate ? uRate / bRate : 1,
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
