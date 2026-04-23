const CACHE_NAME = 'espanol-v8';

self.addEventListener('install', e => {
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Network-first strategy: always try fresh version, fall back to cache for offline
self.addEventListener('fetch', e => {
  // Only handle http/https GET requests — skip chrome-extension://, HEAD, etc.
  if (e.request.method !== 'GET' || !e.request.url.startsWith('http')) return;

  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
        }
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});

// Notification click handler
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const action = e.notification.data;
  e.waitUntil(
    self.clients.matchAll({ type: 'window' }).then(clients => {
      if (clients.length > 0) {
        clients[0].focus();
        clients[0].postMessage({ type: 'quiz', data: action });
      } else {
        self.clients.openWindow('./index.html#quiz');
      }
    })
  );
});
