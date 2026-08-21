const CACHE_VERSION = 'happyholo-offline-v1.1';
const APP_CACHE = `${CACHE_VERSION}-app`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

let happyHoloMode = 'connected';

const APP_SHELL = [
  './relief3d-test-v31.html',
  './relief-engine-v31.js',
  './mask-editor-v31-fluid.js',
  './v311-monotonic-patch.js',
  './offline-manager.js',
  './manifest.webmanifest'
];

const CACHEABLE_HOSTS = [
  'cdn.jsdelivr.net',
  'esm.sh',
  'staticimgly.com',
  'huggingface.co',
  'www.huggingface.co',
  'cdn-lfs.huggingface.co',
  'cdn-lfs-us-1.huggingface.co',
  'cdn-lfs-eu-1.huggingface.co'
];

function isCacheableHost(url) {
  return url.origin === self.location.origin ||
    CACHEABLE_HOSTS.some(host => url.hostname === host || url.hostname.endsWith(`.${host}`));
}

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(APP_CACHE)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key.startsWith('happyholo-offline-') &&
                         key !== APP_CACHE &&
                         key !== RUNTIME_CACHE)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

async function cacheOnly(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  return new Response(
    'HappyHolo est en MODE LOCAL et cette ressource n’est pas présente dans le pack hors ligne.',
    {status: 503, headers:{'Content-Type':'text/plain; charset=utf-8'}}
  );
}

async function cacheFirstConnected(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response && (response.ok || response.type === 'opaque')) {
    const cache = await caches.open(RUNTIME_CACHE);
    cache.put(request, response.clone()).catch(() => {});
  }
  return response;
}

async function navigationResponse(request) {
  // La navigation de la page HappyHolo elle-même peut utiliser le réseau en mode connecté.
  // En mode local, on force la copie locale.
  if (happyHoloMode === 'local') {
    return (await caches.match(request)) ||
           (await caches.match('./relief3d-test-v31.html')) ||
           new Response('HappyHolo hors ligne indisponible.', {status:503});
  }

  try {
    const response = await fetch(request);
    if (response && response.ok) {
      const cache = await caches.open(APP_CACHE);
      cache.put('./relief3d-test-v31.html', response.clone()).catch(() => {});
    }
    return response;
  } catch (_) {
    return (await caches.match(request)) ||
           (await caches.match('./relief3d-test-v31.html')) ||
           Response.error();
  }
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  if (request.mode === 'navigate') {
    event.respondWith(navigationResponse(request));
    return;
  }

  if (!isCacheableHost(url)) {
    // En mode LOCAL, aucun appel externe non explicitement autorisé.
    if (happyHoloMode === 'local') {
      event.respondWith(
        new Response('Bloqué par le MODE LOCAL HappyHolo.', {
          status:503,
          headers:{'Content-Type':'text/plain; charset=utf-8'}
        })
      );
    }
    return;
  }

  event.respondWith(
    happyHoloMode === 'local'
      ? cacheOnly(request)
      : cacheFirstConnected(request)
  );
});

self.addEventListener('message', event => {
  const data = event.data || {};

  if (data.type === 'SET_HAPPYHOLO_MODE') {
    happyHoloMode = data.mode === 'local' ? 'local' : 'connected';
    return;
  }

  if (data.type === 'CACHE_APP_SHELL') {
    event.waitUntil(
      caches.open(APP_CACHE)
        .then(cache => cache.addAll(APP_SHELL))
        .then(() => {
          if (event.source) {
            event.source.postMessage({type:'APP_SHELL_CACHED'});
          }
        })
    );
  }
});
