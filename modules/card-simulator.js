const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function cardPose(index){const i=clamp(Math.round(Number(index)||0),0,11);return {index:i,angle:-48+i*96/11}}
export function viewAtAngle(angle){return clamp(Math.round(((Number(angle)||0)+48)*11/96),0,11)}

export function createCardSimulator({canvas,range,output,getUrls,onSceneStrength=()=>{}}){
  const stage=canvas.parentElement,controls=document.createElement('div');
  controls.innerHTML='<label><input id="cardPhysicalTilt" type="checkbox" checked> Aperçu des plans à différentes hauteurs</label><label for="cardLiveAngle">Angle de caméra <b id="cardLiveAngleOut">0°</b></label><input id="cardLiveAngle" type="range" min="-48" max="48" step="1" value="0" style="width:100%"><label for="cardSceneStrength">Écart visuel entre les hauteurs <b id="cardSceneStrengthOut">1,8×</b></label><input id="cardSceneStrength" type="range" min="0.5" max="3.2" step="0.1" value="1.8" style="width:100%"><p class="small">Chaque élément détouré est affiché sur son propre plan en perspective. Réglage réservé à l’aperçu ; les 12 vues et le ZIP restent inchangés. Lecture lente et régulière sur ±48°.</p><button id="cardTiltPlay" type="button" class="secondary">▶ Lecture lente — plans en perspective</button>';
  stage.before(controls);
  stage.style.background='#e9e9e5';
  const tilt=controls.querySelector('#cardPhysicalTilt'),play=controls.querySelector('#cardTiltPlay'),liveAngle=controls.querySelector('#cardLiveAngle'),liveAngleOut=controls.querySelector('#cardLiveAngleOut'),sceneStrength=controls.querySelector('#cardSceneStrength'),sceneStrengthOut=controls.querySelector('#cardSceneStrengthOut');
  let current=4,angle=0,running=false,animation=0,request=0,lastImage=null,lastUrl='',imageCache=new Map(),liveRenderer=null;
  function stop(){running=false;cancelAnimationFrame(animation);play.textContent='▶ Lecture lente — relief calculé en direct'}
  async function show(index,physicalAngle=cardPose(index).angle,allowLive=true){
    const pose=cardPose(index);current=pose.index;angle=physicalAngle;
    liveAngle.value=String(Math.round(angle));liveAngleOut.textContent=`${Math.round(angle)}°`;
    range.value=String(current);output.textContent=`${current+1} / 12 · ${tilt.checked?angle.toFixed(1)+'°':'à plat'}`;
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
  sceneStrength.oninput=()=>{sceneStrengthOut.textContent=`${Number(sceneStrength.value).toLocaleString('fr-FR',{maximumFractionDigits:1})}×`;onSceneStrength(Number(sceneStrength.value))};
  tilt.onchange=()=>{stop();void show(current,angle,true)};
  play.onclick=()=>{
    if(running){stop();return}if(getUrls().length!==12)return;
    running=true;tilt.checked=true;play.textContent='⏸ Pause';const started=performance.now();
    // Constant-speed viewpoint sweep: no elastic easing and no CSS card rotation.
    // One full out-and-back cycle takes 28 seconds (14 seconds per direction).
    let nextFrame=0;
    const tick=async now=>{if(!running)return;if(now<nextFrame){animation=requestAnimationFrame(tick);return}nextFrame=now+125;const phase=((now-started)/28000)%1;const t=phase<.5?phase*2:2-phase*2;const value=-48+96*t;await show(viewAtAngle(value),value,true);if(running)animation=requestAnimationFrame(tick)};
    animation=requestAnimationFrame(tick);
  };
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stop()});
  function showLive(pixels,width,height,index=current,physicalAngle=cardPose(index).angle){
    current=cardPose(index).index;angle=physicalAngle;range.value=String(current);liveAngle.value=String(Math.round(angle));liveAngleOut.textContent=`${Math.round(angle)}°`;output.textContent=`${current+1} / 12 · ${tilt.checked?angle.toFixed(1)+'°':'à plat'} · aperçu direct`;
    stage.style.aspectRatio=`${width} / ${height}`;
    if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height}canvas.getContext('2d').putImageData(new ImageData(pixels,width,height),0,0);lastImage=null;lastUrl='';
  }
  function setLiveRenderer(renderer){liveRenderer=typeof renderer==='function'?renderer:null;if(liveRenderer)void liveRenderer(current,angle)}
  return {show,showLive,setLiveRenderer,stop};
}
