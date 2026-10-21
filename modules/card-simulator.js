const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function cardPose(index){const i=clamp(Math.round(Number(index)||0),0,8);return {index:i,angle:(i-4)*12}}
export function viewAtAngle(angle){return clamp(Math.round((Number(angle)||0)/12+4),0,8)}

export function createCardSimulator({canvas,range,output,getUrls,onReliefBoost=()=>{}}){
  const stage=canvas.parentElement,controls=document.createElement('div');
  controls.innerHTML='<label><input id="cardPhysicalTilt" type="checkbox" checked> Activer la parallaxe calculée en direct</label><label for="cardLiveAngle">Angle du point de vue <b id="cardLiveAngleOut">0°</b></label><input id="cardLiveAngle" type="range" min="-48" max="48" step="1" value="0" style="width:100%"><label for="cardReliefBoost">Renforcer le relief à l’écran <b id="cardReliefBoostOut">2,5×</b></label><input id="cardReliefBoost" type="range" min="1" max="3" step="0.1" value="2.5" style="width:100%"><p class="small">Ce renfort est visuel : il ne modifie pas les 9 images du ZIP. La carte reste fixe. Le curseur d’angle règle la vue au degré près ; la lecture balaie lentement ±48° en 28 s.</p><button id="cardTiltPlay" type="button" class="secondary">▶ Lecture lente — relief calculé en direct</button>';
  stage.before(controls);
  stage.style.background='#e9e9e5';
  const tilt=controls.querySelector('#cardPhysicalTilt'),play=controls.querySelector('#cardTiltPlay'),liveAngle=controls.querySelector('#cardLiveAngle'),liveAngleOut=controls.querySelector('#cardLiveAngleOut'),reliefBoost=controls.querySelector('#cardReliefBoost'),reliefBoostOut=controls.querySelector('#cardReliefBoostOut');
  let current=4,angle=0,running=false,animation=0,request=0,lastImage=null,lastUrl='',imageCache=new Map(),liveRenderer=null;
  function stop(){running=false;cancelAnimationFrame(animation);play.textContent='▶ Lecture lente — relief calculé en direct'}
  async function show(index,physicalAngle=cardPose(index).angle,allowLive=true){
    const pose=cardPose(index);current=pose.index;angle=physicalAngle;
    liveAngle.value=String(Math.round(angle));liveAngleOut.textContent=`${Math.round(angle)}°`;
    range.value=String(current);output.textContent=`${current+1} / 9 · ${tilt.checked?angle.toFixed(1)+'°':'à plat'}`;
    if(allowLive&&liveRenderer){await liveRenderer(current,tilt.checked?angle:0);return}
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
  liveAngle.oninput=()=>{stop();tilt.checked=true;const value=Number(liveAngle.value);liveAngleOut.textContent=`${value}°`;void show(viewAtAngle(value),value,true)};
  reliefBoost.oninput=()=>{reliefBoostOut.textContent=`${Number(reliefBoost.value).toLocaleString('fr-FR',{maximumFractionDigits:1})}×`;onReliefBoost(Number(reliefBoost.value))};
  tilt.onchange=()=>{stop();void show(current,angle,true)};
  play.onclick=()=>{
    if(running){stop();return}if(getUrls().length!==9)return;
    running=true;tilt.checked=true;play.textContent='⏸ Pause';const started=performance.now();
    // Constant-speed viewpoint sweep: no elastic easing and no CSS card rotation.
    // One full out-and-back cycle takes 28 seconds (14 seconds per direction).
    let nextFrame=0;
    const tick=async now=>{if(!running)return;if(now<nextFrame){animation=requestAnimationFrame(tick);return}nextFrame=now+125;const phase=((now-started)/28000)%1;const t=phase<.5?phase*2:2-phase*2;const value=-48+96*t;await show(viewAtAngle(value),value,true);if(running)animation=requestAnimationFrame(tick)};
    animation=requestAnimationFrame(tick);
  };
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stop()});
  function showLive(pixels,width,height,index=current,physicalAngle=cardPose(index).angle){
    current=cardPose(index).index;angle=physicalAngle;range.value=String(current);liveAngle.value=String(Math.round(angle));liveAngleOut.textContent=`${Math.round(angle)}°`;output.textContent=`${current+1} / 9 · ${tilt.checked?angle.toFixed(1)+'°':'à plat'} · aperçu direct`;
    stage.style.aspectRatio=`${width} / ${height}`;
    if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height}canvas.getContext('2d').putImageData(new ImageData(pixels,width,height),0,0);lastImage=null;lastUrl='';
  }
  function setLiveRenderer(renderer){liveRenderer=typeof renderer==='function'?renderer:null;if(liveRenderer)void liveRenderer(current,angle)}
  return {show,showLive,setLiveRenderer,stop};
}
