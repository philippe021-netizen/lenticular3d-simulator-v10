/* HappyHolo V3.2.8 — patch aperçu action dans l'éditeur
   À charger APRES mask-editor-v328-stylet.js et action-engine-v327.js
   But:
   - aperçu visible avant validation finale
   - pas de rectangle
   - l'aperçu utilise le masque libre de la sélection courante
*/
(() => {
  'use strict';

  const wait = (fn, tries=120) => new Promise((resolve,reject)=>{
    let n=0;
    const tick=()=>{
      try{
        const v=fn();
        if(v) return resolve(v);
      }catch(_){}
      if(++n>=tries) return reject(new Error('éditeur non disponible'));
      setTimeout(tick,50);
    };
    tick();
  });

  function canvasFromImageData(img){
    const c=document.createElement('canvas');
    c.width=img.width;c.height=img.height;
    c.getContext('2d').putImageData(img,0,0);
    return c;
  }

  function bbox(mask){
    const d=mask?.data,w=mask?.width,h=mask?.height;
    if(!d||!w||!h)return null;
    let minX=w,minY=h,maxX=-1,maxY=-1;
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      if(d[(y*w+x)*4+3]>12){
        if(x<minX)minX=x;if(y<minY)minY=y;if(x>maxX)maxX=x;if(y>maxY)maxY=y;
      }
    }
    return maxX<0?null:{x:minX,y:minY,w:maxX-minX+1,h:maxY-minY+1};
  }

  function applyPreview(base, sel, phase){
    const out=document.createElement('canvas');
    out.width=base.width;out.height=base.height;
    const x=out.getContext('2d');
    x.drawImage(base,0,0);

    const b=bbox(sel.mask);
    if(!b)return out;

    const maskC=canvasFromImageData(sel.mask);
    const crop=document.createElement('canvas');
    crop.width=b.w;crop.height=b.h;
    const cx=crop.getContext('2d');
    cx.drawImage(base,b.x,b.y,b.w,b.h,0,0,b.w,b.h);
    cx.globalCompositeOperation='destination-in';
    cx.drawImage(maskC,b.x,b.y,b.w,b.h,0,0,b.w,b.h);
    cx.globalCompositeOperation='source-over';

    const patch=document.createElement('canvas');
    patch.width=b.w;patch.height=b.h;
    const px=patch.getContext('2d');
    const intensity=Math.max(.1,Math.min(1,(sel.intensity||50)/100));

    if(sel.action==='pivot'){
      const deg=(2+7*intensity)*phase;
      px.translate(b.w/2,b.h/2);px.rotate(deg*Math.PI/180);px.translate(-b.w/2,-b.h/2);
      px.drawImage(crop,0,0);
    } else if(sel.action==='headlight'){
      px.drawImage(crop,0,0);
      const a=phase*intensity;
      px.save();px.globalCompositeOperation='screen';
      const r=Math.max(b.w,b.h)*(.28+.18*a);
      const g=px.createRadialGradient(b.w/2,b.h/2,0,b.w/2,b.h/2,r);
      g.addColorStop(0,`rgba(255,255,245,${.95*a})`);
      g.addColorStop(.4,`rgba(255,245,200,${.55*a})`);
      g.addColorStop(1,'rgba(255,245,190,0)');
      px.fillStyle=g;px.fillRect(0,0,b.w,b.h);px.restore();
    } else if(sel.action==='person_wink' || sel.action==='cat_blink'){
      const close=Math.min(.92,phase*intensity);
      const nh=Math.max(1,Math.round(b.h*(1-close*.82)));
      const yy=Math.round((b.h-nh)/2);
      px.drawImage(crop,0,0,b.w,b.h,0,yy,b.w,nh);
    } else {
      px.drawImage(crop,0,0);
    }

    x.save();x.globalCompositeOperation='destination-out';x.drawImage(maskC,0,0);x.restore();
    x.drawImage(patch,b.x,b.y);
    return out;
  }

  async function boot(){
    let api;
    try{
      api=await wait(()=>window.HappyHoloMaskEditorAPI);
    }catch(_){
      console.warn('[HAPPYHOLO] API éditeur V3.2.8 absente');
      return;
    }

    const panel=api.getPreviewHost?.();
    if(!panel)return;

    const title=document.createElement('div');
    title.textContent='Aperçu de l’action';
    Object.assign(title.style,{fontWeight:'800',marginBottom:'8px'});
    panel.appendChild(title);

    const c=document.createElement('canvas');
    Object.assign(c.style,{width:'100%',display:'block',borderRadius:'12px',background:'#111',maxHeight:'38vh',objectFit:'contain'});
    panel.appendChild(c);
    const ctx=c.getContext('2d');

    const row=document.createElement('div');
    Object.assign(row.style,{display:'flex',gap:'8px',flexWrap:'wrap',marginTop:'8px'});
    panel.appendChild(row);

    const mk=(txt,fn)=>{
      const b=document.createElement('button');b.type='button';b.textContent=txt;
      Object.assign(b.style,{padding:'10px 12px',minHeight:'42px',border:'0',borderRadius:'10px',fontWeight:'750'});
      b.addEventListener('click',fn);row.appendChild(b);return b;
    };

    let timer=null,token=0;
    const stop=()=>{token++;if(timer){clearTimeout(timer);timer=null;}};

    const renderFrame=(frame)=>{
      c.width=frame.width;c.height=frame.height;
      ctx.clearRect(0,0,c.width,c.height);ctx.drawImage(frame,0,0);
    };

    const playOne=()=>{
      stop();
      const sel=api.getActiveSelection?.();
      const base=api.getOriginalCanvas?.();
      if(!sel||!base)return;
      const phases=[0,.33,.66,1,.66,.33,0];
      const t=++token;let i=0;
      const loop=()=>{
        if(t!==token)return;
        renderFrame(applyPreview(base,sel,phases[i]));
        i=(i+1)%phases.length;
        timer=setTimeout(loop,180);
      };
      loop();
    };

    const showStill=()=>{
      stop();
      const sel=api.getActiveSelection?.();
      const base=api.getOriginalCanvas?.();
      if(!sel||!base)return;
      renderFrame(applyPreview(base,sel,1));
    };

    mk('▶ Voir cette action',playOne);
    mk('◉ Voir effet max',showStill);
    mk('■ Stop',stop);

    api.onSelectionChanged?.(()=>{
      stop();
      const base=api.getOriginalCanvas?.();
      if(base) renderFrame(base);
    });

    const base=api.getOriginalCanvas?.();
    if(base) renderFrame(base);

    console.log('[HAPPYHOLO] aperçu action éditeur V3.2.8 actif');
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();