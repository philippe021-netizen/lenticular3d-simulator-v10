// HappyHolo — objets texte/logo indépendants pour carte de visite
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const PARALLAX_SCALE=.015;
const fonts={
  system:'-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
  rounded:'ui-rounded,"Arial Rounded MT Bold",-apple-system,sans-serif',
  serif:'Georgia,"Times New Roman",serif',
  mono:'ui-monospace,"SFMono-Regular",Menlo,monospace'
};

function defaultDepth(role,type='text'){
  if(type==='logo')return 55;
  if(role==='name')return 65;if(role==='title')return 52;if(role==='slogan')return 45;
  if(role==='phone'||role==='email'||role==='website')return 34;if(role==='address'||role==='hours')return 24;
  return 38;
}
function selectedObject(state){return state?.objects?.find(o=>o.id===state.selectedId)||state?.objects?.find(o=>!o.hidden)||state?.objects?.[0]||null;}
function objectFamily(o){return fonts[o?.font]||fonts.system;}

export function createBusinessCardTextState(overrides={}){
  const legacy={enabled:true,text:'',x:.5,y:.18,size:8,orientation:0,rotation3D:14,depth:55,color:'#ffffff',outline:'#111111',outlineSize:5,font:'system',...overrides};
  const state={enabled:true,objects:[],selectedId:null,_legacy:legacy};
  for(const key of ['text','x','y','size','orientation','rotation3D','depth','color','outline','outlineSize','font']){
    Object.defineProperty(state,key,{enumerable:true,configurable:true,get(){const o=selectedObject(state);return o&&key in o?o[key]:state._legacy[key];},set(v){const o=selectedObject(state);if(o){if(o.type==='logo'&&['text','font','color','outline','outlineSize'].includes(key))return;o[key]=v;}else state._legacy[key]=v;}});
  }
  window.HappyHoloBusinessCardObjects=state;
  return state;
}

export function cleanCardTextLines(state){
  const o=selectedObject(state);if(o?.type==='text')return[String(o.text||'').trim()].filter(Boolean);
  return String(state?._legacy?.text||state?.text||'').replace(/\r/g,'').split('\n').slice(0,4).map(s=>s.trim()).filter(Boolean);
}

function drawOneText(ctx,o,norm,b){
  if(!o?.text||o.hidden)return;
  const requested=Math.max(8,b.w*(Number(o.size)||6)/100),family=objectFamily(o);ctx.save();ctx.font=`800 ${requested}px ${family}`;
  let fontSize=requested;const maxW=Math.max(40,b.w*(Number(o.maxWidth)||.9));const measured=ctx.measureText(o.text).width;
  if(measured>maxW&&measured>0)fontSize=Math.max(8,requested*(maxW/measured));
  const depth=clamp(Number(o.depth)||0,-100,100),parallax=Number(norm||0)*(depth/100)*b.w*PARALLAX_SCALE,yaw=Number(norm||0)*(Number(o.rotation3D)||0),face=Math.max(.60,Math.cos(Math.abs(yaw)*Math.PI/180));
  const cx=b.x+clamp(Number(o.x)||.5,0,1)*b.w+parallax,cy=b.y+clamp(Number(o.y)||.5,0,1)*b.h;
  ctx.translate(cx,cy);ctx.rotate((Number(o.orientation)||0)*Math.PI/180);ctx.scale(face,1);ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=`800 ${fontSize}px ${family}`;ctx.lineJoin='round';ctx.miterLimit=2;ctx.shadowColor='rgba(0,0,0,.25)';ctx.shadowBlur=Math.max(1,fontSize*.06);ctx.shadowOffsetY=Math.max(1,fontSize*.025);
  const stroke=Math.max(0,Number(o.outlineSize)||0)*fontSize/100;if(stroke>.2){ctx.lineWidth=stroke*2;ctx.strokeStyle=o.outline||'#111';ctx.strokeText(o.text,0,0,maxW);}ctx.fillStyle=o.color||'#fff';ctx.fillText(o.text,0,0,maxW);ctx.restore();
}
function drawOneLogo(ctx,o,norm,b){
  const img=o?._img;if(!img||!img.complete||o.hidden)return;const depth=clamp(Number(o.depth)||0,-100,100),parallax=Number(norm||0)*(depth/100)*b.w*PARALLAX_SCALE;const width=b.w*clamp(Number(o.size)||12,2,60)/100;const ratio=(img.naturalHeight||1)/(img.naturalWidth||1);const height=width*ratio;const cx=b.x+clamp(Number(o.x)||.5,0,1)*b.w+parallax,cy=b.y+clamp(Number(o.y)||.5,0,1)*b.h;const yaw=Number(norm||0)*(Number(o.rotation3D)||0),face=Math.max(.60,Math.cos(Math.abs(yaw)*Math.PI/180));ctx.save();ctx.translate(cx,cy);ctx.rotate((Number(o.orientation)||0)*Math.PI/180);ctx.scale(face,1);ctx.drawImage(img,-width/2,-height/2,width,height);ctx.restore();
}

