(()=>{'use strict';
const STYLE_ID='hhV21CutoutFit';
function installStyle(){
  if(document.getElementById(STYLE_ID))return;
  const style=document.createElement('style');
  style.id=STYLE_ID;
  style.textContent=`
    .cutStage{height:min(42vh,460px)!important;max-height:none!important;overflow:hidden!important;position:relative!important;display:flex!important;align-items:center!important;justify-content:center!important;padding:8px!important;box-sizing:border-box!important}
    .cutStage canvas{display:block!important;width:auto!important;height:auto!important;max-width:none!important;max-height:none!important;margin:auto!important;object-fit:contain!important;transform-origin:center center!important;touch-action:none!important}
    .subPreviewStage{display:flex!important;align-items:center!important;justify-content:center!important;overflow:hidden!important;min-height:120px!important}
    .subPreviewStage canvas{display:block!important;width:auto!important;height:auto!important;max-width:none!important;max-height:none!important;margin:auto!important;object-fit:contain!important}
    .transformBox{margin-top:10px!important}
    #cutFitPreview{background:#26323e!important}
    @media (pointer:coarse){
      .cutStage{height:min(34vh,360px)!important}
      .cutCard{margin-top:8px!important}
      .transformBox{margin-top:8px!important}
      .subPreviewStage{height:min(20vh,230px)!important;min-height:100px!important}
    }
  `;
  document.head.appendChild(style);
}
function fitCanvas(canvas,stage,padding=16){
  if(!canvas||!stage||!canvas.width||!canvas.height)return;
  const sw=Math.max(40,stage.clientWidth-padding);
  const sh=Math.max(40,stage.clientHeight-padding);
  const scale=Math.min(sw/canvas.width,sh/canvas.height,1);
  canvas.style.width=Math.max(1,Math.round(canvas.width*scale))+'px';
  canvas.style.height=Math.max(1,Math.round(canvas.height*scale))+'px';
  canvas.dataset.hhFitScale=String(scale);
}
function fitAll(){
  fitCanvas(document.getElementById('cutCanvas'),document.querySelector('.cutStage'));
  fitCanvas(document.getElementById('subPreview'),document.querySelector('.subPreviewStage'));
}
function addFitButton(){
  if(document.getElementById('cutFitPreview'))return;
  const close=document.getElementById('cutClose');
  const row=close?.parentElement;
  if(!row)return;
  const b=document.createElement('button');
  b.id='cutFitPreview';
  b.type='button';
  b.textContent='⛶ Ajuster l’aperçu';
  b.addEventListener('click',()=>requestAnimationFrame(fitAll));
  row.insertBefore(b,close);
}
function watch(){
  const modal=document.getElementById('cutModal');
  const canvas=document.getElementById('cutCanvas');
  const preview=document.getElementById('subPreview');
  if(!modal||!canvas)return;
  const schedule=()=>requestAnimationFrame(()=>requestAnimationFrame(fitAll));
  const mo=new MutationObserver(schedule);
  mo.observe(modal,{attributes:true,attributeFilter:['style','class']});
  const ro=new ResizeObserver(schedule);
  ro.observe(document.querySelector('.cutStage'));
  const ps=document.querySelector('.subPreviewStage'); if(ps)ro.observe(ps);
  const attrObs=new MutationObserver(schedule);
  attrObs.observe(canvas,{attributes:true,attributeFilter:['width','height']});
  if(preview)attrObs.observe(preview,{attributes:true,attributeFilter:['width','height']});
  window.addEventListener('resize',schedule,{passive:true});
  window.addEventListener('orientationchange',schedule,{passive:true});
  document.getElementById('cutOpen')?.addEventListener('click',schedule);
  schedule();
}
function install(){installStyle();addFitButton();watch()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();