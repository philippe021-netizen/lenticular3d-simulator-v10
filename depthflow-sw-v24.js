const CACHE_NAME = "microplayer-depth-v24";
const SHELL_URLS = [
  "./depthflow-ipad.html",
  "./depthflow-manifest-v24.webmanifest",
  "https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js",
  "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0"
];

async function cacheResponse(cache, request, response) {
  if (!response || response.status === 206) return response;
  if (response.ok || response.type === "opaque") {
    try { await cache.put(request, response.clone()); } catch (error) {
      console.warn("MicroPlayer cache ignoré", request.url || request, error);
    }
  }
  return response;
}

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.allSettled(SHELL_URLS.map(async url => {
      const request = new Request(url, { cache: "reload" });
      const response = await fetch(request);
      await cacheResponse(cache, request, response);
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names
      .filter(name => name.startsWith("microplayer-depth-") && name !== CACHE_NAME)
      .map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  const isNavigation = request.mode === "navigate";
  const isAppShell = url.origin === self.location.origin;
  const isModelOrRuntime =
    url.hostname.includes("huggingface.co") ||
    url.hostname.includes("hf.co") ||
    url.hostname.includes("jsdelivr.net") ||
    /\.(onnx|wasm|mjs|json)$/i.test(url.pathname);

  if (isNavigation) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const response = await fetch(request);
        await cacheResponse(cache, request, response);
        return response;
      } catch (error) {
        return (await cache.match(request)) ||
          (await cache.match("./depthflow-ipad.html")) ||
          Response.error();
      }
    })());
    return;
  }

  if (isAppShell || isModelOrRuntime) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      await cacheResponse(cache, request, response);
      return response;
    })());
  }
});