export function drawBusinessCardText(ctx,state,norm=0,box=null){
  if(!state?.enabled||!ctx?.canvas)return;const b=box||{x:0,y:0,w:ctx.canvas.width,h:ctx.canvas.height};
  if(Array.isArray(state.objects)&&state.objects.length){const ordered=[...state.objects].sort((a,b)=>Number(a.depth||0)-Number(b.depth||0));for(const o of ordered){if(o.hidden)continue;if(o.type==='logo')drawOneLogo(ctx,o,norm,b);else drawOneText(ctx,o,norm,b);}return;}
  const lines=String(state?._legacy?.text||'').split('\n').map(s=>s.trim()).filter(Boolean);lines.slice(0,4).forEach((line,i)=>drawOneText(ctx,{...state._legacy,text:line,y:(Number(state._legacy.y)||.18)+i*.07},norm,b));
}

export function serializeBusinessCardText(state){
  if(Array.isArray(state?.objects)&&state.objects.length)return{mode:'multi-object',objects:state.objects.filter(o=>!o.hidden).map(o=>({id:o.id,type:o.type,role:o.role||null,label:o.label||null,text:o.type==='text'?o.text:null,x:o.x,y:o.y,size:o.size,orientation:o.orientation,rotation3D:o.rotation3D,depth:o.depth,color:o.type==='text'?o.color:null,outline:o.type==='text'?o.outline:null,outlineSize:o.type==='text'?o.outlineSize:null,font:o.type==='text'?o.font:null,placement:Number(o.depth)<0?'behind-subject':'front'}))};
  const lines=cleanCardTextLines(state);if(!state?.enabled||!lines.length)return null;return{text:lines.join('\n'),x:state.x,y:state.y,size:state.size,orientation:state.orientation,rotation3D:state.rotation3D,depth:state.depth,color:state.color,outline:state.outline,outlineSize:state.outlineSize,font:state.font,placement:Number(state.depth)<0?'behind-subject':'front'};
}

