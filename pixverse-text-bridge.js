/* HappyHolo — pont texte hors PixVerse V1
   Parent de la page de test :
   - arme la capture sans texte avant PixVerse
   - superpose le texte HappyHolo dans le simulateur PixVerse
   - réapplique le texte avec sa profondeur dans le ZIP PixVerse final
*/
(()=>{
'use strict';
const $=s=>document.querySelector(s);
const iframe=$('#hhApp');
if(!iframe||window.__hhPixTextBridge)return;window.__hhPixTextBridge=true;

function hh(){try{return iframe.contentWindow||null}catch(_){return null}}
function hhDoc(){try{return iframe.contentDocument||null}catch(_){return null}}
function layer(){return hh()?.HappyHoloTextLayer||null}
function textActive(){const l=layer();return !!(l?.state?.enabled&&String(l?.state?.text||'').trim())}
function normForIndex(index,count=9){return count<=1?0:-1+2*((Math.max(1,index)-1)/(count-1))}

function armPixVerseCapture(){const w=hh();if(w)w.__hhPixVerseCapture=true;}
function bindRun(){const run=$('#run');if(!run||run.dataset.hhTextBridge==='1')return false;run.dataset.hhTextBridge='1';run.addEventListener('click',armPixVerseCapture,true);const rerun=$('#rerun');rerun?.addEventListener('click',armPixVerseCapture,true);return true;}

function ensureSimulatorTextOverlay(){
  const d=hhDoc();if(!d)return null;
  const img=d.getElementById('pixverseSimulatorImage');const win=img?.parentElement;if(!img||!win)return null;
  let c=d.getElementById('pixverseTextOverlay');
  if(!c){c=d.createElement('canvas');c.id='pixverseTextOverlay';Object.assign(c.style,{position:'absolute',inset:'0',width:'100%',height:'100%',display:'none',zIndex:'22',pointerEvents:'none',borderRadius:'inherit',background:'transparent'});win.appendChild(c);}
  return c;
}
function drawSimulatorText(){
  const d=hhDoc(),l=layer(),c=ensureSimulatorTextOverlay(),img=d?.getElementById('pixverseSimulatorImage'),badge=d?.getElementById('pixverseSimulatorBadge');
  if(!c||!img||!l?.draw||img.style.display==='none'||!textActive()){if(c)c.style.display='none';return;}
  const r=c.parentElement.getBoundingClientRect(),ratio=Math.min(hh()?.devicePixelRatio||1,2);const W=Math.max(2,Math.round(r.width*ratio)),H=Math.max(2,Math.round(r.height*ratio));if(c.width!==W)c.width=W;if(c.height!==H)c.height=H;
  const ctx=c.getContext('2d');ctx.clearRect(0,0,W,H);const m=(badge?.textContent||'').match(/(\d+)\/(\d+)/);const idx=Number(m?.[1]||1),count=Number(m?.[2]||9);l.draw(ctx,normForIndex(idx,count),{x:0,y:0,w:W,h:H});c.style.display='block';
}
function bindSimulator(){
  const d=hhDoc();if(!d)return false;const img=d.getElementById('pixverseSimulatorImage'),badge=d.getElementById('pixverseSimulatorBadge');if(!img||!badge)return false;
  if(img.dataset.hhTextOverlay!=='1'){img.dataset.hhTextOverlay='1';new MutationObserver(()=>requestAnimationFrame(drawSimulatorText)).observe(img,{attributes:true,attributeFilter:['src','style']});new MutationObserver(()=>requestAnimationFrame(drawSimulatorText)).observe(badge,{childList:true,subtree:true,attributes:true,attributeFilter:['style']});try{new ResizeObserver(()=>requestAnimationFrame(drawSimulatorText)).observe(img.parentElement);}catch(_){}}
  drawSimulatorText();return true;
}

function supportSpec(){const d=hhDoc(),id=d?.getElementById('supportType')?.value||'business-card';const map={'keychain-vertical':{id,label:'porte-cle-vertical',width:1024,height:1536},'keychain-horizontal':{id,label:'porte-cle-horizontal',width:1536,height:1024},'medallion-round-25':{id,label:'medaillon-rond-25mm',width:1024,height:1024,diameterMm:25},'medallion-round':{id,label:'medaillon-rond-30mm',width:1024,height:1024,diameterMm:30},'business-card':{id,label:'carte-85x54',width:1536,height:969},'business-card-88':{id,label:'carte-88x56',width:1536,height:978}};return map[id]||map['business-card'];}
function placement(){const d=hhDoc();return{fit:d?.getElementById('supportFit')?.value||'contain',margin:Number(d?.getElementById('supportMargin')?.value||0),zoom:Number(d?.getElementById('supportZoom')?.value||100),x:Number(d?.getElementById('supportX')?.value||0),y:Number(d?.getElementById('supportY')?.value||0)};}
function blobToImage(blob){return new Promise((resolve,reject)=>{const u=URL.createObjectURL(blob),im=new Image();im.onload=()=>{URL.revokeObjectURL(u);resolve(im)};im.onerror=()=>{URL.revokeObjectURL(u);reject(new Error('Image PixVerse illisible.'))};im.src=u;});}
function canvasBlob(c){return new Promise((resolve,reject)=>c.toBlob(b=>b?resolve(b):reject(new Error('PNG final impossible.')),'image/png'));}
async function composeFrame(url,index,count,spec,p){
  const res=await fetch(url);if(!res.ok)throw new Error(`Vue ${index} PixVerse inaccessible.`);const im=await blobToImage(await res.blob());const c=document.createElement('canvas');c.width=spec.width;c.height=spec.height;const x=c.getContext('2d',{alpha:false});x.fillStyle='#fff';x.fillRect(0,0,c.width,c.height);
  let s=p.fit==='cover'?Math.max(c.width/im.naturalWidth,c.height/im.naturalHeight):Math.min(c.width/im.naturalWidth,c.height/im.naturalHeight);s*=Math.max(.1,p.zoom/100);if(p.fit==='preserve')s*=Math.max(.55,1-p.margin/100);const w=im.naturalWidth*s,h=im.naturalHeight*s,dx=(c.width-w)/2+(p.x/100)*c.width*.5,dy=(c.height-h)/2+(p.y/100)*c.height*.5;x.imageSmoothingEnabled=true;x.imageSmoothingQuality='high';x.drawImage(im,dx,dy,w,h);
  const l=layer();if(textActive()&&l?.draw){const was=!!l.state?.suspended;try{l.setSuspended?.(false,false);l.draw(x,normForIndex(index,count),{x:0,y:0,w:c.width,h:c.height});}finally{l.setSuspended?.(was,false);}}
  return canvasBlob(c);
}
async function exportPixVerseWithText(e){
  const result=window.HappyHoloLastPixVerseResult,frames=result?.extractedViews;if(!Array.isArray(frames)||frames.length!==9)return;
  e.preventDefault();e.stopImmediatePropagation();const btn=e.currentTarget;btn.disabled=true;const status=$('#status');
  try{const Zip=hh()?.JSZip||window.JSZip;if(!Zip)throw new Error('JSZip indisponible.');const spec=supportSpec(),p=placement(),zip=new Zip();for(let i=0;i<frames.length;i++){if(status)status.textContent=`PixVerse ${i+1}/9 — texte HappyHolo réappliqué hors IA…`;zip.file(`vue-${String(i+1).padStart(2,'0')}.png`,await composeFrame(frames[i].url,i+1,frames.length,spec,p));}
    zip.file('manifest.json',JSON.stringify({generator:'HappyHolo + PixVerse V6 + text-safe',videoId:result.videoId||null,actionId:result.actionId||null,actionLabel:result.actionLabel||null,variantId:result.variantId||null,customRequest:result.customRequest||null,promptProvider:result.promptProvider||null,promptPolicy:result.promptPolicy||'lenticular-one-way-v1',prompt:result.promptUsed||result.prompt||null,negativePrompt:result.negativePromptUsed||result.negativePrompt||null,extractionWindow:result.extractionWindow||null,times:frames.map(f=>Number(f.time.toFixed(3))),views:9,support:spec.id,diameterMm:spec.diameterMm||null,outputWidth:spec.width,outputHeight:spec.height,placement:p,textExcludedFromPixVerse:true,textReappliedAfterAnimation:!!textActive(),textLayer:layer()?.serialize?.()||null},null,2));const blob=await zip.generateAsync({type:'blob'}),u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=`9-vues-pixverse-${spec.label}-${result.videoId||Date.now()}-texte-propre.zip`;a.click();setTimeout(()=>URL.revokeObjectURL(u),2500);if(status){status.textContent='ZIP PixVerse prêt — texte non envoyé à PixVerse, puis réappliqué avec son relief.';status.style.background='#e7f7eb';status.style.color='#17652c';}}
  catch(err){if(status){status.textContent=`Erreur ZIP texte protégé : ${err.message}`;status.style.background='#ffe9e7';status.style.color='#8b1f17';}}
  finally{btn.disabled=false;}
}
function bindExport(){const b=$('#downloadPixVerse');if(!b||b.dataset.hhTextBridge==='1')return false;b.dataset.hhTextBridge='1';b.addEventListener('click',exportPixVerseWithText,true);return true;}
function addNotice(){const side=document.querySelector('.side');if(!side||document.getElementById('hhTextSafeNotice'))return;const n=document.createElement('div');n.id='hhTextSafeNotice';n.className='prompt';n.style.background='#eef7ff';n.innerHTML='<b>Texte protégé</b><br>Nom, coordonnées et slogan créés dans HappyHolo ne sont pas envoyés à PixVerse. Ils sont reposés après l’animation avec leur profondeur lenticulaire.';side.insertBefore(n,side.querySelector('#run')?.nextSibling||side.firstChild);}
function boot(){bindRun();bindExport();addNotice();let tries=0;const t=setInterval(()=>{tries++;bindRun();bindExport();bindSimulator();if(tries>80)clearInterval(t);},250);}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
console.log('[HAPPYHOLO] pont texte hors PixVerse actif');
})();
