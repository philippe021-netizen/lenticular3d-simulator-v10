/* HappyHolo V3.8.0 — moteur d'actions OFFLINE
   Actions locales, dont ExplodeView progressif pour les grandes pièces mécaniques.
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

  function buildYawFrame({layer,phase=.5,intensity=.5,W,H}){
    const c=document.createElement('canvas');c.width=W;c.height=H;
    const x=c.getContext('2d');
    const signed=clamp((Number(phase)||0)*2-1,-1,1);
    const k=clamp(Number(intensity)||.5,.1,1);
    const turn=signed*k;
    const squeeze=1-Math.abs(turn)*.035;
    const bulge=W*.032*turn;
    const strips=112;

    // Cylindrage léger : le centre se déplace davantage que les bords,
    // tandis qu'un côté se resserre. Le chevauchement de 1 px évite les fentes.
    for(let i=0;i<strips;i++){
      const sx=i*W/strips,ex=(i+1)*W/strips,sw=Math.max(1,ex-sx);
      const nx=((sx+sw*.5)/W-.5)*2;
      const curve=Math.max(0,1-nx*nx);
      const dx=bulge*curve;
      const perspective=1-turn*nx*.055;
      const tx=W*.5+(sx-W*.5)*squeeze+dx;
      const tw=Math.max(1,sw*squeeze*perspective+1.15);
      x.drawImage(layer,sx,0,sw,H,tx,0,tw,H);
    }
    return c;
  }

  function drawYaw3D(ctx,layer,phase,intensity,W,H){
    ctx.drawImage(buildYawFrame({layer,phase,intensity,W,H}),0,0);
  }

  function paintZoneMask(zone,W,H){
    if(!zone) return null;
    const sourceW=Math.max(1,Number(zone.sourceW)||W), sourceH=Math.max(1,Number(zone.sourceH)||H);
    const sc=Math.max(W/sourceW,H/sourceH), fw=sourceW*sc,fh=sourceH*sc,fx=(W-fw)/2,fy=(H-fh)/2;
    const c=document.createElement('canvas');c.width=W;c.height=H;const x=c.getContext('2d');x.lineCap='round';x.lineJoin='round';
    if(zone.kind==='outline'&&Array.isArray(zone.contours)){
      const map=p=>[fx+Number(p[0])*fw,fy+Number(p[1])*fh];
      x.fillStyle='#fff';
      for(const contour of zone.contours){
        if(!Array.isArray(contour)||contour.length<3)continue;
        const p0=map(contour[0]);x.beginPath();x.moveTo(p0[0],p0[1]);
        for(let i=1;i<contour.length;i++){const p=map(contour[i]);x.lineTo(p[0],p[1]);}
        x.closePath();x.fill();
      }
      return c;
    }
    if(zone.kind!=='paint'||!Array.isArray(zone.strokes)) return null;
    for(const st of zone.strokes){
      const pts=Array.isArray(st.points)?st.points:[];if(!pts.length)continue;
      x.save();x.globalCompositeOperation=st.erase?'destination-out':'source-over';x.strokeStyle='#fff';x.fillStyle='#fff';
      const brushSource=(Number(st.size)||.02)*Math.max(sourceW,sourceH);x.lineWidth=Math.max(2,brushSource*sc);
      const map=p=>[fx+p[0]*fw,fy+p[1]*fh];const p0=map(pts[0]);x.beginPath();x.moveTo(p0[0],p0[1]);
      if(pts.length===1){x.arc(p0[0],p0[1],x.lineWidth/2,0,Math.PI*2);x.fill();}
      else{for(let i=1;i<pts.length;i++){const q=map(pts[i]);x.lineTo(q[0],q[1]);}x.stroke();}
      x.restore();
    }
    return c;
  }

  function applyMaskedOverlay(ctx,mask,drawFn,alpha=1,composite='source-over'){
    const W=mask.width,H=mask.height,tmp=document.createElement('canvas');tmp.width=W;tmp.height=H;const t=tmp.getContext('2d');
    drawFn(t);t.globalCompositeOperation='destination-in';t.drawImage(mask,0,0);t.globalCompositeOperation='source-over';
    ctx.save();ctx.globalAlpha=alpha;ctx.globalCompositeOperation=composite;ctx.drawImage(tmp,0,0);ctx.restore();
  }

  function alphaBounds(canvas){
    const W=canvas.width,H=canvas.height,data=canvas.getContext('2d').getImageData(0,0,W,H).data;
    let minX=W,minY=H,maxX=-1,maxY=-1;
    for(let y=0;y<H;y++) for(let x=0;x<W;x++){
      if(data[(y*W+x)*4+3]<12) continue;
      if(x<minX)minX=x;if(x>maxX)maxX=x;if(y<minY)minY=y;if(y>maxY)maxY=y;
    }
    return maxX<minX?null:{x:minX,y:minY,w:maxX-minX+1,h:maxY-minY+1,cx:(minX+maxX)/2,cy:(minY+maxY)/2};
  }

  function smoothstep(v){const t=clamp(v,0,1);return t*t*(3-2*t);}

  function explodeVector(direction,bounds,index,count,W,H,groupCenter){
    const fixed={
      left:[-1,0],right:[1,0],up:[0,-1],down:[0,1],
      'up-left':[-.72,-.72],'up-right':[.72,-.72],
      'down-left':[-.72,.72],'down-right':[.72,.72],stay:[0,0]
    };
    if(fixed[direction])return fixed[direction];
    const gx=groupCenter?.x??W/2,gy=groupCenter?.y??H/2;
    let dx=(bounds?.cx??W/2)-gx,dy=(bounds?.cy??H/2)-gy;
    const length=Math.hypot(dx,dy);
    if(length>Math.min(W,H)*.055)return[dx/length,dy/length];
    const angle=(-Math.PI/2)+(Math.PI*2*Math.max(0,index))/(Math.max(1,count));
    return[Math.cos(angle),Math.sin(angle)];
  }

  function explodeProgress(phase,order,count){
    const p=clamp(Number(phase)||0,0,1);
    const rank=clamp((Number(order)||1)-1,0,Math.max(0,count-1));
    const start=count<=1?0:(rank/Math.max(1,count-1))*.60;
    return smoothstep((p-start)/Math.max(.001,1-start));
  }

  function buildExplodeFrame({layer,phase=0,intensity=.65,W,H,selection={},index=0,selections=[],layers=null,groupCenter=null}){
    const out=document.createElement('canvas');out.width=W;out.height=H;
    const x=out.getContext('2d');
    const explodeSelections=selections.filter(s=>s?.action==='explodeview');
    const count=Math.max(1,explodeSelections.length);
    const localIndex=Math.max(0,explodeSelections.indexOf(selection));
    const order=clamp(Number(selection.explodeOrder)||localIndex+1,1,count);
    const progress=explodeProgress(phase,order,count);
    const bounds=alphaBounds(layer);
    let center=groupCenter;
    if(!center&&layers){
      const boxes=explodeSelections.map(s=>{
        const i=selections.indexOf(s);return alphaBounds(layers.get(i));
      }).filter(Boolean);
      if(boxes.length)center={x:boxes.reduce((a,b)=>a+b.cx,0)/boxes.length,y:boxes.reduce((a,b)=>a+b.cy,0)/boxes.length};
    }
    const vector=explodeVector(selection.explodeDirection||'auto',bounds,localIndex,count,W,H,center);
    const mode=selection.explodeMode||window.HappyHoloExplodeViewState?.mode||'simple';
    const modeScale=mode==='technical'?1.16:mode==='detailed'?1.08:1;
    const k=clamp(Number(intensity)||.65,.1,1);
    const distance=Math.min(W,H)*(.07+.26*k)*modeScale*progress;
    const dx=vector[0]*distance,dy=vector[1]*distance;
    x.save();x.translate(dx,dy);
    if(progress>.02&&selection.explodeDirection!=='stay'){
      x.shadowColor=`rgba(0,0,0,${.10+.20*progress})`;
      x.shadowBlur=Math.max(2,Math.min(W,H)*.012*progress);
      x.shadowOffsetX=-vector[0]*Math.min(W,H)*.008*progress;
      x.shadowOffsetY=Math.min(W,H)*.010*progress;
    }
    x.drawImage(layer,0,0,W,H);x.restore();
    return out;
  }

  function drawHeadlightPaint(ctx,layer,phase,intensity,W,H,zone,mode='off_to_on'){
    const mask=paintZoneMask(zone,W,H);if(!mask)return;
    const p=clamp(phase,0,1),k=clamp(intensity,.1,1);
    const dimAlpha=mode==='off_to_on'?clamp((.90-.86*p)*(.70+.30*k),0,.94):clamp((.10-.08*p)*k,0,.12);
    if(dimAlpha>.001) applyMaskedOverlay(ctx,mask,t=>{t.fillStyle='#000';t.fillRect(0,0,W,H);},dimAlpha,'source-over');
    const flash=mode==='off_to_on'?Math.pow(p,1.05)*(.72+.28*k):Math.pow(p,1.25)*(.45+.25*k);
    if(flash<=.001)return;
    applyMaskedOverlay(ctx,mask,t=>{t.save();t.filter=`brightness(${1+5.2*flash}) contrast(${1+.18*flash}) saturate(${1-.12*flash})`;t.drawImage(layer,0,0,W,H);t.restore();},mode==='off_to_on'?.92*flash:.36*flash,'screen');
    applyMaskedOverlay(ctx,mask,t=>{t.fillStyle='rgba(255,252,238,1)';t.fillRect(0,0,W,H);},(mode==='off_to_on'?.72:.30)*flash,'screen');
    // halo doux dérivé du masque exact, sans éclairer tout le véhicule
    const glow=document.createElement('canvas');glow.width=W;glow.height=H;const g=glow.getContext('2d');g.save();g.filter=`blur(${Math.max(3,Math.round(Math.min(W,H)*.006))}px)`;g.drawImage(mask,0,0);g.restore();g.globalCompositeOperation='source-in';g.fillStyle='rgba(255,248,230,1)';g.fillRect(0,0,W,H);
    ctx.save();ctx.globalCompositeOperation='screen';ctx.globalAlpha=(mode==='off_to_on'?.16:.06)*flash;ctx.drawImage(glow,0,0);ctx.restore();
  }

  function drawHeadlight(ctx,layer,phase,intensity,W,H,zone,mode='off_to_on',alreadyDrawn=false){
    // V3.3.0 : par défaut, l'appel de phare doit être VISIBILE.
    // On part donc d'un phare quasi éteint puis on monte jusqu'au plein phare.
    // Tout reste ultra localisé à l'optique : pas d'éclaircissement du pilote ni de la carrosserie.
    if(!alreadyDrawn) ctx.drawImage(layer,0,0,W,H);
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

  function buildGlintOverlay({layer,phase=0,intensity=.5,W,H,zones=[]}){
    const out=document.createElement('canvas');out.width=W;out.height=H;
    const ox=out.getContext('2d');
    const p=clamp(Number(phase)||0,0,1),k=clamp(Number(intensity)||.5,.1,1);

    for(const zone of zones){
      const mask=paintZoneMask(zone,W,H),z=zonePx(zone,W,H);
      if(!mask||!z) continue;

      const band=document.createElement('canvas');band.width=W;band.height=H;
      const bx=band.getContext('2d');
      const cx=z.x+(-.28+1.56*p)*z.w,cy=z.y+z.h*.5;
      const bw=Math.max(5,z.w*(.12+.10*k));
      bx.save();bx.translate(cx,cy);bx.rotate(-24*Math.PI/180);
      const g=bx.createLinearGradient(-bw,0,bw,0);
      g.addColorStop(0,'rgba(255,255,255,0)');
      g.addColorStop(.34,'rgba(255,248,220,.18)');
      g.addColorStop(.50,'rgba(255,255,255,.98)');
      g.addColorStop(.66,'rgba(225,244,255,.24)');
      g.addColorStop(1,'rgba(255,255,255,0)');
      bx.fillStyle=g;bx.fillRect(-bw,-H,bw*2,H*2);bx.restore();
      bx.globalCompositeOperation='destination-in';bx.drawImage(mask,0,0);bx.globalCompositeOperation='source-over';

      if(layer){
        const detail=document.createElement('canvas');detail.width=W;detail.height=H;
        const dx=detail.getContext('2d');
        dx.filter=`brightness(${2.1+1.8*k}) contrast(${1+.22*k}) saturate(${1-.18*k})`;
        dx.drawImage(layer,0,0);dx.filter='none';
        dx.globalCompositeOperation='destination-in';dx.drawImage(band,0,0);dx.globalCompositeOperation='source-over';
        ox.save();ox.globalCompositeOperation='screen';ox.globalAlpha=.45+.35*k;ox.drawImage(detail,0,0);ox.restore();
      }

      ox.save();ox.globalCompositeOperation='screen';ox.globalAlpha=.48+.42*k;ox.drawImage(band,0,0);ox.restore();
    }
    return out;
  }

  function drawGlint(ctx,layer,phase,intensity,W,H,zones){
    ctx.drawImage(layer,0,0,W,H);
    if(!Array.isArray(zones)||!zones.length) return;
    const fx=buildGlintOverlay({layer,phase,intensity,W,H,zones});
    ctx.save();ctx.globalCompositeOperation='screen';ctx.drawImage(fx,0,0);ctx.restore();
  }


  function buildWinkPatch(layer,z,k,W,H){
    const patch=document.createElement('canvas');patch.width=W;patch.height=H;
    const x=patch.getContext('2d');
    const half=z.h*.5;
    const squeeze=.30*k;
    const topSourceH=Math.max(1,z.h*(.5-squeeze));
    const bottomSourceY=z.y+z.h*(.5+squeeze);
    const bottomSourceH=Math.max(1,z.y+z.h-bottomSourceY);

    // Au repos, les deux moitiés reproduisent exactement l’œil. Au pic,
    // elles étirent les paupières supérieure et inférieure vers le centre
    // et éliminent réellement l’iris de la zone affichée.
    x.drawImage(layer,z.x,z.y,z.w,topSourceH,z.x,z.y,z.w,half+.5);
    x.drawImage(layer,z.x,bottomSourceY,z.w,bottomSourceH,z.x,z.y+half-.5,z.w,half+.5);

    if(k>.28){
      x.globalAlpha=clamp((k-.28)/.72,0,1)*.58;
      x.fillStyle='rgba(42,28,25,.88)';
      x.fillRect(z.x+z.w*.08,z.y+half-Math.max(1,z.h*.018),z.w*.84,Math.max(2,z.h*.036));
      x.globalAlpha=1;
    }
    return patch;
  }

  // Le patch fermé remplace la zone d’origine dans la couche du sujet.
  // L’ancien moteur le superposait seulement : l’œil ouvert restait visible.
  function drawWink(ctx,layer,phase,intensity,W,H,zone){
    const z=zonePx(zone,W,H); if(!z){ctx.drawImage(layer,0,0,W,H);return;}
    const k=clamp(phase*(.35+.65*intensity),0,1);
    const out=document.createElement('canvas');out.width=W;out.height=H;
    const x=out.getContext('2d');x.drawImage(layer,0,0,W,H);
    x.clearRect(z.x,z.y,z.w,z.h);
    x.drawImage(buildWinkPatch(layer,z,k,W,H),0,0);
    ctx.drawImage(out,0,0);
  }

  function drawWinkPaint(ctx,layer,phase,intensity,W,H,zone){
    const mask=paintZoneMask(zone,W,H),z=zonePx(zone,W,H);
    if(!mask||!z){ctx.drawImage(layer,0,0,W,H);return;}
    const k=clamp(phase*(.35+.65*intensity),0,1);
    const patch=buildWinkPatch(layer,z,k,W,H);
    const px=patch.getContext('2d');
    px.globalCompositeOperation='destination-in';px.drawImage(mask,0,0);px.globalCompositeOperation='source-over';

    const out=document.createElement('canvas');out.width=W;out.height=H;
    const x=out.getContext('2d');x.drawImage(layer,0,0,W,H);
    x.globalCompositeOperation='destination-out';x.drawImage(mask,0,0);
    x.globalCompositeOperation='source-over';x.drawImage(patch,0,0);
    ctx.drawImage(out,0,0);
  }

  function renderAction(ctx,layer,s,phase,W,H,meta={}){
    const intensity=clamp(Number(s.intensity||50)/100,.1,1);
    const action=s.action||'none';
    if(action==='pivot') return drawRotate(ctx,layer,phase,intensity,W,H);
    if(action==='yaw3d') return drawYaw3D(ctx,layer,phase,intensity,W,H);
    if(action==='explodeview'){
      const frame=buildExplodeFrame({layer,phase,intensity,W,H,selection:s,index:meta.index||0,selections:meta.selections||[],layers:meta.layers||null,groupCenter:meta.groupCenter||null});
      return ctx.drawImage(frame,0,0,W,H);
    }
    if(action==='headlight'){
      const zones=Array.isArray(s.actionZones)&&s.actionZones.length?s.actionZones:(s.actionZone?[s.actionZone]:[]);
      ctx.drawImage(layer,0,0,W,H);
      if(!zones.length) return;
      for(const z of zones){if(z?.kind==='paint') drawHeadlightPaint(ctx,layer,phase,intensity,W,H,z,s.headlightMode||'off_to_on');else drawHeadlight(ctx,layer,phase,intensity,W,H,z,s.headlightMode||'off_to_on',true);}
      return;
    }
    if(action==='glint'){
      const zones=Array.isArray(s.actionZones)?s.actionZones:[];
      return drawGlint(ctx,layer,phase,intensity,W,H,zones);
    }
    if(action==='person_wink') return s.actionZone?.kind==='paint'?drawWinkPaint(ctx,layer,phase,intensity,W,H,s.actionZone):drawWink(ctx,layer,phase,intensity,W,H,s.actionZone);
    ctx.drawImage(layer,0,0,W,H);
  }

  function generateActionFrames({base, layers, selections, activeIndices, W, H, phases=PHASES, phaseForSelection=null}){
    const out=[];
    for(const phase of phases){
      const c=document.createElement('canvas'); c.width=W;c.height=H;
      const x=c.getContext('2d'); x.drawImage(base,0,0,W,H);
      selections.forEach((s,i)=>{
        const layer=layers.get(i); if(!layer) return;
        const localPhase=typeof phaseForSelection==='function'?phaseForSelection(s,phase,i):phase;
        if(activeIndices.includes(i) && (s.action||'none')!=='none') renderAction(x,layer,s,localPhase,W,H,{index:i,selections,layers});
        else x.drawImage(layer,0,0,W,H);
      });
      out.push(c);
    }
    return out;
  }

  window.HappyHoloActionPreviewEngine={PHASES,generateActionFrames,renderAction,fitCover,buildGlintOverlay,buildYawFrame,buildExplodeFrame,explodeProgress,alphaBounds};
  console.log('[HAPPYHOLO] action-preview-engine V3.8.0 OFFLINE · ExplodeView machines actif');
})();
