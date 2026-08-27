/* HappyHolo V3.17 — pan fluide iPad
   Pendant le déplacement, les canvas suivent le doigt par transform GPU.
   Le moteur masque ne reçoit qu'une position finale, ce qui évite les recalculs lourds à chaque pixel.
*/
(() => {
  'use strict';

  let drag=null;

  const isPanActive=()=>{
    const buttons=[...document.querySelectorAll('button')];
    const b=buttons.find(x=>/Déplacer/.test(x.textContent||''));
    if(!b)return false;
    const c=getComputedStyle(b).backgroundColor;
    return c==='rgb(10, 132, 255)' || c==='rgb(0, 122, 255)';
  };

  const isMainEditCanvas=target=>{
    if(!(target instanceof HTMLCanvasElement))return false;
    if(!isPanActive())return false;
    const prev=target.previousElementSibling;
    return prev instanceof HTMLCanvasElement;
  };

  const forwardFinalMove=(src,target)=>{
    let ev;
    try{
      ev=new PointerEvent('pointermove',{
        bubbles:true,
        cancelable:true,
        pointerId:src.pointerId,
        pointerType:src.pointerType||'touch',
        isPrimary:src.isPrimary,
        clientX:src.clientX,
        clientY:src.clientY,
        buttons:1,
        pressure:src.pressure||0.5
      });
      Object.defineProperty(ev,'__happyHoloPanForwarded',{value:true});
      target.dispatchEvent(ev);
    }catch(_){ }
  };

  document.addEventListener('pointerdown',e=>{
    if(!isMainEditCanvas(e.target))return;
    drag={
      pointerId:e.pointerId,
      target:e.target,
      base:e.target.previousElementSibling,
      startX:e.clientX,
      startY:e.clientY,
      x:e.clientX,
      y:e.clientY
    };
    drag.target.style.willChange='transform';
    drag.base.style.willChange='transform';
  },true);

  document.addEventListener('pointermove',e=>{
    if(e.__happyHoloPanForwarded)return;
    if(!drag || e.pointerId!==drag.pointerId)return;
    if(!isPanActive())return;

    e.preventDefault();
    e.stopImmediatePropagation();

    drag.x=e.clientX;
    drag.y=e.clientY;
    const dx=drag.x-drag.startX;
    const dy=drag.y-drag.startY;
    const t=`translate3d(${dx}px,${dy}px,0)`;
    drag.base.style.transform=t;
    drag.target.style.transform=t;
  },true);

  const finish=e=>{
    if(!drag || e.pointerId!==drag.pointerId)return;
    const d=drag;
    drag=null;

    // Donne une seule position finale au moteur interne V3.16.
    forwardFinalMove(e,d.target);

    // Le redraw interne a été programmé avant ce callback : on retire le transform
    // dans le même cycle d'image après mise à jour du canvas.
    requestAnimationFrame(()=>{
      d.base.style.transform='';
      d.target.style.transform='';
      d.base.style.willChange='';
      d.target.style.willChange='';
    });
  };

  document.addEventListener('pointerup',finish,true);
  document.addEventListener('pointercancel',finish,true);

  console.log('[HAPPYHOLO] pan fluide V3.17 actif');
})();
