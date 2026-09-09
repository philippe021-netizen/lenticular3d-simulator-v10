(()=>{'use strict';
const STYLE_ID='hhV21CutoutFit';
let installed=false,tries=0;
function installStyle(){
  if(document.getElementById(STYLE_ID))return;
  const style=document.createElement('style');
  style.id=STYLE_ID;
  style.textContent=`
    .cutStage{height:min(42vh,460px)!important;max-height:none!important;overflow:hidden!important;position:relative!important;display:flex!important;align-items:center!important;justify-content:center!important;padding:8px!important;box-sizing:border-box!important}
    .cutStage canvas{display:block!important;width:auto!important;height:auto!important;max-width:none!important;max-height:none!important;margin:auto!important;transform-origin:center center!important;touch-action:none!important}
    .subPreviewStage{display:flex!important;align-items:center!important;justify-content:center!important;overflow:hidden!important;min-height:120px!important}
    .subPreviewStage canvas{display:block!important;width:auto!important;height:auto!important;max-width:none!important;max-height:none!important;margin:auto!important}
    #cutFitPreview{background:#26323e!important}
    @media (pointer:coarse){.cutStage{height:min(34vh,360px)!important}.cutCard{margin-top:8px!important}.subPreviewStage{height:min(20vh,230px)!important;min-height:100px!important}}
  `;
  document.head.appendChild(style);
}
function fitCanvas(canvas,stage,padding=20){
  if(!canvas||!stage||!canvas.width||!canvas.height)return;
  const sw=Math.max(80,stage.clientWidth-padding), sh=Math.max(80,stage.clientHeight-padding);
  const scale=Math.min(sw/canvas.width,sh/canvas.height);
  canvas.style.setProperty('width',Math.max(1,Math.floor(canvas.width*scale))+'px','important');
  canvas.style.setProperty('height',Math.max(1,Math.floor(canvas.height*scale))+'px','important');
  canvas.dataset.hhFitScale=String(scale);
}
function fitAll(){
  fitCanvas(document.getElementById('cutCanvas'),document.querySelector('.cutStage'));
  fitCanvas(document.getElementById('subPreview'),document.querySelector('.subPreviewStage'));
}
function addFitButton(){
  if(document.getElementById('cutFitPreview'))return;
  const close=document.getElementById('cutClose'),row=close?.parentElement;if(!row)return;
  const b=document.createElement('button');b.id='cutFitPreview';b.type='button';b.textContent='⛶ Ajuster l’aperçu';
  b.onclick=()=>requestAnimationFrame(()=>requestAnimationFrame(fitAll));
  row.insertBefore(b,close);
}
function finishInstall(){
  if(installed)return;
  const modal=document.getElementById('cutModal'),canvas=document.getElementById('cutCanvas'),stage=document.querySelector('.cutStage');
  if(!modal||!canvas||!stage){if(++tries<120)setTimeout(finishInstall,100);return;}
  installed=true;installStyle();addFitButton();
  const schedule=()=>requestAnimationFrame(()=>requestAnimationFrame(fitAll));
  new MutationObserver(schedule).observe(modal,{attributes:true,attributeFilter:['style','class']});
  const ro=new ResizeObserver(schedule);ro.observe(stage);const ps=document.querySelector('.subPreviewStage');if(ps)ro.observe(ps);
  new MutationObserver(schedule).observe(canvas,{attributes:true,attributeFilter:['width','height']});
  const preview=document.getElementById('subPreview');if(preview)new MutationObserver(schedule).observe(preview,{attributes:true,attributeFilter:['width','height']});
  window.addEventListener('resize',schedule,{passive:true});window.addEventListener('orientationchange',schedule,{passive:true});
  document.getElementById('cutOpen')?.addEventListener('click',()=>setTimeout(schedule,0));
  schedule();
}
installStyle();finishInstall();
})();