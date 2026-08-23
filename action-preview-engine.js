/* HappyHolo V3.2.7 — moteur d'actions OFFLINE
   7 frames locales, sans API : rotation légère, appel de phare, clin d'œil.
*/
(() => {
  'use strict';

  const PHASES=[0,.33,.66,1,.66,.33,0];
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

  function fitCover(img,W,H){
    const iw=img.naturalWidth||img.width||1, ih=img.naturalHeight||img.height||1;
    const sc=Math.max(W/iw,H/ih); const w=iw*sc,h=ih*sc;
    return {x:(W-w)/2,y:(H-h)/2,w,h};
  }

  function zonePx(zone,W,H){
    if(!zone) return null;
    return {x:zone.x*W,y:zone.y*H,w:zone.w*W,h:zone.h*H};
  }

  function drawRotate(ctx,layer,phase,intensity,W,H){
    const signed=Math.sin(phase*Math.PI/2);
    const rot=6*intensity*signed;
    const sx=1-Math.abs(signed)*.045*intensity;
    const dx=10*intensity*signed;
    ctx.save();
    ctx.translate(W/2+dx,H/2);
    ctx.rotate(rot*Math.PI/180);
    ctx.scale(sx,1);
    ctx.drawImage(layer,-W/2,-H/2,W,H);
    ctx.restore();
  }

  function drawHeadlight(ctx,layer,phase,intensity,W,H,zone){
    ctx.drawImage(layer,0,0,W,H);
    const z=zonePx(zone,W,H); if(!z) return;
    const p=phase;
    const cx=z.x+z.w/2, cy=z.y+z.h/2;
    const r=Math.max(10,Math.max(z.w,z.h)*(.65+1.25*p));
    ctx.save();
    ctx.globalCompositeOperation='screen';
    const g=ctx.createRadialGradient(cx,cy,0,cx,cy,r);
    const a=.18+.72*p*intensity;
    g.addColorStop(0,`rgba(255,255,255,${Math.min(.98,a)})`);
    g.addColorStop(.28,`rgba(255,248,210,${a*.72})`);
    g.addColorStop(1,'rgba(255,255,255,0)');
    ctx.fillStyle=g;
    ctx.fillRect(cx-r,cy-r,r*2,r*2);
    ctx.globalAlpha=.20+.55*p*intensity;
    ctx.filter=`brightness(${1.5+2.2*p*intensity})`;
    ctx.drawImage(layer,z.x,z.y,z.w,z.h,z.x,z.y,z.w,z.h);
    ctx.restore();
  }

  // Déformation locale simple : des bandes horizontales de la zone œil convergent
  // vers la ligne de paupière. Le reste du visage reste absolument fixe.
  function drawWink(ctx,layer,phase,intensity,W,H,zone){
    ctx.drawImage(layer,0,0,W,H);
    const z=zonePx(zone,W,H); if(!z) return;
    const k=clamp(phase*intensity,0,1);
    const strips=18, sh=z.h/strips, mid=z.y+z.h*.54;
    ctx.save();
    ctx.beginPath(); ctx.rect(z.x,z.y,z.w,z.h); ctx.clip();
    for(let i=0;i<strips;i++){
      const sy=z.y+i*sh;
      const center=sy+sh/2;
      const dist=center-mid;
      const dy=-dist*.74*k;
      const dh=sh*(1-.26*k);
      ctx.drawImage(layer,z.x,sy,z.w,sh,z.x,sy+dy,z.w,dh);
    }
    // ligne de paupière douce au pic de fermeture
    if(k>.35){
      ctx.globalAlpha=(k-.35)/.65*.30;
      ctx.fillStyle='rgba(45,30,28,.72)';
      ctx.fillRect(z.x+z.w*.10,mid-1,z.w*.80,Math.max(1,z.h*.025));
    }
    ctx.restore();
  }

  function renderAction(ctx,layer,s,phase,W,H){
    const intensity=clamp(Number(s.intensity||50)/100,.1,1);
    const action=s.action||'none';
    if(action==='pivot') return drawRotate(ctx,layer,phase,intensity,W,H);
    if(action==='headlight') return drawHeadlight(ctx,layer,phase,intensity,W,H,s.actionZone);
    if(action==='person_wink') return drawWink(ctx,layer,phase,intensity,W,H,s.actionZone);
    ctx.drawImage(layer,0,0,W,H);
  }

  function generateActionFrames({base, layers, selections, activeIndices, W, H}){
    const out=[];
    for(const phase of PHASES){
      const c=document.createElement('canvas'); c.width=W;c.height=H;
      const x=c.getContext('2d'); x.drawImage(base,0,0,W,H);
      selections.forEach((s,i)=>{
        const layer=layers.get(i); if(!layer) return;
        if(activeIndices.includes(i) && (s.action||'none')!=='none') renderAction(x,layer,s,phase,W,H);
        else x.drawImage(layer,0,0,W,H);
      });
      out.push(c);
    }
    return out;
  }

  window.HappyHoloActionPreviewEngine={PHASES,generateActionFrames,renderAction,fitCover};
  console.log('[HAPPYHOLO] action-preview-engine V3.2.7 OFFLINE actif');
})();
