/* HappyHolo — aperçu articulé unifié.
   Corrige le conflit introduit par le patch déhanché : les 4 actions utilisent
   désormais le même bouton d'aperçu et passent toutes par renderSubject().
   Le déhanché conserve automatiquement son rendu naturel car son patch surcharge
   renderSubject() uniquement pour l'action torso.
*/
(()=>{
'use strict';
let installed=false,raf=0,running=false;
function install(){
  const rig=window.HappyHoloActionLocal;
  const old=document.getElementById('hhRigPreview');
  const canvas=document.getElementById('hhRigCanvas');
  if(!rig||!old||!canvas)return false;
  if(old.dataset.unifiedPreview==='1')return true;
  const b=old.cloneNode(true);
  b.dataset.unifiedPreview='1';
  old.replaceWith(b);
  const ctx=canvas.getContext('2d');
  function stop(){
    running=false;
    cancelAnimationFrame(raf);
    b.textContent='▶ Aperçu local';
    try{rig.__redrawEditor?.();}catch(_){ }
  }
  b.onclick=()=>{
    if(running){stop();return;}
    const img=rig.subjectImg||window.HappyHoloReliefState?.subjectImg;
    if(!img||typeof rig.renderSubject!=='function')return;
    running=true;
    b.textContent='■ Arrêter aperçu';
    const t0=performance.now();
    const status=document.getElementById('hhRigStatus');
    if(status)status.textContent='Aperçu actif : '+String(rig.action||'action')+' — moteur commun V3.27.';
    const loop=t=>{
      if(!running)return;
      const phase=Math.sin((t-t0)/1500*Math.PI*2);
      let frame=null;
      try{frame=rig.renderSubject(img,canvas.width,canvas.height,phase);}catch(e){
        console.warn('[HAPPYHOLO] unified rig preview',e);
        if(status)status.textContent='Erreur aperçu : '+(e?.message||e);
        stop();return;
      }
      ctx.setTransform(1,0,0,1,0,0);
      ctx.clearRect(0,0,canvas.width,canvas.height);
      ctx.fillStyle='#222';ctx.fillRect(0,0,canvas.width,canvas.height);
      if(frame)ctx.drawImage(frame,0,0,canvas.width,canvas.height);
      raf=requestAnimationFrame(loop);
    };
    raf=requestAnimationFrame(loop);
  };
  rig.__stopUnifiedPreview=stop;
  installed=true;
  console.log('[HAPPYHOLO] unified articulated preview installed');
  return true;
}
[200,500,1000,1800,3000].forEach(ms=>setTimeout(install,ms));
window.addEventListener('happyholo-relief-ready',()=>setTimeout(install,250));
window.addEventListener('happyholo-action-plan-changed',()=>setTimeout(install,120));
})();
