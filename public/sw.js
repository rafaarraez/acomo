// Service worker de "¿A cómo?".
// Estrategia:
//  - Navegaciones (la página): network-first, cae a la última copia cacheada.
//  - /api/rates: network-first, cae a la última tasa conocida (offline).
//  - Estáticos (_next, íconos): cache-first, se llenan al vuelo.
const CACHE = "dac-v1";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.add("/"))
      .catch(() => {})
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  const putInCache = (key, res) => {
    const clone = res.clone();
    caches.open(CACHE).then((c) => c.put(key, clone));
    return res;
  };

  // Tasas: red primero, guardamos copia, y si no hay red servimos la última.
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(req)
        .then((res) => putInCache(req, res))
        .catch(() => caches.match(req)),
    );
    return;
  }

  // Navegación: red primero, guardamos "/", offline servimos esa copia.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => putInCache("/", res))
        .catch(() => caches.match("/")),
    );
    return;
  }

  // Estáticos: cache primero.
  event.respondWith(
    caches.match(req).then(
      (cached) =>
        cached ||
        fetch(req)
          .then((res) => putInCache(req, res))
          .catch(() => cached),
    ),
  );
});
