const CACHE_VERSION = 'happyholo-offline-v1.10';
const APP_CACHE = `${CACHE_VERSION}-app`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;
let happyHoloMode = 'connected';

const APP_SHELL = [
  './relief3d-test-v31.html',
  './relief-engine-v31.js',
  './mask-editor-v315-panfix.js',
  './v311-monotonic-patch.js',
  './support-preview.js',
  './offline-manager.js',
  './manifest.webmanifest'
];

const CACHEABLE_HOSTS = [
  'cdn.jsdelivr.net','esm.sh','staticimgly.com',
  'huggingface.co','www.huggingface.co',
  'cdn-lfs.huggingface.co','cdn-lfs-us-1.huggingface.co','cdn-lfs-eu-1.huggingface.co'
];

function cacheable(url){
  return url.origin===self.location.origin ||
    CACHEABLE_HOSTS.some(h=>url.hostname===h || url.hostname.endsWith(`.${h}`));
}

self.addEventListener('install',e=>{
  e.waitUntil(caches.open(APP_CACHE).then(c=>c.addAll(APP_SHELL)).then(()=>self.skipWaiting()));
});

self.addEventListener('activate',e=>{
  e.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(
        keys.filter(k=>k.startsWith('happyholo-offline-') && k!==APP_CACHE && k!==RUNTIME_CACHE)
            .map(k=>caches.delete(k))
      ))
      .then(()=>self.clients.claim())
  );
});

async function cacheOnly(req){
  const c=await caches.match(req);
  return c || new Response('Ressource absente du pack local HappyHolo.',{status:503});
}

async function cacheFirst(req){
  const c=await caches.match(req);
  if(c) return c;
  const r=await fetch(req);
  if(r && (r.ok || r.type==='opaque')){
    const cache=await caches.open(RUNTIME_CACHE);
    cache.put(req,r.clone()).catch(()=>{});
  }
  return r;
}

self.addEventListener('fetch',e=>{
  const req=e.request;
  if(req.method!=='GET') return;
  const url=new URL(req.url);

  if(req.mode==='navigate'){
    e.respondWith(
      happyHoloMode==='local'
        ? caches.match(req).then(r=>r || caches.match('./relief3d-test-v31.html'))
        : fetch(req).catch(()=>caches.match(req).then(r=>r || caches.match('./relief3d-test-v31.html')))
    );
    return;
  }

  if(!cacheable(url)){
    if(happyHoloMode==='local'){
      e.respondWith(new Response('Bloqué par MODE LOCAL HappyHolo.',{status:503}));
    }
    return;
  }

  e.respondWith(happyHoloMode==='local' ? cacheOnly(req) : cacheFirst(req));
});

self.addEventListener('message',e=>{
  const d=e.data||{};
  if(d.type==='SET_HAPPYHOLO_MODE') happyHoloMode=d.mode==='local'?'local':'connected';
  if(d.type==='CACHE_APP_SHELL') e.waitUntil(caches.open(APP_CACHE).then(c=>c.addAll(APP_SHELL)));
});
