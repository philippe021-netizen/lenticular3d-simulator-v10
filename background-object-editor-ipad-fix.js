/* HappyHolo — éditeur objet de fond iPad V3
   - vrai viewport parent
   - copie locale du fond
   - masque beaucoup plus transparent pour garder le décor visible
   - pinceau plus fin par défaut + effacement total
*/
(() => {
  'use strict';

  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

  function parentContext(){
    try{
      if(window.parent && window.parent!==window && window.parent.document) return {win:window.parent,doc:window.parent.document};
    }catch(_){ }
    return {win:window,doc:document};
  }

  function recomputeBBox(strokes){
    const pts=(strokes||[]).filter(s=>!s.erase).flatMap(s=>s.points||[]);
    if(!pts.length)return null;
    let minX=1,minY=1,maxX=0,maxY=0;
    for(const p of pts){minX=Math.min(minX,p[0]);minY=Math.min(minY,p[1]);maxX=Math.max(maxX,p[0]);maxY=Math.max(maxY,p[1]);}
    const pad=.018;
    return {x:clamp(minX-pad,0,1),y:clamp(minY-pad,0,1),w:clamp(maxX-minX+pad*2,.02,1),h:clamp(maxY-minY+pad*2,.02,1)};
  }

  async function cloneImageForParent(source,parentDoc){
    const iw=source?.naturalWidth||source?.videoWidth||source?.width||0;
    const ih=source?.naturalHeight||source?.videoHeight||source?.height||0;
    if(!iw||!ih)throw new Error(`Fond invalide (${iw}×${ih}).`);
    const maxSide=1800;
    const scale=Math.min(1,maxSide/Math.max(iw,ih));
    const sw=Math.max(2,Math.round(iw*scale)),sh=Math.max(2,Math.round(ih*scale));
    const snap=document.createElement('canvas');snap.width=sw;snap.height=sh;
    const sx=snap.getContext('2d',{alpha:false});sx.imageSmoothingEnabled=true;sx.imageSmoothingQuality='high';sx.drawImage(source,0,0,sw,sh);
    const url=snap.toDataURL('image/jpeg',.94);
    const img=parentDoc.createElement('img');
    await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(new Error('Copie du fond illisible.'));img.src=url;});
    return img;
  }

  async function openEditor(){
    const bg=window.HappyHoloCustomBackground,state=bg?.state,object=state?.bgObject;
    if(!state||!object)return;
    const slot=state[object.slot||'a'];
    if(!slot?.img){alert(`Charge d’abord le fond ${(object.slot||'a').toUpperCase()}.`);return;}

    const {win:pwin,doc}=parentContext();
    doc.getElementById('hhBgObjectEditorParent')?.remove();

    let im;
    try{im=await cloneImageForParent(slot.img,doc);}catch(err){alert(`Impossible d’ouvrir le fond : ${err.message}`);return;}

    const modal=doc.createElement('div');modal.id='hhBgObjectEditorParent';
    Object.assign(modal.style,{position:'fixed',zIndex:'30000000',background:'#09090b',display:'flex',flexDirection:'column',color:'#fff',fontFamily:'-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif',overflow:'hidden',boxSizing:'border-box'});

    const top=doc.createElement('div');
    Object.assign(top.style,{display:'flex',gap:'8px',alignItems:'center',flexWrap:'wrap',padding:'10px',background:'#17171a',flex:'0 0 auto',boxSizing:'border-box'});
    const title=doc.createElement('b');title.textContent='Peindre l’objet du fond';title.style.flex='1 1 210px';
    const add=doc.createElement('button');add.textContent='＋ Ajouter';
    const erase=doc.createElement('button');erase.textContent='⌫ Gomme';
    const clear=doc.createElement('button');clear.textContent='Effacer tout';
    const cancel=doc.createElement('button');cancel.textContent='Annuler';
    const ok=doc.createElement('button');ok.textContent='✓ Valider';
    for(const b of [add,erase,clear,cancel,ok]){
      Object.assign(b.style,{padding:'9px 12px',borderRadius:'9px',border:'1px solid #555',fontWeight:'800',margin:'0',minHeight:'42px',flex:'0 0 auto'});
      b.style.setProperty('width','auto','important');
    }
    Object.assign(add.style,{background:'#087544',color:'#fff'});Object.assign(erase.style,{background:'#333',color:'#fff'});Object.assign(clear.style,{background:'#3a2727',color:'#fff'});Object.assign(cancel.style,{background:'#222',color:'#fff'});Object.assign(ok.style,{background:'#0a84ff',color:'#fff'});
    const brush=doc.createElement('input');brush.type='range';brush.min='5';brush.max='60';brush.value='18';Object.assign(brush.style,{width:'150px',maxWidth:'24vw',flex:'0 1 150px'});
    const brushOut=doc.createElement('span');brushOut.textContent='18';Object.assign(brushOut.style,{fontSize:'11px',opacity:'.8',minWidth:'20px'});
    brush.oninput=()=>brushOut.textContent=brush.value;
    top.append(title,add,erase,clear,cancel,ok,brush,brushOut);

    const body=doc.createElement('div');Object.assign(body.style,{flex:'1 1 0',minHeight:'220px',position:'relative',overflow:'hidden',background:'#111',boxSizing:'border-box'});
    const canvas=doc.createElement('canvas');Object.assign(canvas.style,{position:'absolute',left:'0',top:'0',width:'100%',height:'100%',display:'block',background:'#111',touchAction:'none',borderRadius:'0',aspectRatio:'auto',maxWidth:'none',maxHeight:'none'});body.appendChild(canvas);
    const foot=doc.createElement('div');foot.textContent='Sélection cyan transparente : le décor reste visible • Pencil/doigt : peindre • Gomme : corriger';Object.assign(foot.style,{flex:'0 0 auto',padding:'8px 10px',textAlign:'center',fontSize:'12px',background:'#17171a',opacity:'.9'});
    modal.append(top,body,foot);doc.body.appendChild(modal);

    let strokes=(object.strokes||[]).map(s=>({erase:!!s.erase,size:Number(s.size)||.014,points:(s.points||[]).map(p=>[p[0],p[1]])}));
    let active=null,eraseMode=false,ctx=null,w=0,h=0,ix=0,iy=0;

    function sizeModal(){
      const vv=pwin.visualViewport;
      const vw=Math.max(320,Math.round(vv?.width||pwin.innerWidth||doc.documentElement.clientWidth||1024));
      const vh=Math.max(420,Math.round(vv?.height||pwin.innerHeight||doc.documentElement.clientHeight||768));
      modal.style.left=`${Math.round(vv?.offsetLeft||0)}px`;modal.style.top=`${Math.round(vv?.offsetTop||0)}px`;modal.style.width=`${vw}px`;modal.style.height=`${vh}px`;
    }

    function layoutAndDraw(){
      sizeModal();const r=body.getBoundingClientRect();if(r.width<40||r.height<40)return;
      const d=Math.min(pwin.devicePixelRatio||1,1.5),cw=Math.max(2,Math.round(r.width*d)),ch=Math.max(2,Math.round(r.height*d));
      if(canvas.width!==cw)canvas.width=cw;if(canvas.height!==ch)canvas.height=ch;
      ctx=canvas.getContext('2d',{alpha:false});
      const iw=im.naturalWidth||im.width||1,ih=im.naturalHeight||im.height||1,sc=Math.min(cw/iw,ch/ih);
      w=Math.max(1,iw*sc);h=Math.max(1,ih*sc);ix=(cw-w)/2;iy=(ch-h)/2;draw();
    }

    function draw(){
      if(!ctx||!w||!h)return;
      ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#111';ctx.fillRect(0,0,canvas.width,canvas.height);
      ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(im,ix,iy,w,h);
      for(const st of strokes){
        const pts=st.points||[];if(!pts.length)continue;
        ctx.save();ctx.lineCap='round';ctx.lineJoin='round';
        ctx.strokeStyle=st.erase?'rgba(255,75,90,.36)':'rgba(0,220,245,.30)';ctx.fillStyle=ctx.strokeStyle;
        ctx.lineWidth=Math.max(2.5,st.size*Math.max(w,h));ctx.beginPath();
        const p0=pts[0];ctx.moveTo(ix+p0[0]*w,iy+p0[1]*h);
        if(pts.length===1){ctx.arc(ix+p0[0]*w,iy+p0[1]*h,ctx.lineWidth/2,0,Math.PI*2);ctx.fill();}
        else{for(let i=1;i<pts.length;i++){const p=pts[i];ctx.lineTo(ix+p[0]*w,iy+p[1]*h);}ctx.stroke();}
        ctx.restore();
      }
    }

    function point(e){
      const r=canvas.getBoundingClientRect(),px=(e.clientX-r.left)*canvas.width/Math.max(1,r.width),py=(e.clientY-r.top)*canvas.height/Math.max(1,r.height);
      return [clamp((px-ix)/Math.max(1,w),0,1),clamp((py-iy)/Math.max(1,h),0,1)];
    }

    add.onclick=()=>{eraseMode=false;add.style.background='#087544';erase.style.background='#333';};
    erase.onclick=()=>{eraseMode=true;erase.style.background='#8b2732';add.style.background='#333';};
    clear.onclick=()=>{strokes=[];active=null;draw();};
    const cleanup=()=>{try{pwin.visualViewport?.removeEventListener('resize',layoutAndDraw);pwin.visualViewport?.removeEventListener('scroll',layoutAndDraw);pwin.removeEventListener('resize',layoutAndDraw);}catch(_){}modal.remove();};
    cancel.onclick=cleanup;
    ok.onclick=()=>{const bbox=recomputeBBox(strokes);if(!bbox){alert('Peins d’abord l’objet.');return;}object.strokes=strokes;object.bbox=bbox;object.enabled=true;cleanup();window.dispatchEvent(new CustomEvent('happyholo-background-changed'));window.dispatchEvent(new CustomEvent('happyholo-subject-placement-changed'));};
    canvas.onpointerdown=e=>{e.preventDefault();canvas.setPointerCapture?.(e.pointerId);active={erase:eraseMode,size:Number(brush.value)/Math.max(1,Math.max(w,h)),points:[point(e)]};strokes.push(active);draw();};
    canvas.onpointermove=e=>{if(!active)return;e.preventDefault();const q=point(e),last=active.points[active.points.length-1];if(Math.hypot((q[0]-last[0])*w,(q[1]-last[1])*h)>1.2){active.points.push(q);draw();}};
    canvas.onpointerup=canvas.onpointercancel=()=>{active=null;};

    sizeModal();requestAnimationFrame(()=>requestAnimationFrame(layoutAndDraw));setTimeout(layoutAndDraw,180);setTimeout(layoutAndDraw,500);
    try{pwin.visualViewport?.addEventListener('resize',layoutAndDraw,{passive:true});pwin.visualViewport?.addEventListener('scroll',layoutAndDraw,{passive:true});pwin.addEventListener('resize',layoutAndDraw,{passive:true});}catch(_){}
  }

  function bind(){
    const btn=[...document.querySelectorAll('button')].find(b=>(b.textContent||'').includes('Peindre l’objet dans le fond'));
    if(!btn)return false;if(btn.dataset.hhParentEditor==='3')return true;
    btn.dataset.hhParentEditor='3';btn.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();openEditor();},true);return true;
  }

  if(!bind()){const mo=new MutationObserver(()=>{if(bind())mo.disconnect();});mo.observe(document.documentElement,{childList:true,subtree:true});setTimeout(bind,1000);}
  console.log('[HAPPYHOLO] éditeur objet de fond iPad parent V3 actif');
})();