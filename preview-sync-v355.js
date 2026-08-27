/* HappyHolo V3.5.5 — synchronisation stricte vignette / aperçu principal */
(() => {
  'use strict';

  function syncPreviewSize(){
    const main=document.querySelector('#view');
    const preview=document.querySelector('#happyHoloStickyPreview canvas');
    if(!main||!preview)return;

    const w=main.width||1024;
    const h=main.height||768;
    if(preview.width!==w)preview.width=w;
    if(preview.height!==h)preview.height=h;

    preview.style.aspectRatio=`${w} / ${h}`;
    preview.style.width='100%';
    preview.style.height='auto';
    preview.style.maxHeight='38vh';
    preview.style.objectFit='contain';

    const dock=document.querySelector('#happyHoloStickyPreview');
    if(dock){
      const ratio=w/h;
      dock.style.width=ratio>1.15?'min(420px,46vw)':'min(320px,42vw)';
    }

    try{window.renderAt?.(0,preview);}catch(_){ }
  }

  const schedule=()=>requestAnimationFrame(syncPreviewSize);

  window.addEventListener('happyholo-relief-ready',schedule);
  window.addEventListener('happyholo-background-changed',schedule);
  window.addEventListener('happyholo-subject-placement-changed',schedule);
  window.addEventListener('resize',schedule);
  document.querySelector('#file')?.addEventListener('change',()=>setTimeout(syncPreviewSize,150));

  const obs=new MutationObserver(()=>{
    if(document.querySelector('#happyHoloStickyPreview canvas')){
      syncPreviewSize();
      obs.disconnect();
    }
  });
  obs.observe(document.documentElement,{childList:true,subtree:true});

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule,{once:true});
  else schedule();

  console.log('[HAPPYHOLO] preview sync V3.5.5 actif');
})();
