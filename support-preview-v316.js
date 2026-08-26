/* HappyHolo V3.4.1 — simulation lenticulaire multi-couches + phares intégrés aux couches 3D */
(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const file = $('#file');
  if (!file) return;

  let uploadedImage=null, objectUrl=null, raf=0, running=false, start=0, lastFrame=0;
  let reliefLayers=null, buildToken=0;
  const state={support:'keychain-vertical',fit:'preserve',margin:14,zoom:100,x:0,y:0,rot:6,speed:5};

  const host=document.createElement('section');
  host.className='support-card';
  host.innerHTML=`
    <div class="support-head"><div><h2>Rendu support</h2><p>Simulation lenticulaire — couches de profondeur + actions locales.</p></div><span class="support-badge">Aperçu 3D</span></div>
    <div class="support-grid">
      <div class="support-controls">
        <label>Support</label><select id="supportType"><option value="keychain-vertical">Porte-clé rectangle vertical</option><option value="keychain-horizontal">Porte-clé rectangle horizontal</option><option value="medallion-round">Médaillon rond Ø30 mm</option></select>
        <label>Cadrage</label><select id="supportFit"><option value="preserve">Préserver le sujet — recommandé</option><option value="contain">Adapter — image entière</option><option value="cover">Remplir — plein cadre</option></select>
        <label><span>Marge autour du sujet</span><b id="marginOut">14%</b></label><input id="supportMargin" type="range" min="0" max="30" value="14">
        <label><span>Zoom</span><b id="zoomOut">100%</b></label><input id="supportZoom" type="range" min="60" max="180" value="100">
        <label><span>Position horizontale</span><b id="xOut">0%</b></label><input id="supportX" type="range" min="-50" max="50" value="0">
        <label><span>Position verticale</span><b id="yOut">0%</b></label><input id="supportY" type="range" min="-50" max="50" value="0">
        <label><span>Rotation lenticulaire</span><b id="rotOut">±6°</b></label><input id="supportRot" type="range" min="0" max="8" value="6" step="1">
        <label><span>Vitesse</span><b id="speedOut">5.0 s</b></label><input id="supportSpeed" type="range" min="2" max="8" value="5" step="0.5">
        <div><button id="supportPlay">Lancer l’aperçu</button><button id="supportStop" class="secondary">Stop</button></div>
      </div>
      <div class="support-stage-wrap"><div class="support-stage"><div id="productObject" class="product-object keychain-vertical"><div class="ring"></div><div class="link"></div><div class="shell"><div class="image-window"><canvas id="supportCanvas"></canvas></div></div></div><div id="supportEmpty" class="support-empty">Charge une photo pour afficher le support.</div></div><div id="supportRecommendation" class="support-note">Portrait → porte-clé vertical recommandé.</div><div id="supportHint" class="support-note">Après « Créer le relief 3D local », l’aperçu utilise plusieurs plans de profondeur. Les actions validées sont jouées dans ce même aperçu.</div></div>
    </div>`;
  document.querySelector('.card.grid')?.insertAdjacentElement('afterend',host);

  const type=$('#supportType'),fit=$('#supportFit'),margin=$('#supportMargin'),zoom=$('#supportZoom'),xp=$('#supportX'),yp=$('#supportY'),rot=$('#supportRot'),speed=$('#supportSpeed');
  const product=$('#productObject'),canvas=$('#supportCanvas'),empty=$('#supportEmpty'),ctx=canvas.getContext('2d');

  function updateText(){ $('#marginOut').textContent=`${state.margin}%`;$('#zoomOut').textContent=`${state.zoom}%`;$('#xOut').textContent=`${state.x}%`;$('#yOut').textContent=`${state.y}%`;$('#rotOut').textContent=`±${state.rot}°`;$('#speedOut').textContent=`${state.speed.toFixed(1)} s`; }
  function fitBox(sw,sh,dw,dh){ let k=(state.fit==='cover')?Math.max(dw/sw,dh/sh):Math.min(dw/sw,dh/sh); k*=state.zoom/100; if(state.fit==='preserve')k*=Math.max(.55,1-state.margin/100); const w=sw*k,h=sh*k; return {x:(dw-w)/2+(state.x/100)*dw*.5,y:(dh-h)/2+(state.y/100)*dh*.5,w,h}; }
  function ensureCanvas(){ const r=canvas.getBoundingClientRect(),d=Math.min(devicePixelRatio||1,2); const w=Math.max(2,Math.round(r.width*d)),h=Math.max(2,Math.round(r.height*d)); if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;} }
  function coverRect(sw,sh,dw,dh){const k=Math.max(dw/sw,dh/sh);const w=sw*k,h=sh*k;return{x:(dw-w)/2,y:(dh-h)/2,w,h};}

  function makeDepthLayers(img,depth,SW,SH,count,soft){
    const base=document.createElement('canvas');base.width=SW;base.height=SH;const bx=base.getContext('2d');const fr=coverRect(img.naturalWidth,img.naturalHeight,SW,SH);bx.drawImage(img,fr.x,fr.y,fr.w,fr.h);
    const dep=document.createElement('canvas');dep.width=SW;dep.height=SH;const dx=dep.getContext('2d');const dr=coverRect(depth.width,depth.height,SW,SH);dx.drawImage(depth,dr.x,dr.y,dr.w,dr.h);
    const bd=bx.getImageData(0,0,SW,SH),dd=dx.getImageData(0,0,SW,SH).data;
    const out=[];
    for(let n=0;n<count;n++){
      const center=count===1?.5:n/(count-1), layer=document.createElement('canvas');layer.width=SW;layer.height=SH;const lx=layer.getContext('2d');const id=lx.createImageData(SW,SH),od=id.data;
      for(let i=0;i<SW*SH;i++){
        const d=dd[i*4]/255, dist=Math.abs(d-center), weight=Math.max(0,1-dist/soft); if(weight<=0)continue;
        const a=bd.data[i*4+3]*weight; if(a<1)continue;
        od[i*4]=bd.data[i*4];od[i*4+1]=bd.data[i*4+1];od[i*4+2]=bd.data[i*4+2];od[i*4+3]=a;
      }
      lx.putImageData(id,0,0);out.push({canvas:layer,depth:center});
    }
    return out;
  }

  async function rebuildReliefLayers(){
    const token=++buildToken, rs=window.HappyHoloReliefState;
    if(!rs?.subjectImg||!rs?.backgroundImg||!rs?.subjectDepthCanvas||!rs?.backgroundDepthCanvas){reliefLayers=null;draw(0,0);return;}
    $('#supportHint').textContent='Préparation des couches de profondeur…';
    await new Promise(r=>setTimeout(r,30));
    if(token!==buildToken)return;
    const SW=420, SH=Math.max(280,Math.round(SW*(rs.view.height/rs.view.width)));
    const bg=makeDepthLayers(rs.backgroundImg,rs.backgroundDepthCanvas,SW,SH,4,.42);
    const sub=makeDepthLayers(rs.subjectImg,rs.subjectDepthCanvas,SW,SH,6,.30);
    if(token!==buildToken)return;
    reliefLayers={w:SW,h:SH,bg,sub};
    headlightCache=null;
    $('#supportHint').textContent='Aperçu 3D prêt — profondeur + actions validées.';
    play();
  }

  function drawPaintMask(zone,W,H){
    const c=document.createElement('canvas');c.width=W;c.height=H;const x=c.getContext('2d');
    x.lineCap='round';x.lineJoin='round';
    for(const st of (zone?.strokes||[])){
      if(!st?.points?.length)continue;
      x.save();x.globalCompositeOperation=st.erase?'destination-out':'source-over';
      x.strokeStyle='#fff';x.fillStyle='#fff';x.lineWidth=Math.max(2,(Number(st.size)||.02)*Math.max(W,H));
      const p0=st.points[0];x.beginPath();x.moveTo(p0[0]*W,p0[1]*H);
      if(st.points.length===1){x.arc(p0[0]*W,p0[1]*H,x.lineWidth/2,0,Math.PI*2);x.fill();}
      else{for(let i=1;i<st.points.length;i++){const p=st.points[i];x.lineTo(p[0]*W,p[1]*H);}x.stroke();}
      x.restore();
    }
    return c;
  }

  function activeHeadlightSelection(){
    const p=window.happyHoloSelectionPlan||[];
    return p.find(s=>s?.action==='headlight' && Array.isArray(s.actionZones) && s.actionZones.length);
  }

  // V3.4.1 — PHARES INTÉGRÉS AUX COUCHES 3D
  // Le masque lumineux est découpé avec les mêmes couches de profondeur que le véhicule.
  // Chaque morceau de phare reçoit donc EXACTEMENT le déplacement de sa couche.
  let headlightCache=null;

  function headlightSignature(s){
    if(!s || !Array.isArray(s.actionZones)) return '';
    return [
      s.actionZones,
      Number(s.intensity||50),
      s.headlightMode||'off_to_on',
      reliefLayers?.w||0,
      reliefLayers?.h||0,
      reliefLayers?.sub||null
    ];
  }

  function buildHeadlightLayerCache(){
    const s=activeHeadlightSelection();
    if(!s || !reliefLayers?.sub?.length) return null;
    const zones=s.actionZones.filter(z=>z?.kind==='paint'&&Array.isArray(z.strokes));
    if(!zones.length) return null;

    const W=reliefLayers.w,H=reliefLayers.h;
    const baseMask=document.createElement('canvas');baseMask.width=W;baseMask.height=H;
    const bx=baseMask.getContext('2d');

    for(const z of zones){
      const zm=drawPaintMask(z,W,H);
      bx.drawImage(zm,0,0,W,H);
    }

    const layers=reliefLayers.sub.map(l=>{
      // Masque du phare limité à l'alpha de CETTE couche de profondeur.
      const clip=document.createElement('canvas');clip.width=W;clip.height=H;
      const cx=clip.getContext('2d');
      cx.drawImage(baseMask,0,0);
      cx.globalCompositeOperation='destination-in';
      cx.drawImage(l.canvas,0,0);
      cx.globalCompositeOperation='source-over';

      const dark=document.createElement('canvas');dark.width=W;dark.height=H;
      const dx=dark.getContext('2d');
      dx.fillStyle='#000';dx.fillRect(0,0,W,H);
      dx.globalCompositeOperation='destination-in';dx.drawImage(clip,0,0);
      dx.globalCompositeOperation='source-over';

      const light=document.createElement('canvas');light.width=W;light.height=H;
      const lx=light.getContext('2d');
      lx.fillStyle='rgba(255,248,225,1)';lx.fillRect(0,0,W,H);
      lx.globalCompositeOperation='destination-in';lx.drawImage(clip,0,0);
      lx.globalCompositeOperation='source-over';

      return {dark,light};
    });

    return {
      zonesRef:s.actionZones,
      subRef:reliefLayers.sub,
      intensity:Number(s.intensity||50),
      mode:s.headlightMode||'off_to_on',
      layers
    };
  }

  function getHeadlightLayerCache(){
    const s=activeHeadlightSelection();
    if(!s || !reliefLayers?.sub?.length) return null;
    const invalid=!headlightCache ||
      headlightCache.zonesRef!==s.actionZones ||
      headlightCache.subRef!==reliefLayers.sub ||
      headlightCache.intensity!==Number(s.intensity||50) ||
      headlightCache.mode!==(s.headlightMode||'off_to_on');
    if(invalid) headlightCache=buildHeadlightLayerCache();
    return headlightCache;
  }

  function drawHeadlightEffectForLayer(index,r,shift,pulse){
    const s=activeHeadlightSelection();
    const cache=getHeadlightLayerCache();
    const layerFx=cache?.layers?.[index];
    if(!s || !layerFx) return;

    const intensity=Math.max(.1,Math.min(1,Number(s.intensity||50)/100));
    const mode=s.headlightMode||'off_to_on';

    // Le noir et la lumière utilisent exactement le même r.x+shift que la couche véhicule.
    if(mode==='off_to_on'){
      ctx.save();
      ctx.globalAlpha=(1-pulse)*.58*intensity;
      ctx.drawImage(layerFx.dark,r.x+shift,r.y,r.w,r.h);
      ctx.restore();
    }

    ctx.save();
    ctx.globalCompositeOperation='screen';
    ctx.globalAlpha=(.18+.82*pulse)*intensity;
    ctx.drawImage(layerFx.light,r.x+shift,r.y,r.w,r.h);
    ctx.restore();

    if(pulse>.55){
      // Halo très court, lui aussi centré sur la couche déplacée.
      const halo=(pulse-.55)*.40*intensity;
      ctx.save();
      ctx.globalCompositeOperation='screen';
      ctx.globalAlpha=halo;
      ctx.drawImage(layerFx.light,r.x+shift-1.5,r.y-1.5,r.w+3,r.h+3);
      ctx.restore();
    }
  }

  // Pour une image plate (avant relief), on garde un effet local sans déplacement.
  function applyHeadlightsFlat(r,pulse){
    const s=activeHeadlightSelection();if(!s)return;
    const zones=s.actionZones.filter(z=>z?.kind==='paint'&&Array.isArray(z.strokes));
    if(!zones.length)return;
    const intensity=Math.max(.1,Math.min(1,Number(s.intensity||50)/100));
    const mask=document.createElement('canvas');mask.width=canvas.width;mask.height=canvas.height;const mx=mask.getContext('2d');
    for(const z of zones){
      const zm=drawPaintMask(z,Math.max(2,Math.round(r.w)),Math.max(2,Math.round(r.h)));
      mx.drawImage(zm,r.x,r.y,r.w,r.h);
    }
    if((s.headlightMode||'off_to_on')==='off_to_on'){
      const dark=document.createElement('canvas');dark.width=canvas.width;dark.height=canvas.height;const dx=dark.getContext('2d');
      dx.fillStyle='#000';dx.fillRect(0,0,dark.width,dark.height);dx.globalCompositeOperation='destination-in';dx.drawImage(mask,0,0);
      ctx.save();ctx.globalAlpha=(1-pulse)*.58*intensity;ctx.drawImage(dark,0,0);ctx.restore();
    }
    const light=document.createElement('canvas');light.width=canvas.width;light.height=canvas.height;const lx=light.getContext('2d');
    lx.fillStyle='rgba(255,248,225,1)';lx.fillRect(0,0,light.width,light.height);lx.globalCompositeOperation='destination-in';lx.drawImage(mask,0,0);
    ctx.save();ctx.globalCompositeOperation='screen';ctx.globalAlpha=(.18+.82*pulse)*intensity;ctx.drawImage(light,0,0);ctx.restore();
  }

  function drawTextLayer(norm,r){
    window.HappyHoloTextLayer?.draw?.(ctx,norm,r);
  }

  function drawFallback(actionPulse=0,norm=0){
    ensureCanvas();ctx.clearRect(0,0,canvas.width,canvas.height);
    if(!uploadedImage)return;
    const r=fitBox(uploadedImage.naturalWidth,uploadedImage.naturalHeight,canvas.width,canvas.height);
    ctx.drawImage(uploadedImage,r.x,r.y,r.w,r.h);
    applyHeadlightsFlat(r,actionPulse);
    drawTextLayer(norm,r);
  }

  function draw(norm,actionPulse=0){
    ensureCanvas();ctx.clearRect(0,0,canvas.width,canvas.height);
    if(!reliefLayers){drawFallback(actionPulse,norm);return;}
    const r=fitBox(reliefLayers.w,reliefLayers.h,canvas.width,canvas.height);

    ctx.save();ctx.beginPath();ctx.rect(0,0,canvas.width,canvas.height);ctx.clip();

    for(const l of reliefLayers.bg){
      const z=(l.depth-.5)*2;
      const shift=norm*(4+5*z)*(canvas.width/320);
      ctx.drawImage(l.canvas,r.x+shift,r.y,r.w,r.h);
    }

    const textDepth=Number(window.happyHoloTextLayer?.depth)||0;
    if(textDepth<0) drawTextLayer(norm,r);

    reliefLayers.sub.forEach((l,i)=>{
      const z=(l.depth-.5)*2;
      const shift=norm*(12+13*z)*(canvas.width/320);
      ctx.drawImage(l.canvas,r.x+shift,r.y,r.w,r.h);

      // Important : le phare est rendu dans la même couche et avec le même shift.
      drawHeadlightEffectForLayer(i,r,shift,actionPulse);
    });

    if(textDepth>=0) drawTextLayer(norm,r);

    ctx.restore();
  }

  function headlightPulse(ts){
    const s=activeHeadlightSelection();if(!s)return 0;
    const ms=Math.max(800,Number(s.actionSpeed||2000));
    const t=((ts-start)%ms)/ms;
    // Une impulsion visible par cycle : repos -> pic -> repos.
    return (1-Math.cos(t*Math.PI*2))/2;
  }

  function tick(ts){
    if(!running)return;if(!start)start=ts;
    if(ts-lastFrame<38){raf=requestAnimationFrame(tick);return;}
    lastFrame=ts;
    const phase=Math.sin((ts-start)/(state.speed*1000)*Math.PI*2);
    draw(phase,headlightPulse(ts));
    raf=requestAnimationFrame(tick);
  }
  function play(){if(!uploadedImage&&!reliefLayers)return;running=true;start=0;lastFrame=0;product.style.setProperty('--support-neg',`${-state.rot}deg`);product.style.setProperty('--support-pos',`${state.rot}deg`);product.style.setProperty('--support-speed',`${state.speed}s`);product.classList.add('support-playing');cancelAnimationFrame(raf);raf=requestAnimationFrame(tick);}
  function stop(){running=false;cancelAnimationFrame(raf);product.classList.remove('support-playing');product.style.transform='perspective(620px) rotateY(0deg) translateX(0)';draw(0,0);}
  function apply(){const wasRunning=running;product.className=`product-object ${state.support}${wasRunning?' support-playing':''}`;product.style.setProperty('--support-neg',`${-state.rot}deg`);product.style.setProperty('--support-pos',`${state.rot}deg`);product.style.setProperty('--support-speed',`${state.speed}s`);updateText();draw(0,0);if(running){start=0;}}

  [type,fit,margin,zoom,xp,yp,rot,speed].forEach(el=>el.addEventListener('input',()=>{state.support=type.value;state.fit=fit.value;state.margin=+margin.value;state.zoom=+zoom.value;state.x=+xp.value;state.y=+yp.value;state.rot=+rot.value;state.speed=+speed.value;apply();}));
  $('#supportPlay').addEventListener('click',play);$('#supportStop').addEventListener('click',stop);

  file.addEventListener('change',()=>{const f=file.files?.[0];if(!f)return;if(objectUrl)URL.revokeObjectURL(objectUrl);objectUrl=URL.createObjectURL(f);const im=new Image();im.onload=()=>{uploadedImage=im;reliefLayers=null;empty.style.display='none';const rr=im.naturalWidth/im.naturalHeight;if(rr>1.12){type.value='keychain-horizontal';state.support=type.value;$('#supportRecommendation').textContent='Paysage → porte-clé horizontal recommandé.';}else{type.value='keychain-vertical';state.support=type.value;$('#supportRecommendation').textContent='Portrait → porte-clé vertical recommandé.';}apply();};im.src=objectUrl;});
  window.addEventListener('happyholo-relief-ready',rebuildReliefLayers);
  window.addEventListener('happyholo-action-plan-changed',()=>{headlightCache=null;draw(0,0);});
  window.addEventListener('happyholo-text-layer-changed',()=>draw(0,0));
  window.addEventListener('resize',()=>draw(0,0));
  apply();
  console.log('[HAPPYHOLO] support-preview V3.4.1 · phares intégrés aux couches 3D');
})();
