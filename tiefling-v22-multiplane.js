(()=>{'use strict';
const previousWrite=document.write.bind(document);
function patch(html){
  if(typeof html!=='string'||!html.includes('function warpBg(outW,outH,t,amp){'))return html;
  if(html.includes('id="bgPlanes"'))return html;

  html=html
    .replaceAll('Tiefling V21','Tiefling V22')
    .replaceAll('happyholo-v21-','happyholo-v22-')
    .replaceAll('HappyHolo_Tiefling_V21_9_vues.zip','HappyHolo_Tiefling_V22_9_vues.zip');

  // V22 conservative defaults: stronger depth separation, less global background slide.
  html=html
    .replace('id="bgStrength" type="range" min="0" max="120" value="68"','id="bgStrength" type="range" min="0" max="120" value="60"')
    .replace('id="bgStrengthVal" class="val">68%','id="bgStrengthVal" class="val">60%')
    .replace('id="bgDrift" type="range" min="0" max="100" value="22"','id="bgDrift" type="range" min="0" max="100" value="14"')
    .replace('id="bgDriftVal" class="val">22%','id="bgDriftVal" class="val">14%')
    .replace('id="bgGroundLock" type="range" min="60" max="100" value="96"','id="bgGroundLock" type="range" min="60" max="100" value="98"')
    .replace('id="bgGroundLockVal" class="val">96%','id="bgGroundLockVal" class="val">98%')
    .replace('id="parallax" type="range" min="4" max="70" value="22"','id="parallax" type="range" min="4" max="70" value="28"')
    .replace('id="parallaxVal" class="val">22 px','id="parallaxVal" class="val">28 px');

  const anchor='<div class="btns"><button id="calcBg">Recalculer le fond</button></div>';
  const controls='<div class="row"><label>Plans de profondeur V22</label><span id="bgPlanesVal" class="val">5 plans</span></div><input id="bgPlanes" type="range" min="3" max="7" step="1" value="5"><div class="row"><label>Séparation des plans</label><span id="bgPlaneSnapVal" class="val">72%</span></div><input id="bgPlaneSnap" type="range" min="0" max="100" value="72"><div class="hint">V22 regroupe doucement la carte Tiefling en plans distincts : premier plan plus mobile, arrière-plan plus stable, sans déformer le sujet.</div>';
  if(html.includes(anchor))html=html.replace(anchor,controls+anchor);

  const oldDepth="const z=sample(bDepth.data,bDepth.width,bDepth.height,sx0/(sw-1)*(bDepth.width-1),sy/(sh-1)*(bDepth.height-1),0)/255,pz=(z-.5),depthShift=";
  const newDepth="const zRaw=sample(bDepth.data,bDepth.width,bDepth.height,sx0/(sw-1)*(bDepth.width-1),sy/(sh-1)*(bDepth.height-1),0)/255,planeCount=Math.max(3,+(document.getElementById('bgPlanes')?.value||5)),planeSnap=Math.max(0,Math.min(1,+(document.getElementById('bgPlaneSnap')?.value||72)/100)),zPlane=Math.round(zRaw*(planeCount-1))/(planeCount-1),z=mix(zRaw,zPlane,planeSnap),pz=(z-.5),depthShift=";
  if(!html.includes(oldDepth))return html;
  html=html.replace(oldDepth,newDepth);

  const ui=`<script>(()=>{'use strict';const bindV22=()=>{const p=document.getElementById('bgPlanes'),s=document.getElementById('bgPlaneSnap'),pv=document.getElementById('bgPlanesVal'),sv=document.getElementById('bgPlaneSnapVal'),views=document.getElementById('views');if(!p||p.dataset.v22)return;p.dataset.v22='1';const rebuild=()=>{pv.textContent=p.value+' plans';sv.textContent=s.value+'%';if(views&&!views.disabled)views.click()};p.addEventListener('input',rebuild);s.addEventListener('input',rebuild);rebuild()};if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bindV22,{once:true});else bindV22()})();<\/script><script src="./tiefling-v21-bg-zones.js?v=548"><\/script>`;
  html=html.replace('</body>',ui+'</body>');
  return html;
}
document.write=function(...args){return previousWrite(...args.map(a=>patch(String(a))))};
})();