function chooseAtPoint(state,nx,ny){
  if(!state?.objects?.length)return null;let best=null,score=Infinity;for(const o of state.objects){if(o.hidden)continue;const dx=(Number(o.x)||.5)-nx,dy=(Number(o.y)||.5)-ny;const s=dx*dx+dy*dy;if(s<score){score=s;best=o;}}if(best&&score<.08){state.selectedId=best.id;window.dispatchEvent(new CustomEvent('happyholo-card-object-selected',{detail:{id:best.id}}));return best;}return selectedObject(state);
}
export function bindBusinessCardTextDrag(stage,state,onChange){
  if(!stage||!state)return()=>{};let dragging=false,dx=0,dy=0,pointerId=null;
  const down=e=>{if(!state.enabled)return;const r=stage.getBoundingClientRect(),nx=(e.clientX-r.left)/r.width,ny=(e.clientY-r.top)/r.height;const o=chooseAtPoint(state,nx,ny);if(!o)return;e.preventDefault();dragging=true;pointerId=e.pointerId;stage.setPointerCapture?.(pointerId);dx=(e.clientX-r.left)-o.x*r.width;dy=(e.clientY-r.top)-o.y*r.height;syncControlsFromSelected(state);renderObjectPanel(state);};
  const move=e=>{if(!dragging||e.pointerId!==pointerId)return;e.preventDefault();const r=stage.getBoundingClientRect(),o=selectedObject(state);if(!o)return;o.x=clamp(((e.clientX-r.left)-dx)/r.width,0,1);o.y=clamp(((e.clientY-r.top)-dy)/r.height,0,1);onChange?.(state);drawStudioOverlay(state);drawLiveSimulator(state,performance.now());};
  const up=e=>{if(pointerId!=null&&e.pointerId!==pointerId)return;dragging=false;pointerId=null;};stage.addEventListener('pointerdown',down,{passive:false});stage.addEventListener('pointermove',move,{passive:false});stage.addEventListener('pointerup',up);stage.addEventListener('pointercancel',up);return()=>{};
}
export const BUSINESS_CARD_TEXT_PRESET={x:.5,y:.18,size:8,rotation3D:14,depth:55};

