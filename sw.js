/* DealGod Service Worker — lightweight offline caching */
const CACHE_NAME = 'dealgod-v1';
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/about.html',
  '/blog.html',
  '/contact.html',
  '/privacy.html',
  '/search.html',
  '/data.js',
  '/script.js',
  '/nav.js',
  '/search-page.js',
  '/style.css',
  '/logo.png',
  '/favicon.ico'
];

self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(PRECACHE_URLS).catch(function() {
        // silently fail for missing assets (e.g. favicon)
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function(event) {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', function(event) {
  event.respondWith(
    caches.match(event.request).then(function(response) {
      if (response) return response;
      return fetch(event.request).then(function(networkResponse) {
        // Cache images and static assets dynamically
        if (event.request.method === 'GET' && (
          event.request.url.includes('/m.media-amazon.com') ||
          event.request.url.includes('/placehold.co')
        )) {
          var copy = networkResponse.clone();
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(event.request, copy);
          });
        }
        return networkResponse;
      }).catch(function() {
        // If offline and not in cache, return nothing for images
        if (event.request.destination === 'image') {
          return new Response('', { status: 204 });
        }
      });
    })
  );
});
