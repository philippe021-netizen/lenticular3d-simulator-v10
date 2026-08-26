/* HappyHolo — moteur local d'actions V3.2.7
   Objectif:
   - ne touche ni au détourage, ni au moteur Relief 3D
   - exploite window.happyHoloSelectionPlan produit par mask-editor V3.2.2
   - 3 actions locales réelles: pivot léger, appel de phare, clin d'oeil
   - génère/cache 7 phases [0,.33,.66,1,.66,.33,0] par sélection
   - prévisualisation: Voir cette action / Voir toutes / Stop
   - post-traite automatiquement les 9 vues affichées après export

   IMPORTANT:
   Pour "clin d'oeil" et "appel de phare", la sélection doit entourer la zone locale
   concernée (oeil / phare), pas tout le personnage ou tout le véhicule.
*/
(() => {
  'use strict';

  const VERSION = '3.2.7';
  const PHASES = [0, .33, .66, 1, .66, .33, 0];
  const SUPPORTED = new Set(['pivot','headlight','person_wink','cat_blink']);
  const $ = s => document.querySelector(s);
  const clamp = (v,a,b) => Math.max(a, Math.min(b,v));

  let card = null;
  let selectionPicker = null;
  let statusEl = null;
  let previewCanvas = null;
  let previewCtx = null;
  let timer = null;
  let previewToken = 0;
  let observedFrames = new WeakSet();
  let exportProcessing = false;

  window.HappyHoloActionFrames = window.HappyHoloActionFrames || new Map();

  function state(){
    return window.HappyHoloReliefState || null;
  }

  function plan(){
    return Array.isArray(window.happyHoloSelectionPlan) ? window.happyHoloSelectionPlan : [];
  }

  function imageLikeSource(){
    const s = state();
    return s?.sourceImg || s?.subjectImg || null;
  }

  function make(tag, props={}, parent){
    const n = document.createElement(tag);
    for(const [k,v] of Object.entries(props)){
      if(k === 'style') Object.assign(n.style,v);
      else if(k === 'text') n.textContent=v;
      else n[k]=v;
    }
    parent?.appendChild(n);
    return n;
  }

  function button(text,parent,fn,primary=false){
    const b=make('button',{type:'button',text,style:{
      border:'0',borderRadius:'12px',padding:'11px 13px',fontWeight:'750',
      background:primary?'#111':'#e8e8e8',color:primary?'#fff':'#111',
      margin:'0',minHeight:'44px'
    }},parent);
    b.addEventListener('click',fn);
    return b;
  }

  function setStatus(t){
    if(statusEl) statusEl.textContent=t;
    try{
      const s=$('#status');
      if(s && !String(t).startsWith('Aperçu')) s.textContent=t;
    }catch(_){}
  }

  function bboxFromMask(sel){
    const mask=sel?.mask, w=mask?.width||sel?.width, h=mask?.height||sel?.height;
    const d=mask?.data;
    if(!w || !h || !d) return null;
    let minX=w, minY=h, maxX=-1, maxY=-1, count=0;
    for(let y=0;y<h;y++){
      for(let x=0;x<w;x++){
        const a=d[(y*w+x)*4+3];
        if(a>12){
          if(x<minX)minX=x; if(x>maxX)maxX=x;
          if(y<minY)minY=y; if(y>maxY)maxY=y;
          count++;
        }
      }
    }
    if(!count) return null;
    return {x:minX,y:minY,w:maxX-minX+1,h:maxY-minY+1,maskW:w,maskH:h};
  }

  function maskCanvasFor(sel){
    const m=sel?.mask;
    if(!m?.width || !m?.height || !m?.data) return null;
    const c=document.createElement('canvas');
    c.width=m.width;c.height=m.height;
    c.getContext('2d').putImageData(m,0,0);
    return c;
  }

  function cropSelection(source, sel){
    const box=bboxFromMask(sel);
    const mc=maskCanvasFor(sel);
    if(!box || !mc) return null;
    const c=document.createElement('canvas');
    c.width=box.w;c.height=box.h;
    const x=c.getContext('2d');
    x.drawImage(source, box.x,box.y,box.w,box.h, 0,0,box.w,box.h);
    x.globalCompositeOperation='destination-in';
    x.drawImage(mc, box.x,box.y,box.w,box.h, 0,0,box.w,box.h);
    x.globalCompositeOperation='source-over';
    return {canvas:c, box};
  }

  function phaseForNineView(i, timing){
    if(timing==='1-3' && (i<0 || i>2)) return 0;
    if(timing==='4-6' && (i<3 || i>5)) return 0;
    if(timing==='7-9' && (i<6 || i>8)) return 0;
    // séquence douce sur 9 vues : 0→.5→1→.5→0, sans saut
    const p=[0,.25,.5,.75,1,.75,.5,.25,0];
    return p[i] ?? 0;
  }

  function renderActionPatch(source, sel, phase){
    const crop=cropSelection(source,sel);
    if(!crop) return null;
    const src=crop.canvas, box=crop.box;
    const c=document.createElement('canvas');
    c.width=src.width;c.height=src.height;
    const x=c.getContext('2d');
    const intensity=clamp(Number(sel.intensity ?? 50)/100, .1,1);
    const action=sel.action;

    if(action==='pivot'){
      const deg=(2 + intensity*7) * phase;
      x.translate(c.width/2,c.height/2);
      x.rotate(deg*Math.PI/180);
      x.translate(-c.width/2,-c.height/2);
      x.drawImage(src,0,0);
    }else if(action==='headlight'){
      x.drawImage(src,0,0);
      const amount=phase*intensity;
      x.save();
      x.globalCompositeOperation='screen';
      const r=Math.max(c.width,c.height)*(.28 + .18*amount);
      const g=x.createRadialGradient(c.width/2,c.height/2,0,c.width/2,c.height/2,r);
      g.addColorStop(0,`rgba(255,255,245,${0.95*amount})`);
      g.addColorStop(.35,`rgba(255,248,205,${0.65*amount})`);
      g.addColorStop(1,'rgba(255,245,190,0)');
      x.fillStyle=g;
      x.fillRect(0,0,c.width,c.height);
      x.globalAlpha=.25*amount;
      x.fillStyle='#fff';
      x.fillRect(0,0,c.width,c.height);
      x.restore();
    }else if(action==='person_wink' || action==='cat_blink'){
      // La sélection doit être la zone de l'oeil.
      // On compresse verticalement la zone vers son axe horizontal.
      const close=clamp(phase*intensity,0,.92);
      const nh=Math.max(1,Math.round(c.height*(1-close*.82)));
      const y=Math.round((c.height-nh)/2);
      x.drawImage(src,0,0,c.width,c.height,0,y,c.width,nh);
      // petite ombre de paupière au maximum de fermeture
      if(close>.45){
        x.globalAlpha=(close-.45)*.7;
        x.fillStyle='rgba(25,20,18,.55)';
        x.fillRect(0,Math.round(c.height/2)-1,c.width,Math.max(2,Math.round(c.height*.035)));
        x.globalAlpha=1;
      }
    }else{
      x.drawImage(src,0,0);
    }
    return {canvas:c, box};
  }

  function composeSourceFrame(source, sel, phase){
    const out=document.createElement('canvas');
    out.width=source.naturalWidth||source.width;
    out.height=source.naturalHeight||source.height;
    const x=out.getContext('2d');
    x.drawImage(source,0,0,out.width,out.height);
    const patch=renderActionPatch(source,sel,phase);
    if(patch){
      const {box}=patch;
      // efface uniquement la zone masquée, puis pose le patch transformé
      const mc=maskCanvasFor(sel);
      if(mc){
        x.save();
        x.globalCompositeOperation='destination-out';
        x.drawImage(mc,0,0);
        x.restore();
      }
      x.drawImage(patch.canvas,box.x,box.y);
    }
    return out;
  }

  async function generateSevenFrames(sel){
    const src=imageLikeSource();
    if(!src) throw new Error('Relief non prêt.');
    if(!SUPPORTED.has(sel.action)) return [];
    const frames=PHASES.map(p=>composeSourceFrame(src,sel,p));
    const key=`${sel.index||sel.name}:${sel.action}:${sel.intensity}`;
    window.HappyHoloActionFrames.set(key,{selection:sel,phases:[...PHASES],frames});
    return frames;
  }

  function ensurePreviewCanvas(){
    if(previewCanvas) return;
    const host=$('#view')?.parentElement || document.body;
    const wrap=make('div',{style:{
      position:'relative',marginTop:'10px',borderRadius:'14px',overflow:'hidden',
      background:'#111',display:'none'
    }},host);
    wrap.id='happyholo-action-preview-wrap';
    previewCanvas=make('canvas',{style:{
      width:'100%',display:'block',background:'#111',aspectRatio:'4/3',objectFit:'contain'
    }},wrap);
    previewCtx=previewCanvas.getContext('2d');
  }

  function drawPreviewFrame(canvas){
    ensurePreviewCanvas();
    const wrap=$('#happyholo-action-preview-wrap');
    wrap.style.display='block';
    previewCanvas.width=canvas.width;previewCanvas.height=canvas.height;
    previewCtx.clearRect(0,0,previewCanvas.width,previewCanvas.height);
    previewCtx.drawImage(canvas,0,0);
  }

  function stopPreview(){
    previewToken++;
    if(timer){clearTimeout(timer);timer=null;}
    const wrap=$('#happyholo-action-preview-wrap');
    if(wrap) wrap.style.display='none';
    if(statusEl) statusEl.textContent='Aperçu arrêté.';
  }

  async function previewSelection(sel){
    stopPreview();
    if(!sel || !SUPPORTED.has(sel.action)){
      setStatus('Cette sélection n’a pas encore une action locale prise en charge.');
      return;
    }
    const token=++previewToken;
    const frames=await generateSevenFrames(sel);
    if(!frames.length) return;
    let i=0;
    if(statusEl) statusEl.textContent=`Aperçu — ${sel.name || 'sélection'} — ${labelAction(sel.action)}`;
    const loop=()=>{
      if(token!==previewToken) return;
      drawPreviewFrame(frames[i]);
      i=(i+1)%frames.length;
      timer=setTimeout(loop,180);
    };
    loop();
  }

  async function previewAll(){
    stopPreview();
    const valid=plan().filter(s=>SUPPORTED.has(s.action));
    if(!valid.length){
      setStatus('Aucune action locale prise en charge dans les sélections.');
      return;
    }
    const src=imageLikeSource();
    if(!src) return;
    const token=++previewToken;
    let i=0;
    if(statusEl) statusEl.textContent=`Aperçu — ${valid.length} action(s) combinée(s)`;
    const loop=()=>{
      if(token!==previewToken) return;
      let current=document.createElement('canvas');
      current.width=src.naturalWidth||src.width;current.height=src.naturalHeight||src.height;
      let cx=current.getContext('2d');cx.drawImage(src,0,0,current.width,current.height);
      // compositing simple, chaque action part de l'image courante convertie en ImageBitmap-like canvas
      for(const sel of valid){
        const patch=renderActionPatch(current,sel,PHASES[i]);
        if(!patch) continue;
        const mc=maskCanvasFor(sel);
        if(mc){
          cx.save();cx.globalCompositeOperation='destination-out';cx.drawImage(mc,0,0);cx.restore();
        }
        cx.drawImage(patch.canvas,patch.box.x,patch.box.y);
      }
      drawPreviewFrame(current);
      i=(i+1)%PHASES.length;
      timer=setTimeout(loop,180);
    };
    loop();
  }

  function labelAction(a){
    return ({
      pivot:'Pivot léger',
      headlight:'Appel de phare',
      person_wink:"Clin d’œil",
      cat_blink:'Clignement'
    })[a] || a || 'Aucune';
  }

  function refreshPicker(){
    if(!selectionPicker) return;
    const old=selectionPicker.value;
    selectionPicker.innerHTML='';
    plan().forEach((s,i)=>{
      const o=new Option(`${s.name||`Sélection ${i+1}`} — ${labelAction(s.action)}`,String(i));
      selectionPicker.appendChild(o);
    });
    if(selectionPicker.options.length){
      selectionPicker.value = [...selectionPicker.options].some(o=>o.value===old) ? old : '0';
    }
  }

  function buildCard(){
    if(card) return;
    const anchor=$('.card.grid') || $('.wrap') || document.body;
    card=make('div',{style:{
      marginTop:'16px',background:'#fff',border:'1px solid #ddd',borderRadius:'18px',
      padding:'16px'
    }});
    anchor.parentNode?.insertBefore(card,anchor.nextSibling);

    make('div',{text:`Mini-actions locales V${VERSION}`,style:{fontSize:'18px',fontWeight:'850'}},card);
    make('div',{text:"Pivot, appel de phare et clin d’œil — calculés sur l’iPad, sans API externe.",style:{
      marginTop:'4px',fontSize:'13px',color:'#555',lineHeight:'1.4'
    }},card);

    selectionPicker=make('select',{style:{
      width:'100%',marginTop:'12px',padding:'10px',borderRadius:'10px',border:'1px solid #ccc',
      background:'#fff',font:'inherit'
    }},card);

    const row=make('div',{style:{display:'flex',gap:'8px',flexWrap:'wrap',marginTop:'10px'}},card);
    button('Voir cette action',row,()=>{
      const s=plan()[Number(selectionPicker.value)||0];
      previewSelection(s).catch(e=>setStatus(`Erreur action : ${e.message||e}`));
    },true);
    button('Voir toutes',row,()=>previewAll().catch(e=>setStatus(`Erreur actions : ${e.message||e}`)));
    button('Stop',row,stopPreview);

    statusEl=make('div',{text:'Valide les sélections puis crée le relief.',style:{
      marginTop:'10px',padding:'10px',borderRadius:'10px',background:'#f3f3f3',
      fontSize:'13px',whiteSpace:'pre-wrap'
    }},card);
    refreshPicker();
  }

  function imageToCanvas(img){
    const c=document.createElement('canvas');
    c.width=img.naturalWidth||img.width;
    c.height=img.naturalHeight||img.height;
    c.getContext('2d').drawImage(img,0,0,c.width,c.height);
    return c;
  }

  function scaledMaskForOutput(sel, outW, outH){
    const m=maskCanvasFor(sel);
    if(!m) return null;
    const c=document.createElement('canvas');c.width=outW;c.height=outH;
    c.getContext('2d').drawImage(m,0,0,outW,outH);
    return c;
  }

  function bboxScaled(sel,outW,outH){
    const b=bboxFromMask(sel); if(!b)return null;
    return {
      x:b.x/b.maskW*outW, y:b.y/b.maskH*outH,
      w:b.w/b.maskW*outW, h:b.h/b.maskH*outH
    };
  }

  function applyActionToRenderedFrame(baseCanvas, sel, phase){
    if(!SUPPORTED.has(sel.action) || phase<=0) return baseCanvas;
    const out=document.createElement('canvas');out.width=baseCanvas.width;out.height=baseCanvas.height;
    const x=out.getContext('2d');x.drawImage(baseCanvas,0,0);
    const box=bboxScaled(sel,out.width,out.height);
    const mask=scaledMaskForOutput(sel,out.width,out.height);
    if(!box||!mask)return out;

    const crop=document.createElement('canvas');
    crop.width=Math.max(1,Math.round(box.w));crop.height=Math.max(1,Math.round(box.h));
    crop.getContext('2d').drawImage(baseCanvas,box.x,box.y,box.w,box.h,0,0,crop.width,crop.height);

    const fakeSel={...sel,mask: (()=> {
      const mc=document.createElement('canvas'); mc.width=crop.width;mc.height=crop.height;
      mc.getContext('2d').drawImage(mask,box.x,box.y,box.w,box.h,0,0,crop.width,crop.height);
      return mc.getContext('2d').getImageData(0,0,crop.width,crop.height);
    })()};
    const patch=renderActionPatch(crop,fakeSel,phase);
    if(!patch)return out;

    x.save();x.globalCompositeOperation='destination-out';x.drawImage(mask,0,0);x.restore();
    x.drawImage(patch.canvas,box.x,box.y,box.w,box.h);
    return out;
  }

  async function postProcessNineImages(imgs){
    if(exportProcessing) return;
    exportProcessing=true;
    try{
      const selections=plan().filter(s=>SUPPORTED.has(s.action));
      if(!selections.length) return;
      setStatus('Application des mini-actions sur les 9 vues…');
      for(let i=0;i<9;i++){
        const img=imgs[i];
        if(!img.complete) await new Promise(r=>img.addEventListener('load',r,{once:true}));
        let c=imageToCanvas(img);
        for(const sel of selections){
          const p=phaseForNineView(i,sel.timing);
          c=applyActionToRenderedFrame(c,sel,p);
        }
        const blob=await new Promise((res,rej)=>c.toBlob(b=>b?res(b):rej(new Error('PNG action impossible')),'image/png'));
        const old=img.src;
        img.src=URL.createObjectURL(blob);
        if(old.startsWith('blob:')) setTimeout(()=>URL.revokeObjectURL(old),1200);
        observedFrames.add(img);
      }
      setStatus('9 vues prêtes avec mini-actions locales.');
      window.dispatchEvent(new CustomEvent('happyholo-actions-applied',{detail:{views:9,selections:selections.length}}));
    }finally{
      exportProcessing=false;
    }
  }

  function watchExportFrames(){
    const frames=$('#frames');
    if(!frames) return;
    const check=()=>{
      const imgs=[...frames.querySelectorAll('img')];
      if(imgs.length===9 && imgs.some(i=>!observedFrames.has(i))){
        // Laisse le moteur Relief finir de poser ses 9 images.
        setTimeout(()=>postProcessNineImages([...frames.querySelectorAll('img')]).catch(e=>{
          console.error('[HAPPYHOLO ACTIONS]',e);
          setStatus(`Erreur mini-actions : ${e.message||e}`);
        }),120);
      }
    };
    new MutationObserver(check).observe(frames,{childList:true,subtree:true});
  }

  function boot(){
    buildCard();
    watchExportFrames();
    window.addEventListener('happyholo:selection-plan',()=>setTimeout(refreshPicker,0));
    window.addEventListener('happyholo-relief-ready',()=>{
      refreshPicker();
      setStatus('Relief prêt. Tu peux prévisualiser les mini-actions.');
      // Pré-calcul des 7 phases pour chaque sélection prise en charge.
      plan().filter(s=>SUPPORTED.has(s.action)).forEach(s=>{
        generateSevenFrames(s).catch(e=>console.warn('[HAPPYHOLO ACTION CACHE]',e));
      });
    });
    console.log(`[HAPPYHOLO] moteur mini-actions V${VERSION} actif`);
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();