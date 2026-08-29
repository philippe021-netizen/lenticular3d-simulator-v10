/* HappyHolo — éditeur objet de fond iPad V1
   Correctif ciblé : l'éditeur est rendu dans le document parent, pas dans l'iframe longue.
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
    const pad=.025;
    return {x:clamp(minX-pad,0,1),y:clamp(minY-pad,0,1),w:clamp(maxX-minX+pad*2,.02,1),h:clamp(maxY-minY+pad*2,.02,1)};
  }

  function openEditor(){
    const bg=window.HappyHoloCustomBackground;
    const state=bg?.state;
    const object=state?.bgObject;
    if(!state||!object)return;
    const slot=state[object.slot||'a'];
    if(!slot?.img){alert(`Charge d’abord le fond ${(object.slot||'a').toUpperCase()}.`);return;}

    const {doc}=parentContext();
    doc.getElementById('hhBgObjectEditorParent')?.remove();

    const modal=doc.createElement('div');
    modal.id='hhBgObjectEditorParent';
    Object.assign(modal.style,{position:'fixed',inset:'0',zIndex:'30000000',background:'rgba(9,9,11,.97)',display:'flex',flexDirection:'column',color:'#fff',fontFamily:'-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif',overflow:'hidden',width:'100vw',height:'100dvh'});

    const top=doc.createElement('div');
    Object.assign(top.style,{display:'flex',gap:'8px',alignItems:'center',flexWrap:'wrap',padding:'max(10px, env(safe-area-inset-top)) 10px 10px',background:'#17171a',flex:'0 0 auto'});
    const title=doc.createElement('b');title.textContent='Peindre l’objet du fond';title.style.flex='1';
    const add=doc.createElement('button');add.textContent='＋ Ajouter';
    const erase=doc.createElement('button');erase.textContent='⌫ Gomme';
    const cancel=doc.createElement('button');cancel.textContent='Annuler';
    const ok=doc.createElement('button');ok.textContent='✓ Valider';
    for(const b of [add,erase,cancel,ok])Object.assign(b.style,{padding:'9px 12px',borderRadius:'9px',border:'1px solid #555',fontWeight:'800',margin:'0'});
    Object.assign(add.style,{background:'#087544',color:'#fff'});Object.assign(erase.style,{background:'#333',color:'#fff'});Object.assign(cancel.style,{background:'#333',color:'#fff'});Object.assign(ok.style,{background:'#0a84ff',color:'#fff'});
    const brush=doc.createElement('input');brush.type='range';brush.min='8';brush.max='100';brush.value='36';Object.assign(brush.style,{width:'180px',maxWidth:'35vw'});
    top.append(title,add,erase,cancel,ok,brush);

    const body=doc.createElement('div');Object.assign(body.style,{flex:'1 1 auto',minHeight:'0',position:'relative',overflow:'hidden',background:'#111'});
    const canvas=doc.createElement('canvas');Object.assign(canvas.style,{position:'absolute',inset:'0',width:'100%',height:'100%',display:'block',background:'#111',touchAction:'none'});body.appendChild(canvas);
    const foot=doc.createElement('div');foot.textContent='Apple Pencil ou doigt : peindre • Gomme : corriger';Object.assign(foot.style,{flex:'0 0 auto',padding:'8px 10px max(8px, env(safe-area-inset-bottom))',textAlign:'center',fontSize:'12px',background:'#17171a',opacity:'.9'});
    modal.append(top,body,foot);doc.body.appendChild(modal);

    const im=slot.img;
    let strokes=(object.strokes||[]).map(s=>({erase:!!s.erase,size:Number(s.size)||.025,points:(s.points||[]).map(p=>[p[0],p[1]])}));
    let active=null,eraseMode=false,ctx=null,w=0,h=0,ix=0,iy=0;

    function layoutAndDraw(){
      const r=body.getBoundingClientRect();
      const d=Math.min(window.devicePixelRatio||1,1.5);
      canvas.width=Math.max(2,Math.round(r.width*d));canvas.height=Math.max(2,Math.round(r.height*d));ctx=canvas.getContext('2d');
      const iw=im.naturalWidth||im.width||1,ih=im.naturalHeight||im.height||1;
      const sc=Math.min(canvas.width/iw,canvas.height/ih);w=iw*sc;h=ih*sc;ix=(canvas.width-w)/2;iy=(canvas.height-h)/2;
      draw();
    }
    function draw(){
      if(!ctx)return;ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(im,ix,iy,w,h);
      for(const st of strokes){const pts=st.points||[];if(!pts.length)continue;ctx.save();ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle=st.erase?'rgba(255,70,80,.85)':'rgba(0,229,255,.72)';ctx.fillStyle=ctx.strokeStyle;ctx.lineWidth=Math.max(3,st.size*Math.max(w,h));ctx.beginPath();const p0=pts[0];ctx.moveTo(ix+p0[0]*w,iy+p0[1]*h);if(pts.length===1){ctx.arc(ix+p0[0]*w,iy+p0[1]*h,ctx.lineWidth/2,0,Math.PI*2);ctx.fill();}else{for(let i=1;i<pts.length;i++){const p=pts[i];ctx.lineTo(ix+p[0]*w,iy+p[1]*h);}ctx.stroke();}ctx.restore();}
    }
    function point(e){const r=canvas.getBoundingClientRect(),px=(e.clientX-r.left)*canvas.width/r.width,py=(e.clientY-r.top)*canvas.height/r.height;return [clamp((px-ix)/w,0,1),clamp((py-iy)/h,0,1)];}

    add.onclick=()=>{eraseMode=false;add.style.background='#087544';erase.style.background='#333';};
    erase.onclick=()=>{eraseMode=true;erase.style.background='#8b2732';add.style.background='#333';};
    cancel.onclick=()=>modal.remove();
    ok.onclick=()=>{const bbox=recomputeBBox(strokes);if(!bbox){alert('Peins d’abord l’objet.');return;}object.strokes=strokes;object.bbox=bbox;object.enabled=true;modal.remove();window.dispatchEvent(new CustomEvent('happyholo-background-changed'));window.dispatchEvent(new CustomEvent('happyholo-subject-placement-changed'));};
    canvas.onpointerdown=e=>{e.preventDefault();canvas.setPointerCapture?.(e.pointerId);active={erase:eraseMode,size:Number(brush.value)/Math.max(w,h),points:[point(e)]};strokes.push(active);draw();};
    canvas.onpointermove=e=>{if(!active)return;e.preventDefault();const q=point(e),last=active.points[active.points.length-1];if(Math.hypot((q[0]-last[0])*w,(q[1]-last[1])*h)>1.5){active.points.push(q);draw();}};
    canvas.onpointerup=canvas.onpointercancel=()=>{active=null;};

    requestAnimationFrame(layoutAndDraw);
    setTimeout(layoutAndDraw,120);
  }

  function bind(){
    const buttons=[...document.querySelectorAll('button')];
    const btn=buttons.find(b=>(b.textContent||'').includes('Peindre l’objet dans le fond'));
    if(!btn)return false;
    if(btn.dataset.hhParentEditor==='1')return true;
    btn.dataset.hhParentEditor='1';
    btn.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();openEditor();},true);
    return true;
  }

  if(!bind()){
    const mo=new MutationObserver(()=>{if(bind())mo.disconnect();});
    mo.observe(document.documentElement,{childList:true,subtree:true});
    setTimeout(()=>{bind();},1000);
  }
  console.log('[HAPPYHOLO] éditeur objet de fond iPad parent actif');
})();