// -------- Studio carte : capture de l'analyse + objets indépendants --------
let studioState=null,overlayCanvas=null,objectPanel=null;
let livePanel=null,liveCanvas=null,liveCtx=null,liveRAF=0,liveRunning=true,liveStart=0,liveLarge=false;
function normalizeBBox(b){if(!Array.isArray(b)||b.length!==4)return null;return b.map(n=>clamp(Number(n)||0,0,1));}
function makeTextObject(o,i){const b=normalizeBBox(o?.bbox),role=o?.role||'other';return{id:String(o?.id||`text-${i+1}`),type:'text',role,label:o?.text||`Texte ${i+1}`,text:String(o?.text||'').trim(),x:b?b[0]+b[2]/2:.2,y:b?b[1]+b[3]/2:.15+i*.07,size:b?clamp(b[3]*100*.8,2.8,10):5.5,maxWidth:b?clamp(b[2]*1.15,.12,.95):.8,orientation:0,rotation3D:8,depth:defaultDepth(role),color:'#ffffff',outline:'#111111',outlineSize:3,font:'system',bbox:b};}
async function cropLogoObject(o,i){const b=normalizeBBox(o?.bbox);if(!b)return null;const src=document.querySelector('#preview img')?.src;if(!src)return null;const im=new Image();await new Promise((resolve,reject)=>{im.onload=resolve;im.onerror=reject;im.src=src});const sx=Math.round(b[0]*im.naturalWidth),sy=Math.round(b[1]*im.naturalHeight),sw=Math.max(2,Math.round(b[2]*im.naturalWidth)),sh=Math.max(2,Math.round(b[3]*im.naturalHeight));const c=document.createElement('canvas');c.width=sw;c.height=sh;c.getContext('2d').drawImage(im,sx,sy,sw,sh,0,0,sw,sh);const data=c.toDataURL('image/png');const li=new Image();li.src=data;await li.decode?.().catch(()=>{});return{id:String(o?.id||`logo-${i+1}`),type:'logo',role:'logo',label:String(o?.label||`Logo ${i+1}`),x:b[0]+b[2]/2,y:b[1]+b[3]/2,size:clamp(b[2]*100,4,30),orientation:0,rotation3D:8,depth:defaultDepth('logo','logo'),bbox:b,src:data,_img:li};}
async function applyAnalysisObjects(data){
  if(!studioState)return;let texts=Array.isArray(data?.text_objects)?data.text_objects:[];if(!texts.length)texts=(data?.protected_text||[]).map((text,i)=>({id:`text-${i+1}`,role:'other',text,bbox:null}));const objects=texts.map(makeTextObject).filter(o=>o.text);for(let i=0;i<(data?.logo_objects||[]).length;i++){try{const l=await cropLogoObject(data.logo_objects[i],i);if(l)objects.push(l);}catch(_){}}
  studioState.objects=objects;studioState.selectedId=objects[0]?.id||null;window.HappyHoloCardAnalysis=data;setTimeout(()=>{setupStudioObjectUI(studioState);syncControlsFromSelected(studioState);renderObjectPanel(studioState);drawStudioOverlay(studioState);ensureLiveSimulator(studioState);},30);
}
function hookAnalysisFetch(){
  if(typeof window==='undefined'||window.__hhCardFetchHook)return;window.__hhCardFetchHook=true;const native=window.fetch.bind(window);window.fetch=async(...args)=>{const r=await native(...args);try{const u=String(args[0]?.url||args[0]||'');if(u.includes('/api/card-ai-analyze'))r.clone().json().then(d=>setTimeout(()=>applyAnalysisObjects(d),60)).catch(()=>{});}catch(_){}return r;};
}
function ensureOverlay(){const stage=document.getElementById('sim');if(!stage)return null;if(overlayCanvas&&overlayCanvas.isConnected)return overlayCanvas;overlayCanvas=document.createElement('canvas');overlayCanvas.id='hhCardObjectsOverlay';Object.assign(overlayCanvas.style,{position:'absolute',inset:'0',width:'100%',height:'100%',pointerEvents:'none',zIndex:'4'});stage.appendChild(overlayCanvas);const old=document.getElementById('simText');if(old)old.style.display='none';return overlayCanvas;}
function drawStudioOverlay(state){const c=ensureOverlay(),stage=document.getElementById('sim');if(!c||!stage)return;const d=Math.min(devicePixelRatio||1,2),w=Math.max(2,Math.round(stage.clientWidth*d)),h=Math.max(2,Math.round(stage.clientHeight*d));if(c.width!==w||c.height!==h){c.width=w;c.height=h;}const x=c.getContext('2d');x.clearRect(0,0,w,h);drawBusinessCardText(x,state,0,{x:0,y:0,w,h});}
function syncControlsFromSelected(state){const o=selectedObject(state);if(!o)return;const q=id=>document.getElementById(id);if(q('overlayText')){q('overlayText').value=o.type==='text'?o.text:o.label||'Logo';q('overlayText').disabled=o.type==='logo';}if(q('textSize'))q('textSize').value=String(o.size??8);if(q('textDepth'))q('textDepth').value=String(o.depth??40);if(q('textRotation'))q('textRotation').value=String(o.rotation3D??8);if(q('textOrientation'))q('textOrientation').value=String(o.orientation??0);if(q('textFont'))q('textFont').value=o.font||'system';if(q('textColor'))q('textColor').value=o.color||'#ffffff';if(q('textOutline'))q('textOutline').value=o.outline||'#111111';if(q('textOutlineSize'))q('textOutlineSize').value=String(o.outlineSize??3);}
function refreshStudio(state){syncControlsFromSelected(state);renderObjectPanel(state);drawStudioOverlay(state);drawLiveSimulator(state,performance.now());}
function deleteObject(state,id){const idx=state.objects.findIndex(o=>o.id===id);if(idx<0)return;state.objects.splice(idx,1);state.selectedId=state.objects[Math.min(idx,state.objects.length-1)]?.id||null;refreshStudio(state);}
function renderObjectPanel(state){
  if(!objectPanel)return;objectPanel.innerHTML='';const visible=state.objects.filter(o=>!o.hidden);const head=document.createElement('div');head.innerHTML=`<b>Éléments détectés : ${visible.length}</b><div style="font-size:11px;color:#666;margin-top:3px">Modifie ou supprime chaque ligne indépendamment. Sélectionne un élément pour régler sa taille, sa position et sa profondeur.</div>`;objectPanel.appendChild(head);
  const list=document.createElement('div');Object.assign(list.style,{display:'grid',gap:'7px',marginTop:'9px'});
  state.objects.forEach((o,i)=>{if(o.hidden)return;const row=document.createElement('div');Object.assign(row.style,{display:'grid',gridTemplateColumns:o.type==='text'?'42px minmax(0,1fr) 42px':'42px minmax(0,1fr) 42px',gap:'6px',alignItems:'center',padding:'6px',border:o.id===state.selectedId?'2px solid #111':'1px solid #ddd',borderRadius:'10px',background:o.id===state.selectedId?'#fff9d8':'#fff'});
    const pick=document.createElement('button');pick.type='button';pick.textContent=o.type==='logo'?'▣':'T';pick.title='Sélectionner';Object.assign(pick.style,{margin:'0',padding:'8px',background:o.id===state.selectedId?'#111':'#ececec',color:o.id===state.selectedId?'#fff':'#111'});pick.onclick=()=>{state.selectedId=o.id;refreshStudio(state);};row.appendChild(pick);
    if(o.type==='text'){const input=document.createElement('input');input.type='text';input.value=o.text||'';input.placeholder=`Texte ${i+1}`;Object.assign(input.style,{width:'100%',minWidth:'0',padding:'9px',border:'1px solid #bbb',borderRadius:'8px',font:'inherit'});input.onfocus=()=>{state.selectedId=o.id;syncControlsFromSelected(state);drawStudioOverlay(state);};input.oninput=()=>{o.text=input.value;o.label=input.value;state.selectedId=o.id;const q=document.getElementById('overlayText');if(q&&!q.disabled)q.value=o.text;drawStudioOverlay(state);drawLiveSimulator(state,performance.now());};row.appendChild(input);}else{const label=document.createElement('button');label.type='button';label.textContent=o.label||`Logo ${i+1}`;Object.assign(label.style,{margin:'0',padding:'9px',background:'#efefef',color:'#111',textAlign:'left',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'});label.onclick=()=>{state.selectedId=o.id;refreshStudio(state);};row.appendChild(label);}
    const del=document.createElement('button');del.type='button';del.textContent='×';del.title='Supprimer cet élément';Object.assign(del.style,{margin:'0',padding:'8px',background:'#ffe9e7',color:'#8b1f17',fontSize:'19px'});del.onclick=()=>deleteObject(state,o.id);row.appendChild(del);list.appendChild(row);});objectPanel.appendChild(list);
}

function liveFrames(){return [...document.querySelectorAll('#framesGrid .frame img')].filter(im=>im.complete&&im.naturalWidth>0);}
function drawCover(ctx,img,w,h,alpha=1){if(!img?.naturalWidth)return;const s=Math.max(w/img.naturalWidth,h/img.naturalHeight),iw=img.naturalWidth*s,ih=img.naturalHeight*s;ctx.save();ctx.globalAlpha=alpha;ctx.drawImage(img,(w-iw)/2,(h-ih)/2,iw,ih);ctx.restore();}
function drawLiveSimulator(state,now){
  if(!liveCanvas||!liveCtx)return;const d=Math.min(devicePixelRatio||1,2),cssW=Math.max(320,liveCanvas.clientWidth||320),cssH=cssW/1.5858,w=Math.max(2,Math.round(cssW*d)),h=Math.max(2,Math.round(cssH*d));if(liveCanvas.width!==w||liveCanvas.height!==h){liveCanvas.width=w;liveCanvas.height=h;}
  liveCtx.clearRect(0,0,w,h);const frames=liveFrames();if(!frames.length){liveCtx.fillStyle='#171717';liveCtx.fillRect(0,0,w,h);liveCtx.fillStyle='#aaa';liveCtx.font=`${14*d}px -apple-system,sans-serif`;liveCtx.textAlign='center';liveCtx.fillText('Les 9 vues apparaîtront ici',w/2,h/2);return;}
  if(!liveStart)liveStart=now||performance.now();const elapsed=(now||performance.now())-liveStart;
  // Mouvement aller-retour continu. Au lieu de sauter entre les 9 vues, on fond entre deux vues adjacentes.
  const phase=(Math.sin(elapsed/1900*Math.PI)+1)/2,pos=phase*(frames.length-1),i0=Math.floor(pos),i1=Math.min(frames.length-1,i0+1),mix=pos-i0;
  drawCover(liveCtx,frames[i0],w,h,1);if(i1!==i0)drawCover(liveCtx,frames[i1],w,h,mix);
  const norm=frames.length>1?(pos-(frames.length-1)/2)/((frames.length-1)/2):0;drawBusinessCardText(liveCtx,state,norm,{x:0,y:0,w,h});
  const o=selectedObject(state);if(o){liveCtx.save();liveCtx.strokeStyle='rgba(255,214,10,.95)';liveCtx.lineWidth=Math.max(2,d);const cx=clamp(Number(o.x)||.5,0,1)*w+norm*(clamp(Number(o.depth)||0,-100,100)/100)*w*PARALLAX_SCALE,cy=clamp(Number(o.y)||.5,0,1)*h;liveCtx.beginPath();liveCtx.arc(cx,cy,8*d,0,Math.PI*2);liveCtx.stroke();liveCtx.restore();}
}
function liveLoop(now){if(!livePanel?.isConnected)return;if(liveRunning)drawLiveSimulator(studioState,now);liveRAF=requestAnimationFrame(liveLoop);}
function setLargeSimulator(state,on){liveLarge=on;if(!livePanel)return;const btn=livePanel.querySelector('#hhLiveLarge');if(on){Object.assign(livePanel.style,{position:'fixed',inset:'10px',top:'10px',zIndex:'9999',width:'auto',maxWidth:'none',height:'calc(100dvh - 20px)',overflow:'auto',boxShadow:'0 20px 80px rgba(0,0,0,.45)'});document.body.style.overflow='hidden';if(btn)btn.textContent='Réduire';}else{Object.assign(livePanel.style,{position:'sticky',inset:'auto',top:'76px',zIndex:'8',width:'auto',maxWidth:'none',height:'auto',overflow:'visible',boxShadow:'0 8px 28px rgba(0,0,0,.10)'});document.body.style.overflow='';if(btn)btn.textContent='Agrandir';}requestAnimationFrame(()=>drawLiveSimulator(state,performance.now()));}
function ensureLiveSimulator(state){
  if(livePanel?.isConnected)return;const grid=document.querySelector('.grid'),left=grid?.firstElementChild;if(!left)return;livePanel=document.createElement('section');livePanel.id='hhLiveCardSimulator';livePanel.className='card';Object.assign(livePanel.style,{position:'sticky',top:'76px',zIndex:'8',border:'2px solid #17652c',padding:'12px',background:'#fff',boxShadow:'0 8px 28px rgba(0,0,0,.10)'});
  livePanel.innerHTML=`<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap"><div><div style="font-size:11px;font-weight:900;color:#17652c;text-transform:uppercase">Simulation temps réel</div><b style="font-size:15px">Effet lenticulaire final</b></div><div style="display:flex;gap:6px"><button id="hhLiveLarge" type="button" style="width:auto;margin:0;padding:8px 10px;background:#e9e9e9;color:#111">Agrandir</button><button id="hhLiveToggle" type="button" style="width:auto;margin:0;padding:8px 10px;background:#111">Pause</button></div></div><canvas id="hhLiveCanvas" style="display:block;width:100%;aspect-ratio:1.5858/1;margin-top:10px;border-radius:12px;background:#111"></canvas><div style="font-size:11px;color:#666;line-height:1.35;margin-top:7px">Aperçu uniquement : tu peux l’agrandir autant que nécessaire. Le format d’impression 85 × 54 mm reste inchangé. La transition entre les 9 vues est interpolée pour mieux lire les profondeurs.</div>`;
  left.appendChild(livePanel);liveCanvas=livePanel.querySelector('#hhLiveCanvas');liveCtx=liveCanvas.getContext('2d');livePanel.querySelector('#hhLiveToggle').onclick=e=>{liveRunning=!liveRunning;e.currentTarget.textContent=liveRunning?'Pause':'Lecture';if(liveRunning)liveStart=0;drawLiveSimulator(state,performance.now());};livePanel.querySelector('#hhLiveLarge').onclick=()=>setLargeSimulator(state,!liveLarge);
  const textCard=document.getElementById('textCard');const syncVisibility=()=>{const active=textCard&&!textCard.classList.contains('hidden');livePanel.style.display=active?'block':'none';if(active)drawLiveSimulator(state,performance.now());};if(textCard)new MutationObserver(syncVisibility).observe(textCard,{attributes:true,attributeFilter:['class']});syncVisibility();cancelAnimationFrame(liveRAF);liveRAF=requestAnimationFrame(liveLoop);
}

function setupStudioObjectUI(state){
  const card=document.getElementById('textCard');if(!card)return;ensureLiveSimulator(state);if(card.dataset.hhMulti==='1')return;card.dataset.hhMulti='1';const title=card.querySelector('h2');if(title)title.textContent='7. Éléments texte & logo indépendants';const p=card.querySelector('p.small');if(p)p.textContent='Chaque ligne détectée et chaque logo deviennent un objet indépendant : tu peux corriger le texte, supprimer une ligne, déplacer l’élément au doigt/Pencil et régler sa profondeur.';objectPanel=document.createElement('div');objectPanel.id='hhCardObjectPanel';Object.assign(objectPanel.style,{padding:'10px',border:'1px solid #bbb',borderRadius:'12px',background:'#fafafa',margin:'10px 0'});const tg=card.querySelector('.text-grid');card.insertBefore(objectPanel,tg||card.firstChild);ensureOverlay();
  const add=document.createElement('button');add.type='button';add.className='secondary';add.textContent='＋ Ajouter un logo manuellement';add.style.marginTop='8px';add.onclick=()=>{const inp=document.createElement('input');inp.type='file';inp.accept='image/*';inp.onchange=()=>{const f=inp.files?.[0];if(!f)return;const u=URL.createObjectURL(f),im=new Image();im.onload=()=>{state.objects.push({id:`logo-manual-${Date.now()}`,type:'logo',role:'logo',label:f.name,x:.5,y:.5,size:14,orientation:0,rotation3D:8,depth:55,_img:im,src:u});state.selectedId=state.objects.at(-1).id;refreshStudio(state);};im.src=u;};inp.click();};objectPanel.after(add);renderObjectPanel(state);
  for(const id of ['overlayText','textFont','textColor','textOutline','textOutlineSize','textSize','textOrientation','textDepth','textRotation'])document.getElementById(id)?.addEventListener('input',()=>requestAnimationFrame(()=>{drawStudioOverlay(state);renderObjectPanel(state);drawLiveSimulator(state,performance.now());}));
  const sim=document.getElementById('sim');if(sim)new ResizeObserver(()=>{drawStudioOverlay(state);drawLiveSimulator(state,performance.now());}).observe(sim);
  window.addEventListener('keydown',e=>{if(e.key==='Escape'&&liveLarge)setLargeSimulator(state,false);});
}

hookAnalysisFetch();
if(typeof window!=='undefined'){
  const wait=()=>{studioState=window.HappyHoloBusinessCardObjects||studioState;if(studioState){setupStudioObjectUI(studioState);ensureLiveSimulator(studioState);}};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',wait,{once:true});else setTimeout(wait,0);
}
