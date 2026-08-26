/* HappyHolo V3.3.8 — arrière-plans personnalisés locaux A/B */
(() => {
  'use strict';

  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const state={mode:'original',a:{img:null,url:'',zoom:100,x:0,y:0,name:''},b:{img:null,url:'',zoom:100,x:0,y:0,name:''}};

  function slotFor(norm){
    if(state.mode==='fixedA')return state.a;
    if(state.mode==='fixedB')return state.b;
    if(state.mode==='flipAB')return Number(norm||0)<=0?state.a:state.b;
    return null;
  }

  function draw(ctx,norm,W,H,rect={x:0,y:0,w:W,h:H}){
    const slot=slotFor(norm);if(!slot?.img)return false;
    const img=slot.img,iw=img.naturalWidth||img.width||1,ih=img.naturalHeight||img.height||1;
    const scale=Math.max(rect.w/iw,rect.h/ih)*(clamp(Number(slot.zoom)||100,60,180)/100);
    const w=iw*scale,h=ih*scale;
    const x=rect.x+(rect.w-w)/2+(Number(slot.x)||0)/100*rect.w*.5;
    const y=rect.y+(rect.h-h)/2+(Number(slot.y)||0)/100*rect.h*.5;
    ctx.drawImage(img,x,y,w,h);return true;
  }

  function notify(){
    window.dispatchEvent(new CustomEvent('happyholo-background-changed'));
    try{window.renderAt?.(0,window.HappyHoloReliefState?.view);}catch(_){ }
  }

  function serialize(){return{mode:state.mode,a:state.a.name||null,b:state.b.name||null,zoomA:state.a.zoom,xA:state.a.x,yA:state.a.y,zoomB:state.b.zoom,xB:state.b.x,yB:state.b.y};}
  window.HappyHoloCustomBackground={state,draw,serialize,isActive:()=>state.mode!=='original'&&!!slotFor(0)?.img};

  function control(label,min,max,value,onInput,suffix='%'){
    const wrap=document.createElement('label');wrap.style.cssText='display:grid;grid-template-columns:155px 1fr 50px;align-items:center;gap:8px;font-size:12px;font-weight:700';
    const text=document.createElement('span');text.textContent=label;
    const input=document.createElement('input');input.type='range';input.min=min;input.max=max;input.value=value;
    const out=document.createElement('b');out.textContent=`${value}${suffix}`;out.style.textAlign='right';
    input.addEventListener('input',()=>{out.textContent=`${input.value}${suffix}`;onInput(Number(input.value));notify();});wrap.append(text,input,out);return wrap;
  }

  function slotCard(key,title){
    const slot=state[key],card=document.createElement('div');card.style.cssText='border:1px solid #ccc;border-radius:14px;padding:12px;display:grid;gap:9px;background:#fafafa';
    const head=document.createElement('b');head.textContent=title;
    const file=document.createElement('input');file.type='file';file.accept='image/*';
    const status=document.createElement('div');status.textContent='Aucune image';status.style.cssText='font-size:11px;color:#666;white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
    file.addEventListener('change',()=>{
      const f=file.files?.[0];if(!f)return;
      if(slot.url)URL.revokeObjectURL(slot.url);slot.url=URL.createObjectURL(f);slot.name=f.name;
      const im=new Image();im.onload=()=>{slot.img=im;status.textContent=`✓ ${f.name}`;notify();};im.src=slot.url;
    });
    card.append(head,file,status,
      control('Zoom',60,180,100,v=>slot.zoom=v),
      control('Position horizontale',-50,50,0,v=>slot.x=v),
      control('Position verticale',-50,50,0,v=>slot.y=v));
    return card;
  }

  const host=document.createElement('section');host.id='happyHoloCustomBackgrounds';
  host.style.cssText='background:#fff;border:2px solid #111;border-radius:18px;padding:16px;margin:16px 0';
  const title=document.createElement('div');title.innerHTML='<div style="font-size:20px;font-weight:900">Arrière-plan personnalisé</div><div style="font-size:12px;color:#666;margin-top:3px">Deux fonds locaux maximum derrière le sujet détouré.</div>';
  const mode=document.createElement('select');mode.style.cssText='width:100%;padding:10px;border:1px solid #bbb;border-radius:10px;margin:12px 0';
  [['Décor reconstruit actuel','original'],['Fond A fixe','fixedA'],['Fond B fixe','fixedB'],['Effet lenticulaire A / B','flipAB']].forEach(([t,v])=>mode.appendChild(new Option(t,v)));
  mode.addEventListener('change',()=>{state.mode=mode.value;notify();});
  const grid=document.createElement('div');grid.style.cssText='display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px';grid.append(slotCard('a','Fond A'),slotCard('b','Fond B'));
  const hint=document.createElement('div');hint.textContent='Effet A/B : le fond A apparaît dans les vues de gauche, le fond B dans les vues de droite. Le sujet reste identique.';hint.style.cssText='margin-top:10px;padding:9px;border-radius:9px;background:#f1f1f1;font-size:11px;color:#555';
  host.append(title,mode,grid,hint);
  const anchor=document.getElementById('happyHoloSelectionControls')||document.querySelector('.card.grid')?.nextSibling;
  if(anchor?.parentNode)anchor.parentNode.insertBefore(host,anchor);else document.querySelector('.wrap')?.appendChild(host);
  if(window.innerWidth<760)grid.style.gridTemplateColumns='1fr';
  console.log('[HAPPYHOLO] custom-background V3.3.8 local A/B actif');
})();
