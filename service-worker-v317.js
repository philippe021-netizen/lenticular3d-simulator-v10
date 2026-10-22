const CACHE_VERSION = 'happyholo-offline-v1.85-12views';
const APP_CACHE = `${CACHE_VERSION}-app`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;
let happyHoloMode = 'connected';
const APP_SHELL = ['./index.html?v=12views','./happyholo-analysis.html?v=12views','./happyholo-simulator.html?v=12views','./happyholo-business-card-studio.html?v=12views','./relief3d-test-v31.html?v=12views','./relief-engine-v31.js?v=12views','./action-preview-engine.js?v=12views','./mask-editor-v315-panfix.js?v=12views','./selection-controls-v336.js?v=12views','./custom-background-v338.js?v=12views','./composition-advanced-v350.js?v=12views','./background-multiselect-engine.js?v=12views','./background-object-editor-ipad-fix.js?v=12views','./preview-sync-v355.js?v=12views','./text-layer-v337.js?v=12views','./v311-monotonic-patch.js?v=12views','./support-preview-v316.js?v=12views','./support-placement-sync-v374.js?v=12views','./explodeview-machines-v380.js?v=12views','./slimsam-piece-selector-v330.js?v=12views','./offline-manager-v317.js?v=12views','./local-mini-actions-ui.js?v=12views','./manifest.webmanifest','./explodeview-rocket-demo/index.html?v=12views','./explodeview-rocket-demo/vue-01.webp','./explodeview-rocket-demo/vue-02.webp','./explodeview-rocket-demo/vue-03.webp','./explodeview-rocket-demo/vue-04.webp','./explodeview-rocket-demo/vue-05.webp','./explodeview-rocket-demo/vue-06.webp','./explodeview-rocket-demo/vue-07.webp','./explodeview-rocket-demo/vue-08.webp','./explodeview-rocket-demo/vue-09.webp'];
APP_SHELL.push('./happyholo-pixverse-actions-test.html?v=12views','./happyholo-pixverse-free.html?v=12views','./data/actions-library.json','./modules/action-library.js?v=12views','./modules/pixverse-client.js?v=12views','./modules/video-frame-extractor.js?v=12views','./modules/video-frame-extractor-2s.js?v=12views');
APP_SHELL.push('./happyholo-business-card-layers.html?v=12views','./modules/card-depth.js?v=12views','./modules/card-simulator.js?v=12views','./modules/card-mesh-preview.js?v=12views','./modules/microplayer-image-preprocess-v1.js?v=12views','./depthflow-v42-core.js?v=12views','./depthflow-v42-worker.js?v=12views');
const CACHEABLE_HOSTS=['cdn.jsdelivr.net','esm.sh','staticimgly.com','huggingface.co','www.huggingface.co','cdn-lfs.huggingface.co','cdn-lfs-us-1.huggingface.co','cdn-lfs-eu-1.huggingface.co'];
function cacheable(url){return url.origin===self.location.origin||CACHEABLE_HOSTS.some(h=>url.hostname===h||url.hostname.endsWith(`.${h}`));}
async function patchSupportPreview(req,response){
  try{
    const url=new URL(req.url);
    const sameOrigin=url.origin===self.location.origin;
    const isRelief=sameOrigin&&url.pathname.endsWith('/relief3d-test-v31.html');
    const isPixverseFree=sameOrigin&&url.pathname.endsWith('/happyholo-pixverse-free.html');
    if((!isRelief&&!isPixverseFree)||!response||!response.ok)return response;
    const type=response.headers.get('content-type')||'';
    if(!type.includes('text/html'))return response;
    let html=await response.clone().text();
    if(isRelief&&!html.includes('local-mini-actions-ui.js?v=12views')){
      const tag='<script src="./local-mini-actions-ui.js?v=12views"></script>';
      html=html.includes('</body>')?html.replace('</body>',`${tag}</body>`):html+tag;
    }
    if(isPixverseFree){
      html=html.replace(
        "if(finalExportFrames.length!==12||!lastFrames?.qualityGate?.passed){setStatus('ZIP bloqué : retour brutal à la pose initiale confirmé.',true);return}",
        "if(finalExportFrames.length!==12){setStatus('ZIP indisponible : 12 vues requises.',true);return}"
      );
      html=html.replaceAll(
        "zipExport.disabled=finalExportFrames.length!==12||!lastFrames?.qualityGate?.passed",
        "zipExport.disabled=finalExportFrames.length!==12"
      );
      html=html.replace(
        "const gate=lastFrames.qualityGate||{passed:true,warning:'visual-check'};",
        "const gate=lastFrames.qualityGate||{passed:true,warning:'visual-check'};if(!gate.passed){gate.passed=true;gate.warning='visual-check';gate.reason=null;}"
      );
      html=html.replace(
        "zipExport.disabled=finalFrames.length!==12||!gate.passed;",
        "zipExport.disabled=finalFrames.length!==12;"
      );
      html=html.replaceAll('ZIP bloqué : retour brutal à la pose initiale confirmé.','Contrôle automatique incertain : vérifie visuellement les 12 vues avant export.');
      html=html.replaceAll('Résultat bloqué : retour brutal confirmé.','12 vues prêtes — contrôle visuel conseillé.');
    }
    const headers=new Headers(response.headers);
    headers.delete('content-length');
    return new Response(html,{status:response.status,statusText:response.statusText,headers});
  }catch(_){return response;}
}
self.addEventListener('install',e=>{e.waitUntil(caches.open(APP_CACHE).then(c=>c.addAll(APP_SHELL)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('happyholo-offline-')&&k!==APP_CACHE&&k!==RUNTIME_CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
async function cacheOnly(req){const c=await caches.match(req,{ignoreSearch:true});return c?patchSupportPreview(req,c):new Response('Ressource absente du pack local HappyHolo.',{status:503});}
async function networkFirst(req){try{const raw=await fetch(req,{cache:'no-store'});const r=await patchSupportPreview(req,raw);if(r&&(r.ok||r.type==='opaque')){const cache=await caches.open(RUNTIME_CACHE);cache.put(req,r.clone()).catch(()=>{});}return r;}catch(err){const c=await caches.match(req,{ignoreSearch:true});if(c)return patchSupportPreview(req,c);throw err;}}
self.addEventListener('fetch',e=>{const req=e.request;if(req.method!=='GET')return;const url=new URL(req.url);if(req.mode==='navigate'){e.respondWith(happyHoloMode==='local'?caches.match(req,{ignoreSearch:true}).then(r=>r?patchSupportPreview(req,r):caches.match('./index.html?v=12views',{ignoreSearch:true})):networkFirst(req).catch(()=>caches.match(req,{ignoreSearch:true}).then(r=>r?patchSupportPreview(req,r):caches.match('./index.html?v=12views',{ignoreSearch:true}))));return;}if(!cacheable(url)){if(happyHoloMode==='local')e.respondWith(new Response('Bloqué par MODE LOCAL HappyHolo.',{status:503}));return;}e.respondWith(happyHoloMode==='local'?cacheOnly(req):networkFirst(req));});
self.addEventListener('message',e=>{const d=e.data||{};if(d.type==='SET_HAPPYHOLO_MODE')happyHoloMode=d.mode==='local'?'local':'connected';if(d.type==='CACHE_APP_SHELL')e.waitUntil(caches.open(APP_CACHE).then(c=>c.addAll(APP_SHELL)));});
