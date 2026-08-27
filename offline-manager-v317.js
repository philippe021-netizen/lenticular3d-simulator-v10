(() => {
  'use strict';
  const PACK_VERSION='happyholo-offline-v1.40';
  const PACK_KEY=`${PACK_VERSION}:ready`;
  const MODE_KEY='happyholo:network-mode';
  const $=s=>document.querySelector(s);
  let registration=null;
  let appMode=localStorage.getItem(MODE_KEY)==='local'?'local':'connected';

  function updateBanner(){
    const b=$('#networkModeBanner'); if(!b)return;
    if(appMode==='local'){
      b.textContent='MODE HORS LIGNE — CACHE LOCAL UNIQUEMENT';
      b.style.background='#fff0d8';b.style.color='#7a3b00';b.style.border='2px solid #e29132';
    }else{
      b.textContent=navigator.onLine?'MODE EN LIGNE — IA EN LIGNE DISPONIBLE':'MODE EN LIGNE SÉLECTIONNÉ — RÉSEAU INDISPONIBLE';
      b.style.background=navigator.onLine?'#dff7e7':'#ffe4cf';
      b.style.color=navigator.onLine?'#0c5c29':'#7b3100';
      b.style.border=navigator.onLine?'2px solid #2c9b52':'2px solid #d86b1c';
    }
    $('#modeOnline')?.classList.toggle('mode-active',appMode==='connected');
    $('#modeOffline')?.classList.toggle('mode-active',appMode==='local');
  }

  async function register(){
    if(!('serviceWorker' in navigator))return null;
    registration=await navigator.serviceWorker.register('./service-worker-v317.js',{scope:'./',updateViaCache:'none'});
    await registration.update().catch(()=>{});
    await navigator.serviceWorker.ready;
    return registration;
  }

  function postMode(){
    const t=navigator.serviceWorker.controller||registration?.active||registration?.waiting||registration?.installing;
    t?.postMessage({type:'SET_HAPPYHOLO_MODE',mode:appMode});
  }

  async function setMode(mode){
    appMode=mode==='local'?'local':'connected';
    localStorage.setItem(MODE_KEY,appMode);
    postMode();updateBanner();
  }

  async function prepare(){
    const out=$('#offlinePackStatus'),btn=$('#prepareOfflinePack');
    if(!navigator.onLine){if(out)out.textContent='Connexion nécessaire pour préparer le pack hors ligne.';return;}
    try{
      if(btn)btn.disabled=true;
      await setMode('connected');
      await register();
      postMode();
      const t=navigator.serviceWorker.controller||registration?.active;
      t?.postMessage({type:'CACHE_APP_SHELL'});
      localStorage.setItem(PACK_KEY,new Date().toISOString());
      if(out)out.textContent='Pack hors ligne V1.40 préparé. Les anciens caches ont été remplacés.';
    }catch(e){
      if(out)out.textContent=`Erreur pack hors ligne : ${e?.message||e}`;
    }finally{
      if(btn)btn.disabled=false;
    }
  }

  async function boot(){
    $('#prepareOfflinePack')?.addEventListener('click',prepare);
    $('#modeOnline')?.addEventListener('click',()=>setMode('connected'));
    $('#modeOffline')?.addEventListener('click',()=>setMode('local'));
    updateBanner();
    try{await register();postMode();}catch(e){console.warn('[OFFLINE]',e);}
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
