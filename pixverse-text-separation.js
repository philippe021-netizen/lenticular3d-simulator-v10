/* HappyHolo — séparation texte / PixVerse V1
   Le canvas principal garde le texte à l'écran, mais lorsque le parent demande
   explicitement une capture PixVerse, le texte est suspendu le temps du PNG.
*/
(()=>{
'use strict';
const view=document.getElementById('view');
if(!view||view.dataset.hhPixTextSeparated==='1')return;
view.dataset.hhPixTextSeparated='1';
const originalToBlob=view.toBlob.bind(view);
function redraw(){try{if(typeof window.renderAt==='function'&&window.HappyHoloReliefState?.view)window.renderAt(0,window.HappyHoloReliefState.view);}catch(_){}}
view.toBlob=function(callback,type,quality){
  if(!window.__hhPixVerseCapture){return originalToBlob(callback,type,quality);}
  window.__hhPixVerseCapture=false;
  const layer=window.HappyHoloTextLayer;
  const was=!!layer?.state?.suspended;
  try{layer?.setSuspended?.(true,false);redraw();}
  catch(_){ }
  requestAnimationFrame(()=>{
    originalToBlob(blob=>{
      try{layer?.setSuspended?.(was,false);redraw();}catch(_){ }
      callback?.(blob);
    },type,quality);
  });
};
console.log('[HAPPYHOLO] séparation texte/PixVerse active');
})();