// Service worker : fait démarrer l'app instantanément et la rend utilisable pour l'interface hors ligne.
// Les flux vidéo et les données de chaînes ne passent jamais par ici.
const VERSION = 'zap-v4';
const SHELL = ['./', 'index.html', 'lib.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === location.origin;
  const isHlsLib = url.hostname === 'cdn.jsdelivr.net' && url.pathname.includes('hls.js');
  if (!sameOrigin && !isHlsLib) return;

  // Pages : réseau d'abord (pour recevoir les mises à jour), cache en secours
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then(r => { const c = r.clone(); caches.open(VERSION).then(x => x.put('index.html', c)); return r; })
      .catch(() => caches.match('index.html')));
    return;
  }
  // Fichiers de l'app : réseau d'abord (toujours à jour), cache en secours hors ligne
  if (sameOrigin) {
    e.respondWith(fetch(req).then(r => { if (r.ok) { const c = r.clone(); caches.open(VERSION).then(x => x.put(req, c)); } return r; })
      .catch(() => caches.match(req)));
    return;
  }
  // Bibliothèque vidéo (CDN) : cache d'abord
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => { if (r.ok) { const c = r.clone(); caches.open(VERSION).then(x => x.put(req, c)); } return r; })));
});
