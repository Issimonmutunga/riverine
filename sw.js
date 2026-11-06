// Flood Depth service worker: keeps the app, the map pictures people have looked at, the terrain tiles of
// analysed areas and the latest forecasts, so the app still works when mobile data drops during a flood.
// Map tiles are only kept as they are viewed: OpenStreetMap's tile policy does not allow bulk downloads.
const V = 'fd-2026-11-06d';
const SHELL = `shell-${V}`, TILES = 'fd-tiles', DATA = 'fd-data';
const MAX_TILES = 4000;

const APP = [
  './', 'index.html', 'css/style.css', 'manifest.webmanifest', 'icon.svg',
  'js/app.js', 'js/geo.js', 'js/hydro.js', 'js/panel.js', 'js/coach.js', 'js/worker.js', 'js/places.js',
  'js/tips.js', 'js/i18n.js', 'js/rail.js',
  'js/features/route.js', 'js/features/offline.js', 'js/features/share.js', 'js/features/marks.js',
  'js/features/past.js', 'js/features/timeline.js', 'js/features/language.js', 'js/features/checklist.js',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css', 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
];
const TILE_HOSTS = /(^|\.)(tile\.openstreetmap\.org|tile\.opentopomap\.org|tiles\.maps\.eox\.at)$|^storage\.googleapis\.com$|^s3\.amazonaws\.com$/;
const DATA_HOSTS = /(open-meteo\.com|gdacs\.org|nominatim\.openstreetmap\.org)$/;
const LIBS = /^(unpkg\.com|cdn\.jsdelivr\.net)$/;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => Promise.allSettled(APP.map((u) => c.add(new Request(u, { cache: 'reload' }))))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k.startsWith('shell-') && k !== SHELL).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin) return e.respondWith(networkFirst(req, SHELL, true));
  if (TILE_HOSTS.test(url.hostname)) return e.respondWith(tile(req));
  if (DATA_HOSTS.test(url.hostname)) return e.respondWith(networkFirst(req, DATA, false));
  if (LIBS.test(url.hostname)) return e.respondWith(cacheFirst(req, SHELL));
});

// App files: the newest when online, the saved copy when not. Version query strings are ignored.
async function networkFirst(req, name, ignoreSearch) {
  const cache = await caches.open(name);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(req, { ignoreSearch }) || (req.mode === 'navigate' && await cache.match('index.html'));
    if (hit) return hit;
    throw err;
  }
}
async function cacheFirst(req, name) {
  const cache = await caches.open(name);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}

// Map and terrain tiles: the saved copy first. They are fetched with CORS so the cache stores a real
// response (an opaque one would take megabytes of the storage quota each).
let puts = 0;
async function tile(req) {
  const cache = await caches.open(TILES);
  const hit = await cache.match(req.url);
  if (hit) return hit;
  let res;
  try { res = await fetch(req.url, { mode: 'cors', credentials: 'omit' }); } catch { res = null; }
  if (!res || !res.ok) return fetch(req);
  cache.put(req.url, res.clone()).then(() => { if (++puts % 50 === 0) trim(cache); });
  return res;
}
async function trim(cache) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - MAX_TILES; i++) await cache.delete(keys[i]);
}

// The page asks how many tiles are kept, for the Offline pane.
self.addEventListener('message', async (e) => {
  if (e.data?.type === 'count') {
    const n = (await (await caches.open(TILES)).keys()).length;
    e.source?.postMessage({ type: 'count', n });
  }
});
