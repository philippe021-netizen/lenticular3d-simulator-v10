(()=>{'use strict';
const VERSION='V323';
function waitForReady(){
  const ready=document.querySelector('.wrap')||document.getElementById('customBgFile')||document.getElementById('aiFab');
  if(!ready){setTimeout(waitForReady,120);return;}
  if(window.__HH_V323_BG_LOADED)return;
  window.__HH_V323_BG_LOADED=true;
  const s=document.createElement('script');
  s.src='./custom-background-v338.js?v=323';
  s.onload=()=>{
    try{
      const title=document.querySelector('.hhV21Tools strong');
      if(title)title.textContent='MicroPlayer — Tiefling V323';
      const host=document.getElementById('happyHoloCustomBackgrounds');
      if(host){
        host.dataset.version=VERSION;
        const note=document.createElement('div');
        note.style.cssText='margin:0 0 10px;padding:9px 10px;border-radius:10px;background:#eef6ff;border:1px solid #9ec7ff;color:#17324d;font-size:12px;font-weight:700';
        note.textContent='V323 : le fond est traité comme une couche indépendante du sujet. Utilise “Fond IA” ou importe un fond, puis ajuste séparément le sujet (X/Y/taille/rotation) avant le calcul des 9 vues.';
        host.insertBefore(note,host.firstChild);
      }
      window.dispatchEvent(new CustomEvent('happyholo-v323-ready'));
    }catch(e){console.warn('[V323] intégration UI',e)}
  };
  s.onerror=()=>console.error('[V323] custom-background-v338.js introuvable');
  document.head.appendChild(s);
}
waitForReady();
})();
