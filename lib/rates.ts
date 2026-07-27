import type { Rates } from "./exchange";

/**
 * La referencia P2P se ancla al valor de ~100 USD en bolívares (no a un monto
 * fijo en Bs), para que represente el mismo tamaño de operación aunque el
 * bolívar se devalúe. Se calcula con la tasa BCV en tiempo real.
 */
export const REF_USD = 100;
/** Respaldo si el BCV no responde (≈ 100 USD a una tasa razonable). */
const FALLBACK_REF_VES = 80_000;

const DOLARAPI = "https://ve.dolarapi.com/v1";
const BINANCE_P2P =
  "https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search";

// Refresco: BCV cambia 1 vez al día; P2P se mueve durante el día.
const BCV_REVALIDATE = 60 * 30; // 30 min
const P2P_REVALIDATE = 60 * 2; //  2 min

interface DolarApiEntry {
  moneda: string;
  fuente: string;
  promedio: number | null;
  compra: number | null;
  venta: number | null;
  fechaActualizacion: string | null;
}

async function fetchDolarApi(
  path: string,
  revalidate: number,
): Promise<DolarApiEntry> {
  const res = await fetch(`${DOLARAPI}/${path}`, {
    headers: { Accept: "application/json" },
    next: { revalidate },
  });
  if (!res.ok) throw new Error(`dolarapi ${path} -> ${res.status}`);
  return (await res.json()) as DolarApiEntry;
}

interface P2PAdv {
  adv: { price: string; minSingleTransAmount: string; maxSingleTransAmount: string };
}

/** Cuántos de los mejores anuncios promediar (los de arriba del libro). */
const TOP_ADS = 5;

/**
 * Binance devuelve los anuncios ordenados del mejor al peor para quien opera
 * (mayor precio de venta / menor de compra). Promediamos solo los primeros:
 * es el rango real al que uno cierra el cambio, no un promedio diluido por
 * anuncios lejanos que nadie toma.
 */
function bestMean(values: number[]): number {
  const clean = values.filter((v) => isFinite(v) && v > 0).slice(0, TOP_ADS);
  if (clean.length === 0) return 0;
  return clean.reduce((a, b) => a + b, 0) / clean.length;
}

/**
 * Consulta Binance P2P para USDT/VES.
 *  - tradeType "SELL": tú vendes USDT y recibes Bs (lo que te pagan).
 *  - tradeType "BUY":  tú compras USDT pagando Bs (lo que te cuesta).
 * Se filtra por `refVes` para quedarnos con anuncios de montos "de calle"
 * y no con los de rangos de millones, que sesgan la tasa.
 */
// Binance bloquea clientes sin fingerprint de navegador (responde 403 con HTML).
// Estos headers imitan al frontend oficial de Binance P2P; `clienttype: web`
// es el que marca la diferencia.
const BINANCE_HEADERS = {
  "content-type": "application/json",
  accept: "*/*",
  clienttype: "web",
  origin: "https://p2p.binance.com",
  referer: "https://p2p.binance.com/en/trade/all-payments/USDT?fiat=VES",
  "user-agent":
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  "sec-ch-ua": '"Chromium";v="125", "Not.A/Brand";v="24"',
  "sec-ch-ua-mobile": "?0",
  "sec-fetch-dest": "empty",
  "sec-fetch-mode": "cors",
  "sec-fetch-site": "same-origin",
};

