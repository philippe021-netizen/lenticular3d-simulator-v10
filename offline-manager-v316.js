(() => {
  'use strict';

  const PACK_VERSION = 'happyholo-offline-v1.16';
  const PACK_KEY = `${PACK_VERSION}:ready`;
  const LEGACY_READY_PREFIX = 'happyholo-offline-v';
  const MODE_KEY = 'happyholo:network-mode';
  const $ = s => document.querySelector(s);

  let registration = null;
  let preparing = false;
  let appMode = localStorage.getItem(MODE_KEY) === 'local' ? 'local' : 'connected';

  function getAnyReadyStamp(){
    let best = localStorage.getItem(PACK_KEY) || '';
    for(let i=0;i<localStorage.length;i++){
      const k=localStorage.key(i)||'';
      if(k.startsWith(LEGACY_READY_PREFIX) && k.endsWith(':ready')){
        const v=localStorage.getItem(k)||'';
        if(v && (!best || Date.parse(v)>Date.parse(best))) best=v;
      }
    }
    return best;
  }

  function formatMB(bytes){
    if(!Number.isFinite(bytes)) return '';
    return `${(bytes/1024/1024).toFixed(0)} Mo`;
  }

  function updateModeButtons(){
    const online=$('#modeOnline'), offline=$('#modeOffline');
    if(!online || !offline) return;
    const onlineActive=appMode==='connected';
    online.classList.toggle('mode-active', onlineActive);
    offline.classList.toggle('mode-active', !onlineActive);
    online.setAttribute('aria-pressed', String(onlineActive));
    offline.setAttribute('aria-pressed', String(!onlineActive));
  }

  function updateNetworkBanner(){
    const banner=$('#networkModeBanner');
    if(!banner) return;

    if(appMode==='local'){
      banner.textContent='MODE HORS LIGNE — CACHE LOCAL UNIQUEMENT';
      banner.style.background='#fff0d8';
      banner.style.color='#7a3b00';
      banner.style.border='2px solid #e29132';
    }else if(navigator.onLine){
      banner.textContent='MODE EN LIGNE — IA EN LIGNE DISPONIBLE';
      banner.style.background='#dff7e7';
      banner.style.color='#0c5c29';
      banner.style.border='2px solid #2c9b52';
    }else{
      banner.textContent='MODE EN LIGNE SÉLECTIONNÉ — RÉSEAU INDISPONIBLE';
      banner.style.background='#ffe4cf';
      banner.style.color='#7b3100';
      banner.style.border='2px solid #d86b1c';
    }
    updateModeButtons();
  }

  async function updatePackStatus(extra=''){
    const out=$('#offlinePackStatus');
    if(!out) return;
    const ready=getAnyReadyStamp();
    let storage='';
    try{
      if(navigator.storage?.estimate){
        const e=await navigator.storage.estimate();
        if(Number.isFinite(e.usage)) storage=`\nStockage navigateur utilisé : ${formatMB(e.usage)}.`;
      }
    }catch(_){}

    if(ready){
      out.textContent=`Pack hors ligne préparé sur cet iPad.\nDernière préparation : ${new Date(ready).toLocaleString('fr-FR')}.${storage}`+(extra?`\n${extra}`:'');
    }else{
      out.textContent=`Pack hors ligne pas encore préparé sur cet iPad.${storage}`+(extra?`\n${extra}`:'');
    }
  }

  async function registerServiceWorker(){
    if(!('serviceWorker' in navigator)) throw new Error('Service Worker non disponible dans ce navigateur.');
    if(!registration) registration=await navigator.serviceWorker.register('./service-worker-v316.js',{scope:'./'});
    await navigator.serviceWorker.ready;
    if(!navigator.serviceWorker.controller){
      await new Promise(resolve=>{
        let done=false;
        const finish=()=>{ if(done)return; done=true; navigator.serviceWorker.removeEventListener('controllerchange',finish); resolve(); };
        navigator.serviceWorker.addEventListener('controllerchange',finish,{once:true});
        setTimeout(finish,1500);
      });
    }
    return registration;
  }

  function postModeToWorker(){
    const msg={type:'SET_HAPPYHOLO_MODE',mode:appMode};
    const target=navigator.serviceWorker.controller || registration?.active || registration?.waiting || registration?.installing;
    try{ target?.postMessage(msg); }catch(_){}
  }

  async function setMode(mode){
    if(mode==='local' && !getAnyReadyStamp()){
      await updatePackStatus('Prépare d’abord le pack hors ligne avant de forcer le mode local.');
      return;
    }
    appMode=mode==='local'?'local':'connected';
    localStorage.setItem(MODE_KEY,appMode);
    postModeToWorker();
    updateNetworkBanner();
    if(appMode==='local'){
      await updatePackStatus('Mode hors ligne forcé : l’application n’utilisera que les ressources déjà en cache.');
    }else{
      await updatePackStatus('Mode en ligne activé : réseau et IA en ligne autorisés.');
    }
  }

  async function prepareOfflinePack(){
    if(preparing) return;
    const button=$('#prepareOfflinePack');
    const out=$('#offlinePackStatus');
    if(!navigator.onLine){
      out.textContent='Connexion nécessaire pour préparer ou réparer le pack hors ligne.';
      return;
    }

    // Préparation doit toujours se faire avec le réseau autorisé.
    if(appMode==='local') await setMode('connected');

    preparing=true;
    button.disabled=true;
    const setStep=msg=>{ out.textContent=`Préparation du pack hors ligne…\n${msg}`; };
    try{
      setStep('Activation du stockage local…');
      await registerServiceWorker();
      if(navigator.storage?.persist){ try{ await navigator.storage.persist(); }catch(_){} }
      setStep('Mise en cache de l’application…');
      const target=navigator.serviceWorker.controller || registration?.active;
      target?.postMessage({type:'CACHE_APP_SHELL'});
      try{ await fetch('https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js',{mode:'cors'}); }catch(_){}
      await new Promise(resolve=>setTimeout(resolve,900));
      const now=new Date().toISOString();
      localStorage.setItem(PACK_KEY,now);
      await updatePackStatus('Application hors ligne prête. Utilise une fois le détourage et la profondeur en mode en ligne pour mettre aussi leurs ressources IA en cache.');
    }catch(error){
      console.error('[OFFLINE]',error);
      out.textContent=`Pack application incomplet.\n${error?.message||error}\nRelance la préparation avec une connexion stable.`;
    }finally{
      preparing=false;
      button.disabled=false;
    }
  }

  async function boot(){
    $('#prepareOfflinePack')?.addEventListener('click',prepareOfflinePack);
    $('#modeOnline')?.addEventListener('click',()=>setMode('connected'));
    $('#modeOffline')?.addEventListener('click',()=>setMode('local'));

    window.addEventListener('online',()=>{ updateNetworkBanner(); updatePackStatus('Connexion réseau disponible.'); });
    window.addEventListener('offline',()=>{ updateNetworkBanner(); updatePackStatus('Connexion réseau coupée.'); });

    updateNetworkBanner();
    updatePackStatus();
    try{
      await registerServiceWorker();
      postModeToWorker();
      // Renvoie le mode au worker après un éventuel changement de contrôleur.
      navigator.serviceWorker.addEventListener('controllerchange',()=>setTimeout(postModeToWorker,50));
    }catch(error){
      console.warn('[OFFLINE] Service Worker:',error);
      updatePackStatus('Le mode hors ligne nécessite que cette page soit servie en HTTPS depuis HappyHolo/Vercel.');
    }
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
