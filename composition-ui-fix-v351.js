/* HappyHolo V3.5.1 — correction interface composition avancée */
(() => {
  'use strict';
  const bg=window.HappyHoloCustomBackground;
  const placement=window.HappyHoloSubjectPlacement;
  if(!bg?.state||!placement?.state)return;
  const state=bg.state;
  state.subject.yaw=Number(state.subject.yaw)||0;
  state.subject.pitch=Number(state.subject.pitch)||0;
  state.bgObject=state.bgObject||{enabled:false,slot:'a',rect:null,zoom:100,x:0,y:0,yaw:0,pitch:0};
  const host=document.getElementById('happyHoloCustomBackgrounds');
  if(!host)return;
  const notify=()=>{window.dispatchEvent(new CustomEvent('happyholo-background-changed'));window.dispatchEvent(new CustomEvent('happyholo-subject-placement-changed'));try{window.renderAt?.(0,document.getElementById('happyHoloStickyPreviewCanvas'));}catch(_){}};
  const makeControl=(label,min,max,value,onInput,suffix='°')=>{
    const wrap=document.createElement('label');wrap.style.cssText='display:grid;grid-template-columns:155px 1fr 50px;align-items:center;gap:8px;font-size:12px;font-weight:700';
    const t=document.createElement('span');t.textContent=label;const i=document.createElement('input');i.type='range';i.min=min;i.max=max;i.step='1';i.value=value;const o=document.createElement('b');o.textContent=`${value}${suffix}`;o.style.textAlign='right';
    i.addEventListener('input',()=>{o.textContent=`${i.value}${suffix}`;onInput(Number(i.value));notify();});wrap.append(t,i,o);return{wrap,input:i,out:o};
  };

  const subjectCard=[...host.children].find(el=>el.querySelector?.('b')?.textContent==='Placement du sujet détouré')||[...host.querySelectorAll('div')].find(el=>el.firstElementChild?.tagName==='DIV'&&el.firstElementChild.querySelector?.('b')?.textContent==='Placement du sujet détouré');
  if(subjectCard&&!document.getElementById('happyHoloSubjectRotations')){
    const box=document.createElement('div');box.id='happyHoloSubjectRotations';box.style.cssText='display:grid;gap:9px';
    const yaw=makeControl('Rotation horizontale',-12,12,state.subject.yaw,v=>state.subject.yaw=v);
    const pitch=makeControl('Rotation verticale',-10,10,state.subject.pitch,v=>state.subject.pitch=v);
    box.append(yaw.wrap,pitch.wrap);
    const reset=[...subjectCard.querySelectorAll('button')].find(b=>b.textContent.includes('Réinitialiser le placement'));
    if(reset)subjectCard.insertBefore(box,reset);else subjectCard.appendChild(box);
    reset?.addEventListener('click',()=>{state.subject.yaw=0;state.subject.pitch=0;yaw.input.value='0';pitch.input.value='0';yaw.out.textContent='0°';pitch.out.textContent='0°';notify();});
  }

  if(!document.getElementById('happyHoloStickyPreview')){
    const dock=document.createElement('div');dock.id='happyHoloStickyPreview';dock.style.cssText='position:sticky;top:76px;z-index:80;width:min(300px,40vw);margin:10px 10px 12px auto;background:#17171a;border:2px solid #fff;border-radius:15px;padding:8px;box-shadow:0 8px 28px #0005';
    dock.innerHTML='<div style="color:#fff;font-size:12px;font-weight:850;margin-bottom:6px">Aperçu en direct</div>';
    const c=document.createElement('canvas');c.id='happyHoloStickyPreviewCanvas';c.width=360;c.height=480;c.style.cssText='width:100%;height:auto;max-height:36vh;display:block;background:#111;border-radius:10px';dock.appendChild(c);
    const firstCard=[...host.children].find(el=>el!==host.firstElementChild);host.insertBefore(dock,firstCard||null);setTimeout(notify,50);
  }

  if(!document.getElementById('happyHoloBackgroundObjectCard')){
    const card=document.createElement('div');card.id='happyHoloBackgroundObjectCard';card.style.cssText='margin-top:12px;border:2px solid #444;border-radius:14px;padding:12px;display:grid;gap:9px;background:#f8f8f8';
    card.innerHTML='<div><b>Objet du fond</b><div style="font-size:11px;color:#666;margin-top:3px">Sélectionne par exemple le canapé, puis ajuste-le légèrement pour correspondre à l’orientation du sujet.</div></div>';
    const sel=document.createElement('select');sel.style.cssText='width:100%;padding:9px;border:1px solid #bbb;border-radius:9px;background:#fff';sel.append(new Option('Objet dans le fond A','a'),new Option('Objet dans le fond B','b'));sel.value=state.bgObject.slot;
    const choose=document.createElement('button');choose.type='button';choose.textContent='Sélectionner l’objet dans le fond';choose.style.cssText='padding:10px;border:0;border-radius:10px;background:#111;color:#fff;font-weight:850';
    const status=document.createElement('div');status.style.cssText='font-size:11px;color:#666';status.textContent=state.bgObject.rect?'✓ Objet sélectionné':'Aucun objet sélectionné';
    const z=makeControl('Zoom objet',60,160,state.bgObject.zoom,v=>state.bgObject.zoom=v,'%');const x=makeControl('Objet horizontal',-50,50,state.bgObject.x,v=>state.bgObject.x=v,'%');const y=makeControl('Objet vertical',-50,50,state.bgObject.y,v=>state.bgObject.y=v,'%');const yh=makeControl('Pivot horizontal',-15,15,state.bgObject.yaw,v=>state.bgObject.yaw=v);const pv=makeControl('Pivot vertical',-12,12,state.bgObject.pitch,v=>state.bgObject.pitch=v);
    const clear=document.createElement('button');clear.type='button';clear.textContent='Supprimer la sélection objet';clear.style.cssText='padding:9px;border:1px solid #aaa;border-radius:9px;background:#eee;color:#111;font-weight:800';
    card.append(sel,choose,status,z.wrap,x.wrap,y.wrap,yh.wrap,pv.wrap,clear);host.appendChild(card);
    sel.addEventListener('change',()=>{state.bgObject.slot=sel.value;notify();});clear.addEventListener('click',()=>{state.bgObject.enabled=false;state.bgObject.rect=null;status.textContent='Aucun objet sélectionné';notify();});
    choose.addEventListener('click',()=>{
      const slot=state[state.bgObject.slot];if(!slot?.img){alert(`Charge d’abord le fond ${state.bgObject.slot.toUpperCase()}.`);return;}
      const modal=document.createElement('div');modal.style.cssText='position:fixed;inset:0;z-index:1000010;background:#09090bf2;display:flex;flex-direction:column;color:#fff';
      const top=document.createElement('div');top.style.cssText='padding:10px;display:flex;gap:10px;align-items:center;background:#17171a';top.innerHTML='<b style="flex:1">Encadre l’objet du fond</b>';const cancel=document.createElement('button');cancel.textContent='Annuler';const ok=document.createElement('button');ok.textContent='✓ Valider';for(const b of[cancel,ok])b.style.cssText='padding:10px 14px;border-radius:9px;border:0;font-weight:800';ok.style.background='#0a84ff';ok.style.color='#fff';top.append(cancel,ok);
      const c=document.createElement('canvas');c.style.cssText='flex:1;min-height:0;width:100%;background:#111;touch-action:none';modal.append(top,c);document.body.appendChild(modal);
      requestAnimationFrame(()=>{const r=c.getBoundingClientRect(),d=Math.min(devicePixelRatio||1,1.5);c.width=Math.round(r.width*d);c.height=Math.round(r.height*d);const ctx=c.getContext('2d'),im=slot.img,iw=im.naturalWidth||im.width,ih=im.naturalHeight||im.height,sc=Math.min(c.width/iw,c.height/ih),w=iw*sc,h=ih*sc,ix=(c.width-w)/2,iy=(c.height-h)/2;let box=null,start=null;const draw=()=>{ctx.clearRect(0,0,c.width,c.height);ctx.drawImage(im,ix,iy,w,h);if(box){ctx.save();ctx.strokeStyle='#00e5ff';ctx.lineWidth=4;ctx.fillStyle='rgba(0,229,255,.16)';ctx.fillRect(box.x,box.y,box.w,box.h);ctx.strokeRect(box.x,box.y,box.w,box.h);ctx.restore();}};const p=e=>{const rr=c.getBoundingClientRect();return{x:(e.clientX-rr.left)*c.width/rr.width,y:(e.clientY-rr.top)*c.height/rr.height};};draw();c.onpointerdown=e=>{e.preventDefault();start=p(e);c.setPointerCapture?.(e.pointerId);box={x:start.x,y:start.y,w:0,h:0};draw();};c.onpointermove=e=>{if(!start)return;const q=p(e);box={x:Math.min(start.x,q.x),y:Math.min(start.y,q.y),w:Math.abs(q.x-start.x),h:Math.abs(q.y-start.y)};draw();};c.onpointerup=()=>start=null;cancel.onclick=()=>modal.remove();ok.onclick=()=>{if(!box||box.w<12||box.h<12){alert('Encadre d’abord l’objet.');return;}const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));const bx=clamp((box.x-ix)/w,0,1),by=clamp((box.y-iy)/h,0,1),bw=clamp(box.w/w,0,1-bx),bh=clamp(box.h/h,0,1-by);state.bgObject.rect={x:bx,y:by,w:bw,h:bh};state.bgObject.enabled=true;status.textContent='✓ Objet sélectionné';modal.remove();notify();};});
    });
  }
  window.addEventListener('happyholo-relief-ready',notify);window.addEventListener('happyholo-background-changed',()=>{const c=document.getElementById('happyHoloStickyPreviewCanvas');if(c)try{window.renderAt?.(0,c);}catch(_){}});window.addEventListener('happyholo-subject-placement-changed',()=>{const c=document.getElementById('happyHoloStickyPreviewCanvas');if(c)try{window.renderAt?.(0,c);}catch(_){}});
  console.log('[HAPPYHOLO] composition UI fix V3.5.1 actif');
})();