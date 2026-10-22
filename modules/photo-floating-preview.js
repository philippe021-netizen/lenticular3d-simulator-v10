// Experimental 3D depth-plane viewer for tab 1 ("Photo & relief").
// It uses the existing subject/background segmentation from relief-engine-v31.
// It never changes the print exports or the original photograph.
import { createCardFloatingPlanesPreview } from './card-floating-planes-preview.js?v=12views';

const $=id=>document.getElementById(id);
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const el=$('photo3dPreview'),stage=$('photo3dStage'),preview2D=$('photo3dCanvas2D'),
      preview3D=$('photo3dCanvas3D'),status=$('photo3dStatus'),
      angle=$('photo3dAngle'),angleOut=$('photo3dAngleOut'),
      strength=$('photo3dStrength'),strengthOut=$('photo3dStrengthOut'),
      play=$('photo3dPlay'),refresh=$('photo3dRefresh');
let scene=null,activeLayers=[],playing=false,raf=0,buildSerial=0,lastRender=0,fallBackReported=false,started=0,rebuildTimer=0;
const ctx2D=preview2D.getContext('2d',{willReadFrequently:true});

function setStatus(message,kind=''){
 status.textContent=message;status.dataset.kind=kind;
}
function fitCover(image,width,height){
 const imageWidth=image.naturalWidth||image.width,imageHeight=image.naturalHeight||image.height;
 const scale=Math.max(width/imageWidth,height/imageHeight);
 const w=imageWidth*scale,h=imageHeight*scale;
 return{x:(width-w)/2,y:(height-h)/2,w,h};
}
function makeCanvas(w,h){const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;return canvas}
function imageDataFrom(canvas){return canvas.getContext('2d',{willReadFrequently:true}).getImageData(0,0,canvas.width,canvas.height)}
function stop(){
 playing=false;cancelAnimationFrame(raf);raf=0;play.textContent='▶ Rotation lente';
}
function updateButtons(ready){
 play.disabled=!ready;angle.disabled=!ready;strength.disabled=!ready;refresh.disabled=!ready;
}
function show(angleDegrees=0){
 if(!scene)return;
 const degree=clamp(Number(angleDegrees)||0,-32,32),power=Number(strength.value);
 angleOut.textContent=Math.round(degree)+'°';
 // Make the WebGL canvas measurable before requesting a GPU frame.
 preview3D.hidden=false;preview2D.hidden=true;
 if(scene.draw3D(degree,power,activeLayers)){
   if(fallBackReported){fallBackReported=false;setStatus('Simulation 3D : sujet sur un plan détaché du fond.','ok')}
   return;
 }
 preview3D.hidden=true;preview2D.hidden=false;
 const frame=scene.render(degree,power,activeLayers);
 if(preview2D.width!==frame.width||preview2D.height!==frame.height){
   preview2D.width=frame.width;preview2D.height=frame.height;
 }
 ctx2D.putImageData(frame,0,0);
 if(!fallBackReported){fallBackReported=true;setStatus('Safari utilise le rendu 2D de secours. Les fichiers des 12 vues restent indépendants.','warn')}
}
function frame(now){
 if(!playing||!scene)return;
 raf=requestAnimationFrame(frame);
 if(now-lastRender<60)return;
 lastRender=now;
 // 28 s full out-and-back. No yoyo translation of the original photo.
 const cycle=((now-started)/28000)%1;
 const fraction=cycle<.5?cycle*2:2-cycle*2;
 const angleValue=-28+56*fraction;
 angle.value=String(Math.round(angleValue));
 show(angleValue);
}
function drawPreviewIfPresent(){
 if(!scene)return;stop();show(Number(angle.value));
}
async function build(){
 const serial=++buildSerial;
 stop();scene=null;fallBackReported=false;updateButtons(false);
 const state=window.HappyHoloReliefState;
 if(!state?.sourceImg||!state?.subjectImg||!state?.backgroundImg){
   el.classList.remove('photo3d-ready');
   setStatus('Charge une photo, puis lance « Créer le relief 3D local » pour activer cette simulation.');
   return;
 }
 el.classList.add('photo3d-ready');
 setStatus('Préparation du sujet et du fond pour l’aperçu 3D…');
 try{
   const source=state.sourceImg,subject=state.subjectImg,background=state.backgroundImg;
   const rawWidth=source.naturalWidth||source.width,rawHeight=source.naturalHeight||source.height;
   if(!rawWidth||!rawHeight)throw Error('Photo vide');
   const scale=Math.min(1,520/rawWidth,520/rawHeight);
   const w=Math.max(48,Math.round(rawWidth*scale)),h=Math.max(48,Math.round(rawHeight*scale));
   const base=makeCanvas(w,h),bg=base.getContext('2d',{willReadFrequently:true});
   const back=fitCover(background,w,h);
   const drawn=window.HappyHoloCustomBackground?.draw?.(bg,0,w,h,{x:0,y:0,w,h});
   if(!drawn)bg.drawImage(background,back.x,back.y,back.w,back.h);
   const bgPixels=imageDataFrom(base).data;
   const foreground=makeCanvas(w,h),fg=foreground.getContext('2d',{willReadFrequently:true});
   const rect=window.HappyHoloSubjectPlacement?.rect?.(subject,w,h,{x:0,y:0,w,h})||fitCover(subject,w,h);
   fg.drawImage(subject,rect.x,rect.y,rect.w,rect.h);
   const fgPixels=imageDataFrom(foreground).data;
   const alpha=new Uint8Array(w*h);
   let active=0;
   for(let i=0;i<alpha.length;i++){alpha[i]=fgPixels[i*4+3];if(alpha[i]>18)active++}
   if(active<12)throw Error('Sujet transparent ou non détecté');
   const composed=makeCanvas(w,h),x=composed.getContext('2d',{willReadFrequently:true});
   x.drawImage(base,0,0);x.drawImage(foreground,0,0);
   const pixels=imageDataFrom(composed).data;
   const layer={id:'photo-subject',label:'Sujet détouré',type:'subject',bbox:[0,0,1,1],depth:65,enabled:true,
     mask:{alpha,width:w,height:h,mode:'object',coverage:active/(w*h)}};
   if(serial!==buildSerial)return;
   preview2D.style.aspectRatio=`${w}/${h}`;preview3D.style.aspectRatio=`${w}/${h}`;
   stage.style.aspectRatio=`${w}/${h}`;
   angle.value='0';angleOut.textContent='0°';strength.value='1.8';strengthOut.textContent='1,8×';
   activeLayers=[layer];
   scene=createCardFloatingPlanesPreview(pixels,w,h,activeLayers,{
     canvas:preview3D,
     backgroundPixels:bgPixels
   });
   if(serial!==buildSerial)return;
   preview2D.width=w;preview2D.height=h;
   updateButtons(true);
   setStatus('Simulation prête : fais pivoter la photo pour comparer les hauteurs du sujet et du fond.','ok');
   show(0);
 }catch(error){
   if(serial!==buildSerial)return;
   scene=null;updateButtons(false);
   el.classList.remove('photo3d-ready');
   setStatus('Simulation indisponible pour cette photo : '+(error?.message||error),'bad');
   console.warn('[photo3d]',error);
 }
}
play.addEventListener('click',()=>{
 if(!scene)return;
 if(playing){stop();return}
 playing=true;started=performance.now();lastRender=0;
 play.textContent='⏸ Arrêter la rotation';
 raf=requestAnimationFrame(frame);
});
angle.addEventListener('input',()=>{stop();show(Number(angle.value))});
strength.addEventListener('input',()=>{
 strengthOut.textContent=Number(strength.value).toLocaleString('fr-FR',{maximumFractionDigits:1})+'×';
 drawPreviewIfPresent();
});
refresh.addEventListener('click',build);
$('photo3dJump')?.addEventListener('click',()=>{
  el.scrollIntoView({behavior:'smooth',block:'start'});
  if(!scene)setStatus('Crée le relief 3D local pour séparer le sujet du fond avant la simulation.');
});
$('file')?.addEventListener('change',()=>{
 ++buildSerial;scene=null;stop();updateButtons(false);
 el.classList.remove('photo3d-ready');
 setStatus('Photo changée : reconstruis le relief avant de lancer la simulation.');
});
window.addEventListener('happyholo-relief-ready',()=>{void build()});
function scheduleRebuild(){
 if(!scene)return;
 clearTimeout(rebuildTimer);
 rebuildTimer=setTimeout(()=>{if(scene)void build()},350);
}
window.addEventListener('happyholo-background-changed',scheduleRebuild);
window.addEventListener('happyholo-subject-placement-changed',scheduleRebuild);
document.addEventListener('visibilitychange',()=>{if(document.hidden)stop()});
window.addEventListener('pagehide',stop);
updateButtons(false);
if(window.HappyHoloReliefState?.subjectImg)void build();
