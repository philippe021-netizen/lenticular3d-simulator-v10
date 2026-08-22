/* HappyHolo — Multi-profondeur V1
   Ajoute des sélections indépendantes et applique une parallaxe propre à chaque sélection.
   À charger APRES relief-engine-v31.js et l'éditeur de masque.
*/
(() => {
  'use strict';

  const MAX_PLANES = 5;
  let planes = [];
  let ui = null;
  let editor = null;
  let activePlane = null;
  let planeId = 0;

  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const $=s=>document.querySelector(s);

  function makeCanvas(w,h){ const c=document.createElement('canvas'); c.width=w; c.height=h; return c; }
  function cloneMask(src){ const c=makeCanvas(src.width,src.height); c.getContext('2d').drawImage(src,0,0); return c; }

  function subjectMaskFromAlpha(){
    if(typeof subjectImg==='undefined' || !subjectImg) return null;
    const w=subjectImg.naturalWidth||subjectImg.width, h=subjectImg.naturalHeight||subjectImg.height;
    const c=makeCanvas(w,h), x=c.getContext('2d',{willReadFrequently:true});
    x.drawImage(subjectImg,0,0,w,h);
    const d=x.getImageData(0,0,w,h), out=x.createImageData(w,h);
    for(let i=0;i<w*h;i++){
      const a=d.data[i*4+3]; out.data[i*4]=255;out.data[i*4+1]=255;out.data[i*4+2]=255;out.data[i*4+3]=a;
    }
    x.putImageData(out,0,0); return c;
  }


  const ACTION_PROMPTS={
    wink:'FIXED CAMERA. Keep identity, body, clothes, lighting and background stable. One small natural wink only. No body translation, no zoom, no camera movement.',
    smile:'FIXED CAMERA. Keep identity and pose stable. Form a small natural smile with minimal cheek and eye movement. No body translation or camera movement.',
    kiss:'FIXED CAMERA. Keep body and background stable. Make one small kiss gesture with minimal head movement.',
    'cat-blink':'FIXED CAMERA. Keep cat body, fur and background stable. One slow natural blink only.',
    meow:'FIXED CAMERA. Keep cat body and background stable. One small natural meow: mouth opens slightly then closes. No body translation.',
    'dog-tilt':'FIXED CAMERA. Keep dog body and background stable. Very small natural head tilt only.',
    bark:'FIXED CAMERA. Keep dog body and background stable. One small bark with brief mouth movement. No body translation.',
    headlight:'Keep vehicle and background perfectly fixed. Perform one brief headlight flash only. No vehicle movement, no camera movement.',
    indicator:'Keep vehicle and background perfectly fixed. Blink one indicator briefly. No vehicle movement, no camera movement.',
    'logo-shine':'Keep logo geometry fixed. Add one subtle moving specular shine across the logo. No camera movement.',
    pivot:'Keep object centered and background stable. Very slight showroom pivot only, minimal angle, no translation.'
  };

  function syncActionState(){
    window.HappyHoloActionPlan=planes.map((p,i)=>({
      selection:i+1,name:p.name,depth:p.depth,action:p.action||'none',intensity:p.intensity??.5,timing:p.timing||'all',prompt:ACTION_PROMPTS[p.action]||''
    }));
    window.dispatchEvent(new CustomEvent('happyholo-action-plan-change',{detail:window.HappyHoloActionPlan}));
  }

  function ensureUI(){
    if(ui) return;
    const host=$('#build')?.parentElement || document.querySelector('section') || document.body;
    ui=document.createElement('div');
    ui.id='multiDepthPanel';
    Object.assign(ui.style,{marginTop:'14px',padding:'12px',border:'2px solid #111',borderRadius:'14px',background:'#fff'});
    ui.innerHTML=`
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap">
        <strong style="font-size:16px">Plans de profondeur</strong>
        <button type="button" id="mdAdd" style="margin:0">＋ Nouvelle sélection</button>
      </div>
      <div style="font-size:12px;color:#666;margin:7px 0 10px">Chaque sélection peut avoir une profondeur différente. Le sujet non sélectionné garde la profondeur générale.</div>
      <div id="mdList"></div>`;
    host.appendChild(ui);
    ui.querySelector('#mdAdd').addEventListener('click',()=>addPlane());
    renderList();
  }

  function addPlane(){
    if(planes.length>=MAX_PLANES){ alert(`Maximum ${MAX_PLANES} sélections.`); return; }
    const base=subjectMaskFromAlpha();
    if(!base){ alert('Crée d’abord le relief / détourage.'); return; }
    const empty=makeCanvas(base.width,base.height);
    const p={id:++planeId,name:`Sélection ${planes.length+1}`,depth:Math.min(.70, Math.max(.10, Number($('#subjectDepth')?.value||.48))),action:'none',intensity:0.50,timing:'all',mask:empty};
    planes.push(p); syncActionState(); renderList(); openEditor(p);
  }

  function renderList(){
    if(!ui) return;
    const list=ui.querySelector('#mdList'); list.innerHTML='';
    if(!planes.length){ list.innerHTML='<div style="padding:9px;border-radius:10px;background:#f3f3f3;font-size:13px">Aucune sélection indépendante.</div>'; return; }
    planes.forEach((p,i)=>{
      p.name=`Sélection ${i+1}`;
      const row=document.createElement('div');
      Object.assign(row.style,{padding:'10px',marginTop:'8px',border:'1px solid #ddd',borderRadius:'11px',background:'#fafafa'});
      row.innerHTML=`
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
          <b>${p.name}</b>
          <div><button type="button" data-edit>Modifier</button> <button type="button" data-del class="secondary">Supprimer</button></div>
        </div>
        <div style="display:flex;align-items:center;gap:9px;margin-top:8px">
          <span style="font-size:12px;min-width:70px">Profondeur</span>
          <input data-depth type="range" min="0.10" max="0.70" step="0.01" value="${p.depth}" style="flex:1">
          <b data-out style="min-width:38px;text-align:right">${p.depth.toFixed(2)}</b>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px">
          <label style="font-size:12px">Action
            <select data-action style="width:100%;margin-top:4px;padding:8px;border-radius:8px">
              <option value="none">Aucune</option>
              <option value="wink">Personne — clin d’œil</option>
              <option value="smile">Personne — sourire léger</option>
              <option value="kiss">Personne — petit bisou</option>
              <option value="cat-blink">Chat — clignement</option>
              <option value="meow">Chat — miaulement</option>
              <option value="dog-tilt">Chien — tête penchée</option>
              <option value="bark">Chien — petit aboiement</option>
              <option value="headlight">Moto/voiture — appel de phare</option>
              <option value="indicator">Moto/voiture — clignotant</option>
              <option value="logo-shine">Logo — brillance</option>
              <option value="pivot">Objet — pivot léger</option>
            </select>
          </label>
          <label style="font-size:12px">Moment
            <select data-timing style="width:100%;margin-top:4px;padding:8px;border-radius:8px">
              <option value="all">Toute la séquence</option>
              <option value="early">Vues 1–3</option>
              <option value="middle">Vues 4–6</option>
              <option value="late">Vues 7–9</option>
            </select>
          </label>
        </div>
        <div style="display:flex;align-items:center;gap:9px;margin-top:8px">
          <span style="font-size:12px;min-width:70px">Intensité</span>
          <input data-intensity type="range" min="0.10" max="1.00" step="0.05" value="${p.intensity}" style="flex:1">
          <b data-intensity-out style="min-width:38px;text-align:right">${p.intensity.toFixed(2)}</b>
        </div>`;
      row.querySelector('[data-edit]').addEventListener('click',()=>openEditor(p));
      row.querySelector('[data-del]').addEventListener('click',()=>{ planes=planes.filter(x=>x!==p); syncActionState(); renderList(); });
      const r=row.querySelector('[data-depth]'),o=row.querySelector('[data-out]');
      r.addEventListener('input',()=>{p.depth=Number(r.value);o.textContent=p.depth.toFixed(2);});
      const act=row.querySelector('[data-action]'),tim=row.querySelector('[data-timing]');
      act.value=p.action||'none'; tim.value=p.timing||'all';
      act.addEventListener('change',()=>{p.action=act.value;syncActionState();});
      tim.addEventListener('change',()=>{p.timing=tim.value;syncActionState();});
      const ir=row.querySelector('[data-intensity]'),io=row.querySelector('[data-intensity-out]');
      ir.addEventListener('input',()=>{p.intensity=Number(ir.value);io.textContent=p.intensity.toFixed(2);syncActionState();});
      list.appendChild(row);
    });
  }

  function ensureEditor(){
    if(editor) return;
    const root=document.createElement('div');
    root.id='multiDepthEditor';
    Object.assign(root.style,{position:'fixed',inset:'0',zIndex:'1000001',display:'none',flexDirection:'column',background:'#101014',color:'#fff',fontFamily:'-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif'});
    root.innerHTML=`
      <div style="padding:10px 12px;background:#17171a;border-bottom:1px solid #333;display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <button id="mdeCancel" type="button">← Annuler</button>
        <strong id="mdeTitle" style="font-size:18px;flex:1">Sélection 1</strong>
        <button id="mdeClear" type="button">Effacer</button>
        <button id="mdeValidate" type="button" style="background:#0a84ff">✓ Valider</button>
      </div>
      <div style="display:flex;flex:1;min-height:0">
        <div style="width:190px;max-width:38vw;background:#17171a;border-right:1px solid #333;padding:10px;overflow:auto">
          <button id="mdeMagic" type="button" style="width:100%;margin:0 0 8px;background:#0a84ff">🪄 Baguette</button>
          <button id="mdeAdd" type="button" style="width:100%;margin:0 0 8px">＋ Ajouter</button>
          <button id="mdeErase" type="button" style="width:100%;margin:0 0 8px">⌫ Gomme</button>
          <div style="margin-top:12px;padding:9px;border:1px solid #444;border-radius:10px">
            <b style="font-size:12px">Baguette</b>
            <label style="font-size:12px;display:block;margin-top:10px">Tolérance <span id="mdeTolOut">45</span></label>
            <input id="mdeTol" type="range" min="5" max="120" value="45" style="width:100%">
            <div style="font-size:11px;opacity:.7;margin-top:8px">Touchez la personne ou l’objet à isoler.</div>
          </div>
        </div>
        <div style="position:relative;flex:1;min-width:0;min-height:0;overflow:hidden;background:#080808">
          <canvas id="mdeCanvas" style="position:absolute;inset:0;width:100%;height:100%;touch-action:none"></canvas>
        </div>
      </div>
      <div style="padding:9px 12px;background:#17171a;border-top:1px solid #333;display:flex;gap:10px;align-items:center">
        <span style="font-size:12px">Pinceau</span><input id="mdeBrush" type="range" min="4" max="140" value="34" style="width:170px">
        <span style="font-size:12px;opacity:.7">Baguette : toucher pour sélectionner</span>
      </div>`;
    document.body.appendChild(root);
    const canvas=root.querySelector('#mdeCanvas'), ctx=canvas.getContext('2d');
    editor={root,canvas,ctx,tool:'magic',brush:34,tol:45,zoom:1,panX:0,panY:0,drawing:false,last:null,working:null,orig:null};

    root.querySelector('#mdeCancel').onclick=closeEditor;
    root.querySelector('#mdeValidate').onclick=()=>{ if(activePlane&&editor.working) activePlane.mask=cloneMask(editor.working); closeEditor(); renderList(); };
    root.querySelector('#mdeClear').onclick=()=>{editor.working.getContext('2d').clearRect(0,0,editor.working.width,editor.working.height);drawEditor();};
    root.querySelector('#mdeMagic').onclick=()=>setEditorTool('magic');
    root.querySelector('#mdeAdd').onclick=()=>setEditorTool('add');
    root.querySelector('#mdeErase').onclick=()=>setEditorTool('erase');
    root.querySelector('#mdeBrush').oninput=e=>editor.brush=Number(e.target.value);
    root.querySelector('#mdeTol').oninput=e=>{editor.tol=Number(e.target.value);root.querySelector('#mdeTolOut').textContent=editor.tol;};

    function point(e){ const r=canvas.getBoundingClientRect(); return {x:e.clientX-r.left,y:e.clientY-r.top}; }
    function imagePoint(p){ const r=canvas.getBoundingClientRect(); const fit=Math.min(r.width/editor.orig.width,r.height/editor.orig.height)*.94; const ox=(r.width-editor.orig.width*fit)/2, oy=(r.height-editor.orig.height*fit)/2; return {x:(p.x-ox)/fit,y:(p.y-oy)/fit,fit,ox,oy}; }
    canvas.addEventListener('pointerdown',e=>{e.preventDefault();const p=point(e),q=imagePoint(p);if(editor.tool==='magic'){magicFill(q.x,q.y);drawEditor();return;}editor.drawing=true;editor.last=q;paint(q.x,q.y);drawEditor();canvas.setPointerCapture?.(e.pointerId);});
    canvas.addEventListener('pointermove',e=>{if(!editor.drawing)return;const q=imagePoint(point(e));line(editor.last,q);editor.last=q;drawEditor();});
    const up=()=>{editor.drawing=false;editor.last=null;}; canvas.addEventListener('pointerup',up);canvas.addEventListener('pointercancel',up);
    window.addEventListener('resize',()=>{ if(root.style.display!=='none') resizeEditor(); });

    function paint(x,y){ if(x<0||y<0||x>=editor.working.width||y>=editor.working.height)return;const m=editor.working.getContext('2d');m.save();m.globalCompositeOperation=editor.tool==='erase'?'destination-out':'source-over';m.fillStyle='#fff';m.beginPath();m.arc(x,y,editor.brush/2,0,Math.PI*2);m.fill();m.restore(); }
    function line(a,b){const d=Math.hypot(b.x-a.x,b.y-a.y),n=Math.max(1,Math.ceil(d/Math.max(1,editor.brush*.2)));for(let i=0;i<=n;i++){const t=i/n;paint(a.x+(b.x-a.x)*t,a.y+(b.y-a.y)*t);}}
    function magicFill(fx,fy){
      const w=editor.orig.width,h=editor.orig.height,x0=Math.round(fx),y0=Math.round(fy);if(x0<0||y0<0||x0>=w||y0>=h)return;
      const oc=editor.orig.getContext('2d',{willReadFrequently:true}),od=oc.getImageData(0,0,w,h).data;
      const md=editor.working.getContext('2d',{willReadFrequently:true}),mi=md.getImageData(0,0,w,h);
      const i0=(y0*w+x0)*4,r0=od[i0],g0=od[i0+1],b0=od[i0+2],tol=editor.tol;
      const seen=new Uint8Array(w*h),stack=[y0*w+x0]; let count=0;
      while(stack.length&&count<Math.min(w*h,650000)){
        const idx=stack.pop(); if(seen[idx])continue;seen[idx]=1; const i=idx*4;
        const dr=od[i]-r0,dg=od[i+1]-g0,db=od[i+2]-b0; if(Math.sqrt(dr*dr+dg*dg+db*db)>tol)continue;
        mi.data[i]=255;mi.data[i+1]=255;mi.data[i+2]=255;mi.data[i+3]=255;count++;
        const x=idx%w,y=(idx/w)|0; if(x>0)stack.push(idx-1);if(x<w-1)stack.push(idx+1);if(y>0)stack.push(idx-w);if(y<h-1)stack.push(idx+w);
      }
      md.putImageData(mi,0,0);
    }
  }

  function setEditorTool(t){ if(!editor)return;editor.tool=t;['Magic','Add','Erase'].forEach(n=>{const b=editor.root.querySelector('#mde'+n);if(b)b.style.background=(n.toLowerCase()===t?'#0a84ff':'#242424');}); }
  function resizeEditor(){ const r=editor.canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,1.5);editor.canvas.width=Math.max(2,Math.round(r.width*dpr));editor.canvas.height=Math.max(2,Math.round(r.height*dpr));drawEditor(); }
  function drawEditor(){
    if(!editor?.orig)return; const c=editor.canvas,ctx=editor.ctx,r=c.getBoundingClientRect(),dpr=c.width/Math.max(1,r.width);ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,r.width,r.height);
    const fit=Math.min(r.width/editor.orig.width,r.height/editor.orig.height)*.94,ox=(r.width-editor.orig.width*fit)/2,oy=(r.height-editor.orig.height*fit)/2;
    ctx.drawImage(editor.orig,ox,oy,editor.orig.width*fit,editor.orig.height*fit);
    const overlay=makeCanvas(editor.working.width,editor.working.height),o=overlay.getContext('2d');o.fillStyle='rgba(255,153,0,.50)';o.fillRect(0,0,overlay.width,overlay.height);o.globalCompositeOperation='destination-in';o.drawImage(editor.working,0,0);ctx.drawImage(overlay,ox,oy,overlay.width*fit,overlay.height*fit);
  }
  function closeEditor(){ if(!editor)return;editor.root.style.display='none';document.body.style.overflow='';activePlane=null; }
  function openEditor(p){
    ensureEditor(); activePlane=p; editor.root.querySelector('#mdeTitle').textContent=p.name; editor.root.style.display='flex';document.body.style.overflow='hidden';
    const w=sourceImg?.naturalWidth||subjectImg?.naturalWidth,h=sourceImg?.naturalHeight||subjectImg?.naturalHeight; editor.orig=makeCanvas(w,h);editor.orig.getContext('2d').drawImage(sourceImg||subjectImg,0,0,w,h);editor.working=cloneMask(p.mask);setEditorTool('magic');setTimeout(resizeEditor,50);
  }

  // RENDU: conserve le moteur existant puis déplace les zones sélectionnées selon leur profondeur propre.
  function installRenderPatch(){
    if(typeof renderAt!=='function' || renderAt.__multiDepthPatched) return;
    const baseRender=renderAt;
    const patched=function(norm,target=view){
      baseRender(norm,target);
      if(!planes.length || !subjectImg) return;
      const W=target.width,H=target.height,x=target.getContext('2d');
      const amplitude=Number($('#angle')?.value||7)/4;
      const globalDepth=Number($('#subjectDepth')?.value||.48);
      const baseShift=norm*18*amplitude*(globalDepth/.30);
      const fs=(typeof fitCover==='function')?fitCover(subjectImg,W,H):{x:0,y:0,w:W,h:H};

      for(const p of planes){
        if(!p.mask) continue;
        const desiredShift=norm*18*amplitude*(p.depth/.30);
        const delta=desiredShift-baseShift;
        if(Math.abs(delta)<.05) continue;
        const layer=makeCanvas(W,H),lx=layer.getContext('2d');
        lx.drawImage(subjectImg,fs.x,fs.y,fs.w,fs.h);
        const maskScaled=makeCanvas(W,H),mx=maskScaled.getContext('2d');
        mx.drawImage(p.mask,fs.x,fs.y,fs.w,fs.h);
        lx.globalCompositeOperation='destination-in';lx.drawImage(maskScaled,0,0);

        // Retire la zone à son emplacement global pour éviter un double sujet.
        x.save();x.globalCompositeOperation='destination-out';x.globalAlpha=.92;x.drawImage(maskScaled,baseShift,0);x.restore();
        x.drawImage(layer,baseShift+delta,0);
      }
    };
    patched.__multiDepthPatched=true;
    renderAt=patched;
  }

  window.addEventListener('happyholo-relief-ready',()=>{ ensureUI(); installRenderPatch(); });
  document.addEventListener('DOMContentLoaded',()=>{ ensureUI(); installRenderPatch(); });
  setTimeout(()=>{ ensureUI(); installRenderPatch(); },600);

  window.HappyHoloMultiDepth={get planes(){return planes;},add:addPlane,getActionPlan:()=>window.HappyHoloActionPlan||[]};
  syncActionState();
  console.log('[HAPPYHOLO] Multi-profondeur + actions V2 actif');
})();
