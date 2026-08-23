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

  function drawHeadlight(ctx,layer,phase,intensity,W,H,zone,mode='off_to_on'){
    // V3.3.0 : par défaut, l'appel de phare doit être VISIBILE.
    // On part donc d'un phare quasi éteint puis on monte jusqu'au plein phare.
    // Tout reste ultra localisé à l'optique : pas d'éclaircissement du pilote ni de la carrosserie.
    ctx.drawImage(layer,0,0,W,H);
    const z=zonePx(zone,W,H); if(!z) return;

    const p=clamp(phase,0,1);
    const k=clamp(intensity,0.1,1);
    const cx=z.x+z.w/2, cy=z.y+z.h/2;
    const rx=Math.max(4,z.w*.50), ry=Math.max(4,z.h*.50);

    // 1) État de base / assombrissement local du phare.
    // En mode visible (par défaut), le phare est quasi éteint au repos pour que l'appel soit net.
    const dimAlpha = mode==='off_to_on'
      ? clamp((0.86 - 0.80*p) * (0.65 + 0.35*k), 0, 0.92)
      : clamp((0.10 - 0.08*p) * k, 0, 0.12);
    if(dimAlpha>0.001){
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(cx,cy,rx,ry,0,0,Math.PI*2);
      ctx.clip();
      const dg=ctx.createRadialGradient(cx,cy,0,cx,cy,Math.max(rx,ry));
      dg.addColorStop(0,`rgba(0,0,0,${Math.min(0.95,dimAlpha)})`);
      dg.addColorStop(.75,`rgba(0,0,0,${Math.max(0,dimAlpha*.70)})`);
      dg.addColorStop(1,'rgba(0,0,0,0)');
      ctx.fillStyle=dg;
      ctx.fillRect(z.x-rx*.2,z.y-ry*.2,z.w+rx*.4,z.h+ry*.4);
      ctx.restore();
    }

    // 2) Montée lumineuse : plus franche en mode visible, plus douce en mode réaliste.
    const flash = mode==='off_to_on'
      ? Math.pow(p, 1.10) * (0.70 + 0.30*k)
      : Math.pow(p, 1.25) * (0.45 + 0.25*k);
    if(flash<=0.001) return;

    // Surintensité interne : contenue dans l'optique.
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx,cy,rx,ry,0,0,Math.PI*2);
    ctx.clip();
    ctx.globalCompositeOperation='screen';
    ctx.globalAlpha=(mode==='off_to_on'?0.88:0.34)*flash;
    ctx.filter=`brightness(${1 + (mode==='off_to_on'?4.8:2.0)*flash}) contrast(${1 + .18*flash}) saturate(${1 - .10*flash})`;
    ctx.drawImage(layer,z.x,z.y,z.w,z.h,z.x,z.y,z.w,z.h);
    ctx.restore();
    ctx.filter='none';

    // 3) Cœur lumineux très visible au pic.
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx,cy,rx,ry,0,0,Math.PI*2);
    ctx.clip();
    ctx.globalCompositeOperation='screen';
    const coreR=Math.max(4,Math.min(z.w,z.h)*(mode==='off_to_on'?.64:.52));
    const g=ctx.createRadialGradient(cx,cy,0,cx,cy,coreR);
    const a=(mode==='off_to_on'?0.96:0.60)*flash;
    g.addColorStop(0,`rgba(255,255,255,${Math.min(.98,a)})`);
    g.addColorStop(.26,`rgba(255,252,236,${Math.min(.86,a*.82)})`);
    g.addColorStop(.58,`rgba(244,248,255,${Math.min(.28,a*.36)})`);
    g.addColorStop(1,'rgba(255,255,255,0)');
    ctx.fillStyle=g;
    ctx.fillRect(z.x-rx*.2,z.y-ry*.2,z.w+rx*.4,z.h+ry*.4);
    ctx.restore();

    // 4) Halo externe : court, mais bien visible au pic en mode off->on.
    const glowScale = mode==='off_to_on' ? (1.24 + .16*flash) : 1.10;
    const glowRx=rx*glowScale, glowRy=ry*glowScale;
    ctx.save();
    ctx.globalCompositeOperation='screen';
    ctx.globalAlpha=(mode==='off_to_on'?0.22:0.08)*flash;
    const eg=ctx.createRadialGradient(cx,cy,Math.min(rx,ry)*.52,cx,cy,Math.max(glowRx,glowRy));
    eg.addColorStop(0,'rgba(255,248,228,.72)');
    eg.addColorStop(.60,'rgba(248,250,255,.12)');
    eg.addColorStop(1,'rgba(255,255,255,0)');
    ctx.fillStyle=eg;
    ctx.fillRect(cx-glowRx,cy-glowRy,glowRx*2,glowRy*2);
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
    if(action==='headlight') return drawHeadlight(ctx,layer,phase,intensity,W,H,s.actionZone,s.headlightMode||'off_to_on');
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
  console.log('[HAPPYHOLO] action-preview-engine V3.3.0 OFFLINE actif · appel de phare visible');
})();

