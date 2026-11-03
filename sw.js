// Offline-Cache. Version wird beim Build gesetzt.
// v1.6.1: Startseite (index.html) zuerst aus dem Netz, damit eine neue Version sofort lädt; Skripte/CSS tragen ?v=<Build>
// und kommen aus dem Cache dieser Version. Beim Installieren wird am HTTP-Cache vorbei geladen (cache: 'reload').
const VERSION = '1.8.0-f87084c0', CACHE = 'edt-timer-' + VERSION, Q = '?v=' + VERSION.split('-')[1];
const ASSETS = ['style.css', 'app.js', 'engine.js', 'audio.js', 'store.js', 'figures.js', 'week.js', 'fx.js'];
const FILES = ['./', 'index.html', ...ASSETS.map(f => f + Q), 'manifest.webmanifest',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(FILES.map(f => fetch(new Request(f, { cache: 'reload' })).then(res => { if (!res.ok) throw new Error(f + ' ' + res.status); return c.put(f, res); }))))
    .then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE && /^(edt-timer|repzeit)-/.test(k)).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('message', e => { if (e.data === 'version') e.source?.postMessage({ version: VERSION }); });
const fromNet = (req, ms) => new Promise((ok, no) => { const t = setTimeout(() => no(new Error('timeout')), ms); fetch(req).then(r => { clearTimeout(t); ok(r); }, err => { clearTimeout(t); no(err); }); });
self.addEventListener('fetch', e => {
  const r = e.request, url = new URL(r.url); if (r.method !== 'GET' || url.origin !== location.origin) return;
  if (r.mode === 'navigate') {
    // Netz zuerst (revalidiert), offline bzw. nach 4 s aus dem Cache
    e.respondWith(fromNet(new Request(url.origin + url.pathname, { cache: 'no-cache', credentials: 'same-origin' }), 4000)
      .then(res => { if (res.ok) { const cp = res.clone(); caches.open(CACHE).then(c => c.put('index.html', cp)); } return res; })
      .catch(() => caches.match('index.html', { cacheName: CACHE }).then(h => h || caches.match('index.html'))));
    return;
  }
  if (url.pathname.endsWith('/sw.js')) return;
  const versioned = url.searchParams.has('v');
  e.respondWith(caches.match(r, { ignoreSearch: !versioned }).then(hit => hit || fetch(r).then(res => {
    if (res.ok) { const cp = res.clone(); caches.open(CACHE).then(c => c.put(r, cp)); }
    return res;
  })).catch(() => Response.error()));
});
// Tipp auf eine Erinnerung: App fokussieren bzw. öffnen
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = e.notification.data?.url || './';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => { const c = cs[0]; if (c) { c.focus(); return c.navigate ? c.navigate(url) : null; } return self.clients.openWindow(url); }));
});