async function fetchP2POnce(
  tradeType: "SELL" | "BUY",
  refVes: number,
): Promise<{ avg: number; count: number }> {
  const res = await fetch(BINANCE_P2P, {
    method: "POST",
    headers: BINANCE_HEADERS,
    body: JSON.stringify({
      asset: "USDT",
      fiat: "VES",
      tradeType,
      page: 1,
      rows: 20,
      transAmount: String(refVes),
      payTypes: [],
      publisherType: null,
    }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`binance ${tradeType} -> ${res.status}`);
  const json = (await res.json()) as { data?: P2PAdv[] };
  const prices = (json.data ?? []).map((d) => Number(d.adv.price));
  return { avg: bestMean(prices), count: Math.min(prices.length, TOP_ADS) };
}

/** Binance es intermitente (403 esporádicos): reintenta una vez. */
async function fetchP2P(tradeType: "SELL" | "BUY", refVes: number) {
  try {
    return await fetchP2POnce(tradeType, refVes);
  } catch {
    return await fetchP2POnce(tradeType, refVes);
  }
}

// --- Caché en memoria del P2P, por lado y "tier" de monto -------------------
// El precio del USDT casi no cambia entre montos cercanos (~0,2% de 2k a 500k
// Bs), así que agrupamos los montos en pocos rangos y cacheamos por rango. Así
// no le pegamos a Binance en cada tecla / cada 90s / cada pestaña, y montos
// parecidos siempre tienen su tasa. (Caché por proceso: en despliegues con
// varias instancias cada una tiene la suya, igual acota las llamadas.)
type P2PResult = { avg: number; count: number };
const P2P_TTL_MS = 60_000; // 60s
const p2pCache = new Map<string, { at: number; data: P2PResult }>();

// Rangos por equivalente en USD; `repUsd` es el monto representativo que se
// consulta para todo el rango.
const P2P_TIERS = [
  { maxUsd: 300, repUsd: 100, key: "s" },
  { maxUsd: 3000, repUsd: 1000, key: "m" },
  { maxUsd: Infinity, repUsd: 10000, key: "l" },
] as const;

function tierForUsd(usd: number) {
  return P2P_TIERS.find((t) => usd <= t.maxUsd) ?? P2P_TIERS[2];
}

async function fetchP2PCached(
  tradeType: "SELL" | "BUY",
  tierKey: string,
  refVes: number,
): Promise<P2PResult> {
  const key = `${tradeType}:${tierKey}`;
  const now = Date.now();
  const hit = p2pCache.get(key);
  if (hit && now - hit.at < P2P_TTL_MS) return hit.data;

  const data = await fetchP2P(tradeType, refVes);
  if (data.avg > 0) {
    p2pCache.set(key, { at: now, data });
    return data;
  }
  // Binance falló: servimos la última tasa buena que teníamos, si existe.
  return hit ? hit.data : data;
}

/**
 * Reúne todas las tasas. Nunca lanza: si una fuente falla, deja su valor en 0
 * y reporta el error en `errors` para que la UI avise sin romperse.
 */
export async function getRates(refOverride?: number): Promise<Rates> {
  // 1) BCV primero: lo necesitamos para anclar la referencia del P2P a ~100 USD.
  const [usd, eur] = await Promise.allSettled([
    fetchDolarApi("dolares/oficial", BCV_REVALIDATE),
    fetchDolarApi("euros/oficial", BCV_REVALIDATE),
  ]);

  const errors: string[] = [];

  const bcvUsd =
    usd.status === "fulfilled" ? usd.value?.promedio ?? 0 : 0;
  if (usd.status === "rejected" || !bcvUsd) errors.push("BCV USD");

  const bcvEur =
    eur.status === "fulfilled" ? eur.value?.promedio ?? 0 : 0;
  if (eur.status === "rejected" || !bcvEur) errors.push("BCV EUR");

  // Referencia P2P: el monto que el usuario está cambiando (en Bs) si lo pasó;
  // si no, el valor de ~100 USD (escala con la devaluación).
  const ref =
    refOverride && refOverride > 0
      ? Math.round(refOverride)
      : bcvUsd > 0
        ? Math.round(REF_USD * bcvUsd)
        : FALLBACK_REF_VES;

  // Agrupamos el monto en un "tier" y consultamos su monto representativo, para
  // que la caché acierte entre montos parecidos.
  const usdEquiv = bcvUsd > 0 ? ref / bcvUsd : REF_USD;
  const tier = tierForUsd(usdEquiv);
  const bucketRef = bcvUsd > 0 ? Math.round(tier.repUsd * bcvUsd) : ref;

  // 2) P2P (cacheado por tier) para ese rango.
  const [sell, buy] = await Promise.allSettled([
    fetchP2PCached("SELL", tier.key, bucketRef),
    fetchP2PCached("BUY", tier.key, bucketRef),
  ]);

  let usdtSell = sell.status === "fulfilled" ? sell.value.avg : 0;
  let usdtBuy = buy.status === "fulfilled" ? buy.value.avg : 0;
  let usdtSampleSize =
    (sell.status === "fulfilled" ? sell.value.count : 0) +
    (buy.status === "fulfilled" ? buy.value.count : 0);
  let usdtSource: Rates["usdtSource"] = "binance";

  // Promedio USDT: media de venta y compra si ambas existen; si no, la que haya.
  const sides = [usdtSell, usdtBuy].filter((v) => v > 0);
  let usdtAvg = sides.length
    ? sides.reduce((a, b) => a + b, 0) / sides.length
    : 0;

  // Fallback: si Binance no respondió (403 / caído), usamos el promedio del
  // mercado paralelo de dolarapi como aproximación, claramente etiquetada.
  if (!usdtAvg) {
    try {
      const paralelo = await fetchDolarApi("dolares/paralelo", P2P_REVALIDATE);
      const p = paralelo?.promedio ?? 0;
      if (p > 0) {
        usdtSell = usdtBuy = usdtAvg = p;
        usdtSource = "paralelo";
        errors.push("Binance no disponible (usando paralelo)");
      } else {
        usdtSource = "none";
        errors.push("USDT no disponible");
      }
    } catch {
      usdtSource = "none";
      errors.push("USDT no disponible");
    }
  }

  const bcvUpdatedAt =
    (usd.status === "fulfilled" && usd.value?.fechaActualizacion) ||
    (eur.status === "fulfilled" && eur.value?.fechaActualizacion) ||
    null;

  return {
    bcvUsd,
    bcvEur,
    usdtSell,
    usdtBuy,
    usdtAvg,
    refVes: bucketRef,
    usdtSampleSize,
    usdtSource,
    bcvUpdatedAt,
    fetchedAt: new Date().toISOString(),
    errors,
  };
}
