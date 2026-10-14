const CACHE = 'teachflow-shell-v2';
const CORE = [
  './', './index.html', './manifest.webmanifest', './icons/icon.svg',
  './css/style.css', './js/app.js', './js/pwa.js', './js/calc.js', './js/config.js',
  './js/forms.js', './js/schedule.js', './js/store.js', './js/ui.js', './js/util.js',
  './js/pages/calendar.js', './js/pages/classes.js', './js/pages/dashboard.js',
  './js/pages/results.js', './js/pages/salary.js', './js/pages/settings.js',
  './js/adapters/firebase.js', './js/adapters/local.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(CORE)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).then((response) => {
      const copy = response.clone();
      caches.open(CACHE).then((cache) => cache.put('./index.html', copy));
      return response;
    }).catch(() => caches.match('./index.html')));
    return;
  }

  event.respondWith(caches.match(request).then((cached) => cached || fetch(request).then((response) => {
    if (response.ok) {
      const copy = response.clone();
      caches.open(CACHE).then((cache) => cache.put(request, copy));
    }
    return response;
  })));
});
