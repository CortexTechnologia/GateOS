const CACHE_NAME = 'gateos-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/login.html',
  '/style.css',
  '/app.js',
  'https://fonts.googleapis.com/icon?family=Material+Icons+Round',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&display=swap'
];

// Instalando o Service Worker e salvando os arquivos no cache
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

// Interceptando as requisições para carregar rápido mesmo sem internet forte
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      // Retorna o cache se existir, senão vai para a rede
      return response || fetch(event.request);
    })
  );
});