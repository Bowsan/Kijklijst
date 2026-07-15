// Service worker: navigaties gaan network-first (nieuwe versies komen direct
// door na een deploy), assets cache-first (die hebben een hash in de naam) en
// afbeeldingen (posters, portretten, uploads) in een eigen langlevende cache.
const CACHE = 'opdebank-v3';
// v2: opaque responses worden niet meer gecachet (status onbekend → een
// mislukte fetch kon als "poster" blijven hangen); oude cache wordt geleegd.
const IMG_CACHE = 'opdebank-img-v2';
const IMG_MAX = 400; // hard plafond zodat de cache niet eindeloos groeit
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== IMG_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Covers en portretten veranderen vrijwel nooit: cache-first, dus na één keer
// laden komen ze direct uit de cache in plaats van steeds opnieuw van TMDb.
// Alleen aantoonbaar gelukte (CORS-)responses gaan de cache in: van een opaque
// response is de status onbekend, en een gecachete misser blijft anders eeuwig
// een kapotte poster.
async function imageFirst(req) {
  const cache = await caches.open(IMG_CACHE);
  const hit = await cache.match(req.url, { ignoreVary: true });
  if (hit) return hit;
  let res = null;
  try { res = await fetch(new Request(req.url, { mode: 'cors' })); } catch { /* val terug */ }
  if (res && res.ok && (res.headers.get('content-type') || '').startsWith('image/')) {
    cache.put(req.url, res.clone()).then(async () => {
      const keys = await cache.keys();
      if (keys.length > IMG_MAX) {
        for (const k of keys.slice(0, keys.length - IMG_MAX)) await cache.delete(k);
      }
    }).catch(() => {});
    return res;
  }
  // CORS mislukt (bijv. tijdelijk netwerkprobleem): geef het originele verzoek
  // door zonder te cachen, zodat een volgende poging gewoon opnieuw probeert.
  try { return await fetch(req); } catch { return Response.error(); }
}

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // API en realtime nooit cachen.
  if (url.pathname.startsWith('/api/')) return;
  if (e.request.method !== 'GET') return;

  // Afbeeldingen: TMDb (posters, portretten, dienstlogo's) en eigen uploads.
  if (url.hostname === 'image.tmdb.org' || (url.origin === self.location.origin && url.pathname.startsWith('/uploads/'))) {
    e.respondWith(imageFirst(e.request));
    return;
  }

  // Navigaties (index.html): eerst het netwerk, cache alleen als offline-terugval.
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('/index.html', copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Assets (gehashte bestandsnamen): cache-first, met netwerk als aanvulling.
  e.respondWith(
    caches.match(e.request).then((cached) =>
      cached ||
      fetch(e.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match('/index.html'))
    )
  );
});

// Web push: toon de melding en open de app bij een tik.
self.addEventListener('push', (e) => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch { /* leeg */ }
  const title = data.title || 'Op de Bank';
  e.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url: data.url || '/' },
    })
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = e.notification.data?.url || '/';
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ('focus' in c) { c.navigate(url); return c.focus(); }
      }
      return clients.openWindow(url);
    })
  );
});
