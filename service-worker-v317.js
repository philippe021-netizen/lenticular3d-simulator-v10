const CACHE_VERSION = 'happyholo-offline-v1.53';
const APP_CACHE = `${CACHE_VERSION}-app`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;
let happyHoloMode = 'connected';
const APP_SHELL = ['./relief3d-test-v31.html','./relief-engine-v31.js','./action-preview-engine.js','./mask-editor-v315-panfix.js','./selection-controls-v336.js','./custom-background-v338.js','./composition-advanced-v350.js','./background-multiselect-engine.js','./background-object-editor-ipad-fix.js','./preview-sync-v355.js','./text-layer-v337.js','./v311-monotonic-patch.js','./support-preview-v316.js','./support-placement-sync-v374.js','./offline-manager-v317.js','./manifest.webmanifest'];
const CACHEABLE_HOSTS=['cdn.jsdelivr.net','esm.sh','staticimgly.com','huggingface.co','www.huggingface.co','cdn-lfs.huggingface.co','cdn-lfs-us-1.huggingface.co','cdn-lfs-eu-1.huggingface.co'];
function cacheable(url){return url.origin===self.location.origin||CACHEABLE_HOSTS.some(h=>url.hostname===h||url.hostname.endsWith(`.${h}`));}
function isPixVerseApi(url){return url.origin===self.location.origin&&url.pathname.startsWith('/api/pixverse-');}
function isReliefPage(url){return url.origin===self.location.origin&&url.pathname.endsWith('/relief3d-test-v31.html');}
async function injectIpadFix(response,url){
  if(!response||!response.ok||!isReliefPage(url))return response;
  try{
    const html=await response.clone().text();
    const needsMulti=!html.includes('background-multiselect-engine.js');
    const needsEditor=!html.includes('background-object-editor-ipad-fix.js');
    if(!needsMulti&&!needsEditor)return response;
    let scripts='';
    if(needsMulti)scripts+='<script src="./background-multiselect-engine.js?v=20260829a"></script>';
    if(needsEditor)scripts+='<script src="./background-object-editor-ipad-fix.js?v=20260829d"></script>';
    const patched=html.replace('</body>',`${scripts}</body>`);
    const headers=new Headers(response.headers);headers.set('content-type','text/html; charset=utf-8');headers.delete('content-length');
    return new Response(patched,{status:response.status,statusText:response.statusText,headers});
  }catch(_){return response;}
}
self.addEventListener('install',e=>{e.waitUntil(caches.open(APP_CACHE).then(c=>c.addAll(APP_SHELL)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('happyholo-offline-')&&k!==APP_CACHE&&k!==RUNTIME_CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
async function cacheOnly(req){const c=await caches.match(req);return c||new Response('Ressource absente du pack local HappyHolo.',{status:503});}
async function networkFirst(req){try{const r=await fetch(req,{cache:'no-store'});if(r&&(r.ok||r.type==='opaque')){const cache=await caches.open(RUNTIME_CACHE);cache.put(req,r.clone()).catch(()=>{});}return r;}catch(err){const c=await caches.match(req);if(c)return c;throw err;}}
self.addEventListener('fetch',e=>{
  const req=e.request;
  if(req.method!=='GET')return;
  const url=new URL(req.url);
  if(isPixVerseApi(url)){e.respondWith(fetch(req,{cache:'no-store'}));return;}
  if(req.mode==='navigate'){
    e.respondWith((async()=>{let r;if(happyHoloMode==='local')r=await caches.match(req)||await caches.match('./relief3d-test-v31.html');else r=await networkFirst(req).catch(()=>caches.match('./relief3d-test-v31.html'));return injectIpadFix(r,url);})());
    return;
  }
  if(!cacheable(url)){if(happyHoloMode==='local')e.respondWith(new Response('Bloqué par MODE LOCAL HappyHolo.',{status:503}));return;}
  e.respondWith(happyHoloMode==='local'?cacheOnly(req):networkFirst(req));
});
self.addEventListener('message',e=>{const d=e.data||{};if(d.type==='SET_HAPPYHOLO_MODE')happyHoloMode=d.mode==='local'?'local':'connected';if(d.type==='CACHE_APP_SHELL')e.waitUntil(caches.open(APP_CACHE).then(c=>c.addAll(APP_SHELL)));});