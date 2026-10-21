const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function cardPose(index){const i=clamp(Math.round(Number(index)||0),0,8);return {index:i,angle:(i-4)*3}}
export function viewAtAngle(angle){return clamp(Math.round((Number(angle)||0)/3+4),0,8)}

export function createCardSimulator({canvas,range,output,getUrls}){
  const stage=canvas.parentElement,controls=document.createElement('div');
  controls.innerHTML='<label><input id="cardPhysicalTilt" type="checkbox" checked> Carte en main — bascule du support</label><button id="cardTiltPlay" type="button" class="secondary">▶ Play — rotation en boucle</button><p class="small">Aperçu direct recalculé quand tu modifies les profondeurs ou l’amplitude. Play lit les 9 vues exportées. Décoche pour inspecter à plat. L’angle ±12° et les profondeurs sont relatifs : la lentille, la distance de lecture et l’impression ne sont pas calibrées en centimètres.</p>';
  stage.before(controls);
  stage.style.background='#e9e9e5';stage.style.perspective='1400px';
  canvas.style.transformOrigin='50% 50%';canvas.style.backfaceVisibility='hidden';
  const tilt=controls.querySelector('#cardPhysicalTilt'),play=controls.querySelector('#cardTiltPlay');
  let current=4,angle=0,running=false,animation=0,request=0,lastImage=null,lastUrl='',imageCache=new Map(),liveRenderer=null;
  function stop(){running=false;cancelAnimationFrame(animation);play.textContent='▶ Play — rotation en boucle'}
  async function show(index,physicalAngle=cardPose(index).angle,allowLive=true){
    const pose=cardPose(index);current=pose.index;angle=physicalAngle;
    range.value=String(current);output.textContent=`${current+1} / 9 · ${tilt.checked?angle.toFixed(1)+'°':'à plat'}`;
    canvas.style.transform=tilt.checked?`scale(.91) rotateY(${angle}deg)`:'none';
    if(allowLive&&liveRenderer){await liveRenderer(current,angle);return}
    const url=getUrls()[pose.index];if(!url)return;
    const token=++request;
    const urls=getUrls();for(const key of imageCache.keys())if(!urls.includes(key))imageCache.delete(key);
    if(!imageCache.has(url))imageCache.set(url,new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>{imageCache.delete(url);reject(new Error('Vue illisible'))};image.src=url}));
    const image=await imageCache.get(url);if(token!==request)return;
    stage.style.aspectRatio=`${image.naturalWidth} / ${image.naturalHeight}`;
    // Natural export pixels are the only image source. CSS rotates the support,
    // never individual text/logo elements and never the exported PNG files.
    if(lastImage!==image||lastUrl!==url){
      canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
      canvas.getContext('2d').drawImage(image,0,0);lastImage=image;lastUrl=url;
    }
  }
  range.oninput=()=>{stop();void show(Number(range.value))};
  tilt.onchange=()=>{stop();void show(current)};
  play.onclick=()=>{
    if(running){stop();return}if(getUrls().length!==9)return;
    running=true;tilt.checked=true;play.textContent='⏸ Pause';const start=performance.now();
    const tick=now=>{if(!running)return;const value=12*Math.sin((now-start)/10000*2*Math.PI);void show(viewAtAngle(value),value,false);animation=requestAnimationFrame(tick)};
    animation=requestAnimationFrame(tick);
  };
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stop()});
  function showLive(pixels,width,height,index=current,physicalAngle=cardPose(index).angle){
    current=cardPose(index).index;angle=physicalAngle;range.value=String(current);output.textContent=`${current+1} / 9 · ${tilt.checked?angle.toFixed(1)+'°':'à plat'} · aperçu direct`;
    canvas.style.transform=tilt.checked?`scale(.91) rotateY(${angle}deg)`:'none';stage.style.aspectRatio=`${width} / ${height}`;
    if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height}canvas.getContext('2d').putImageData(new ImageData(pixels,width,height),0,0);lastImage=null;lastUrl='';
  }
  function setLiveRenderer(renderer){liveRenderer=typeof renderer==='function'?renderer:null;if(liveRenderer)void liveRenderer(current,angle)}
  return {show,showLive,setLiveRenderer,stop};
}
