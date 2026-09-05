/* HappyHolo V3.7.3 — verso non inversé + réglages dédiés */
(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const file = $('#file');
  if (!file) return;

  let uploadedImage=null, objectUrl=null, backImage=null, backObjectUrl=null, raf=0, running=false, start=0, lastFrame=0;
  let flipRAF=0, flipAngle=0, flipping=false;
  let reliefLayers=null, buildToken=0;
  const state={support:'keychain-vertical',fit:'contain',margin:0,zoom:100,x:0,y:0,rot:6,speed:5,showSafe:1,safe:6,face:'front',backZoom:100,backX:0,backY:0};

  const host=document.createElement('section');
  host.className='support-card';
  host.innerHTML=`
    <div class="support-head"><div><h2>Rendu support</h2><p>Simulation lenticulaire — couches de profondeur + actions locales.</p></div><span class="support-badge">Aperçu 3D</span></div>
    <div class="support-grid">
      <div class="support-controls">
        <label>Support</label><select id="supportType"><option value="keychain-vertical">Porte-clé rectangle vertical</option><option value="keychain-horizontal">Porte-clé rectangle horizontal</option><option value="medallion-round-25">Médaillon rond Ø25 mm</option><option value="medallion-round">Médaillon rond Ø30 mm</option><option value="business-card">Carte de visite 85,60 × 53,98 mm</option><option value="business-card-88">Carte 88 × 56 mm</option></select>
        <label>Cadrage</label><select id="supportFit"><option value="preserve">Préserver le sujet</option><option value="contain" selected>Placement maître — recommandé</option><option value="cover">Remplir — plein cadre</option></select>
        <label><span>Marge autour du sujet</span><b id="marginOut">0%</b></label><input id="supportMargin" type="range" min="0" max="30" value="0">
        <label><span>Zoom</span><b id="zoomOut">100%</b></label><input id="supportZoom" type="range" min="60" max="180" value="100">
        <label><span>Position horizontale</span><b id="xOut">0%</b></label><input id="supportX" type="range" min="-50" max="50" value="0">
        <label><span>Position verticale</span><b id="yOut">0%</b></label><input id="supportY" type="range" min="-50" max="50" value="0">
        <label><span>Rotation lenticulaire</span><b id="rotOut">±6°</b></label><input id="supportRot" type="range" min="0" max="8" value="6" step="1">
        <label><span>Vitesse</span><b id="speedOut">5.0 s</b></label><input id="supportSpeed" type="range" min="2" max="8" value="5" step="0.5">
        <label style="display:flex;align-items:center;gap:8px"><input id="supportShowSafe" type="checkbox" checked> Afficher la zone de sécurité carte</label>
        <label><span>Marge de sécurité</span><b id="safeOut">6%</b></label><input id="supportSafe" type="range" min="2" max="12" value="6" step="1">
        <div style="border:1px solid #c8c8c8;border-radius:14px;padding:12px;margin-top:8px;background:#fafafa">
          <div style="font-weight:850;font-size:15px;margin-bottom:8px">Verso du support</div>
          <label>Image du verso</label><input id="supportBackFile" type="file" accept="image/*" style="width:100%">
          <div id="supportBackStatus" style="font-size:11px;color:#666;margin:6px 0 10px">Aucune image verso chargée</div>
          <label><span>Zoom verso</span><b id="backZoomOut">100%</b></label><input id="supportBackZoom" type="range" min="60" max="180" value="100">
          <label><span>Verso horizontal</span><b id="backXOut">0%</b></label><input id="supportBackX" type="range" min="-50" max="50" value="0">
          <label><span>Verso vertical</span><b id="backYOut">0%</b></label><input id="supportBackY" type="range" min="-50" max="50" value="0">
          <button id="supportBackReset" type="button" class="secondary" style="width:100%;margin-top:8px">Réinitialiser le verso</button>
        </div>
        <div><button id="supportPlay">Lancer l’aperçu</button><button id="supportStop" class="secondary">Stop</button></div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-top:8px">
          <button id="supportFrontBtn" class="secondary" type="button">Recto</button>
          <button id="supportBackBtn" class="secondary" type="button">Verso</button>
          <button id="supportDemo360Btn" class="secondary" type="button">Démo 360</button>
        </div>
      </div>
      <div class="support-stage-wrap"><div class="support-stage"><div id="productObject" class="product-object keychain-vertical"><div class="ring"></div><div class="link"></div><div class="shell"><div class="image-window"><canvas id="supportCanvas"></canvas></div></div></div><div id="supportEmpty" class="support-empty">Charge une photo pour afficher le support.</div></div><div id="supportRecommendation" class="support-note">Portrait → porte-clé vertical recommandé.</div><div id="supportHint" class="support-note">Après « Créer le relief 3D local », l’aperçu utilise plusieurs plans de profondeur. Les actions validées sont jouées dans ce même aperçu.</div></div>
    </div>`;
  document.querySelector('.card.grid')?.insertAdjacentElement('afterend',host);

  const type=$('#supportType'),fit=$('#supportFit'),margin=$('#supportMargin'),zoom=$('#supportZoom'),xp=$('#supportX'),yp=$('#supportY'),rot=$('#supportRot'),speed=$('#supportSpeed'),showSafe=$('#supportShowSafe'),safe=$('#supportSafe'),backFile=$('#supportBackFile'),backZoom=$('#supportBackZoom'),backX=$('#supportBackX'),backY=$('#supportBackY'),backReset=$('#supportBackReset'),backStatus=$('#supportBackStatus');
  const product=$('#productObject'),canvas=$('#supportCanvas'),empty=$('#supportEmpty'),ctx=canvas.getContext('2d');

  const frontBtn=$('#supportFrontBtn'), backBtn=$('#supportBackBtn'), demo360Btn=$('#supportDemo360Btn');

  function faceAngleNorm(){
    const a=((flipAngle%360)+360)%360;
    return a<=180 ? a/180 : (360-a)/180;
  }
  function currentRenderedFace(){
    const a=((flipAngle%360)+360)%360;
    return (a>=90 && a<270) ? 'back' : 'front';
  }
  function updateFaceButtons(){
    const f=state.face||'front';
    if(frontBtn) frontBtn.style.fontWeight = f==='front' ? '800' : '600';
    if(backBtn) backBtn.style.fontWeight = f==='back' ? '800' : '600';
  }
  function setProductTilt(deg){
    product.style.transform=`perspective(620px) rotateY(${deg}deg)`;
  }

  const shell=product.querySelector('.shell');
  const ring=product.querySelector('.ring');
  const link=product.querySelector('.link');

  function applySupportShape(){
    if(!shell)return;
    shell.style.width='';
    shell.style.height='';
    shell.style.borderRadius='';
    if(ring)ring.style.display='';
    if(link)link.style.display='';

    if(state.support==='medallion-round-25'){
      shell.style.width='205px';
      shell.style.height='205px';
      shell.style.borderRadius='50%';
      $('#supportRecommendation').textContent='Médaillon rond Ø25 mm — découpe finale exacte à 25 mm.';
    }else if(state.support==='medallion-round'){
      $('#supportRecommendation').textContent='Médaillon rond Ø30 mm — découpe finale exacte à 30 mm.';
    }else if(state.support==='business-card'){
      // Ratio ISO 85,60 / 53,98 = 1,5858
      shell.style.width='300px';
      shell.style.height='189px';
      shell.style.borderRadius='14px';
      if(ring)ring.style.display='none';
      if(link)link.style.display='none';
      $('#supportRecommendation').textContent='Carte de visite — 85,60 × 53,98 mm. Garde les infos importantes dans la zone de sécurité.';
    }else if(state.support==='business-card-88'){
      // Ratio 88 / 56 = 1,5714
      shell.style.width='300px';
      shell.style.height='191px';
      shell.style.borderRadius='14px';
      if(ring)ring.style.display='none';
      if(link)link.style.display='none';
      $('#supportRecommendation').textContent='Carte — 88 × 56 mm. Garde les infos importantes dans la zone de sécurité.';
    }
  }

  function updateText(){ $('#marginOut').textContent=`${state.margin}%`;$('#zoomOut').textContent=`${state.zoom}%`;$('#xOut').textContent=`${state.x}%`;$('#yOut').textContent=`${state.y}%`;$('#rotOut').textContent=`±${state.rot}°`;$('#speedOut').textContent=`${state.speed.toFixed(1)} s`; if($('#safeOut')) $('#safeOut').textContent=`${state.safe}%`; if($('#backZoomOut'))$('#backZoomOut').textContent=`${state.backZoom}%`;if($('#backXOut'))$('#backXOut').textContent=`${state.backX}%`;if($('#backYOut'))$('#backYOut').textContent=`${state.backY}%`; }
  function fitBox(sw,sh,dw,dh){ let k=(state.fit==='cover')?Math.max(dw/sw,dh/sh):Math.min(dw/sw,dh/sh); k*=state.zoom/100; if(state.fit==='preserve')k*=Math.max(.55,1-state.margin/100); const w=sw*k,h=sh*k; return {x:(dw-w)/2+(state.x/100)*dw*.5,y:(dh-h)/2+(state.y/100)*dh*.5,w,h}; }
  function ensureCanvas(){ const r=canvas.getBoundingClientRect(),d=Math.min(devicePixelRatio||1,2); const w=Math.max(2,Math.round(r.width*d)),h=Math.max(2,Math.round(r.height*d)); if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;} }
  function coverRect(sw,sh,dw,dh){const k=Math.max(dw/sw,dh/sh);const w=sw*k,h=sh*k;return{x:(dw-w)/2,y:(dh-h)/2,w,h};}

  function isCardSupport(){
    return state.support==='business-card' || state.support==='business-card-88';
  }

  function drawCardGuides(){
    if(!isCardSupport() || !state.showSafe) return;
    const W=canvas.width,H=canvas.height;
    const trimPad=Math.round(Math.min(W,H)*0.012);
    const safePad=Math.round(Math.min(W,H)*(Number(state.safe)||6)/100);
    ctx.save();
    ctx.strokeStyle='rgba(255,255,255,.92)';
    ctx.lineWidth=Math.max(1,Math.round(Math.min(W,H)*0.006));
    ctx.strokeRect(trimPad,trimPad,W-trimPad*2,H-trimPad*2);
    ctx.setLineDash([Math.max(6,Math.round(W*0.02)),Math.max(4,Math.round(W*0.012))]);
    ctx.strokeStyle='rgba(255,214,80,.95)';
    ctx.lineWidth=Math.max(1,Math.round(Math.min(W,H)*0.005));
    ctx.strokeRect(safePad,safePad,W-safePad*2,H-safePad*2);
    ctx.setLineDash([]);
    ctx.fillStyle='rgba(255,214,80,.95)';
    ctx.font=`700 ${Math.max(10,Math.round(Math.min(W,H)*0.055))}px -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif`;
    ctx.textBaseline='top';
    ctx.fillText('Zone de sécurité', safePad+6, safePad+6);
    ctx.restore();
  }

  function makeFlatLayer(img,W,H){
    const c=document.createElement('canvas');c.width=W;c.height=H;
    const x=c.getContext('2d'),r=coverRect(img.naturalWidth,img.naturalHeight,W,H);
    x.drawImage(img,r.x,r.y,r.w,r.h);
    return c;
  }

  function makeDepthLayers(img,depth,SW,SH,count,_soft,placementRect=null){
    const base=document.createElement('canvas');base.width=SW;base.height=SH;const bx=base.getContext('2d');
    const fr=placementRect||coverRect(img.naturalWidth,img.naturalHeight,SW,SH);
    bx.drawImage(img,fr.x,fr.y,fr.w,fr.h);
    const dep=document.createElement('canvas');dep.width=SW;dep.height=SH;const dx=dep.getContext('2d');
    const dr=placementRect||coverRect(depth.width,depth.height,SW,SH);
    dx.drawImage(depth,0,0,depth.width,depth.height,dr.x,dr.y,dr.w,dr.h);
    const bd=bx.getImageData(0,0,SW,SH),dd=dx.getImageData(0,0,SW,SH).data;
    const out=[];
    for(let n=0;n<count;n++){
      const layer=document.createElement('canvas');layer.width=SW;layer.height=SH;const lx=layer.getContext('2d');const id=lx.createImageData(SW,SH),od=id.data;
      for(let i=0;i<SW*SH;i++){
        const d=dd[i*4]/255;
        const owner=Math.max(0,Math.min(count-1,Math.round(d*(count-1))));
        if(owner!==n) continue;
        const a=bd.data[i*4+3]; if(a<1)continue;
        od[i*4]=bd.data[i*4];od[i*4+1]=bd.data[i*4+1];od[i*4+2]=bd.data[i*4+2];od[i*4+3]=a;
      }
      lx.putImageData(id,0,0);out.push({canvas:layer,depth:count===1?.5:n/(count-1)});
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
    const masterRect=window.HappyHoloSubjectPlacement?.rect?.(rs.subjectImg,SW,SH,{x:0,y:0,w:SW,h:SH})||null;
    const sub=makeDepthLayers(rs.subjectImg,rs.subjectDepthCanvas,SW,SH,1,.30,masterRect);
    if(token!==buildToken)return;
    const safetyBackground=makeFlatLayer(rs.backgroundImg,SW,SH);
    reliefLayers={w:SW,h:SH,bg,sub,safetyBackground};
    headlightCache=null;glintCache=null;transformCache=null;
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

  function activeHeadlightSelection(){const p=window.happyHoloSelectionPlan||[];return p.find(s=>s?.action==='headlight'&&Array.isArray(s.actionZones)&&s.actionZones.length);}
  function activeGlintSelection(){const p=window.happyHoloSelectionPlan||[];return p.find(s=>s?.action==='glint'&&Array.isArray(s.actionZones)&&s.actionZones.length);}
  function transformSelections(){const p=window.happyHoloSelectionPlan||[];return p.filter(s=>s?.action==='yaw3d'||s?.action==='explodeview');}
  let headlightCache=null,glintCache=null,transformCache=null;

  function selectionMask(s,W,H){
    const m=s?.mask;if(!m?.width||!m?.height||!m?.data)return null;
    const raw=document.createElement('canvas');raw.width=m.width;raw.height=m.height;raw.getContext('2d').putImageData(m,0,0);
    const src=window.HappyHoloReliefState?.sourceImg||window.HappyHoloReliefState?.subjectImg;if(!src)return null;
    const c=document.createElement('canvas');c.width=W;c.height=H;
    const r=window.HappyHoloSubjectPlacement?.rect?.(src,W,H,{x:0,y:0,w:W,h:H})||coverRect(src.naturalWidth||src.width,src.naturalHeight||src.height,W,H);
    c.getContext('2d').drawImage(raw,0,0,m.width,m.height,r.x,r.y,r.w,r.h);return c;
  }

  function getTransformCache(){
    const active=transformSelections(),engine=window.HappyHoloActionPreviewEngine;
    if(!active.length||!reliefLayers?.sub?.length||typeof engine?.generateActionFrames!=='function')return null;
    const plan=window.happyHoloSelectionPlan||[];if(transformCache&&transformCache.subRef===reliefLayers.sub&&transformCache.planRef===plan)return transformCache;
    const W=reliefLayers.w,H=reliefLayers.h;const subject=document.createElement('canvas');subject.width=W;subject.height=H;const sx=subject.getContext('2d');reliefLayers.sub.forEach(l=>sx.drawImage(l.canvas,0,0));
    const masks=plan.map(s=>selectionMask(s,W,H));const base=document.createElement('canvas');base.width=W;base.height=H;const bx=base.getContext('2d');bx.drawImage(subject,0,0);bx.globalCompositeOperation='destination-out';masks.forEach(m=>{if(m)bx.drawImage(m,0,0);});bx.globalCompositeOperation='source-over';
    const layers=new Map();plan.forEach((s,i)=>{const own=masks[i];if(!own)return;const c=document.createElement('canvas');c.width=W;c.height=H;const x=c.getContext('2d');x.drawImage(subject,0,0);x.globalCompositeOperation='destination-in';x.drawImage(own,0,0);for(let j=i+1;j<plan.length;j++)if(masks[j]){x.globalCompositeOperation='destination-out';x.drawImage(masks[j],0,0);}x.globalCompositeOperation='source-over';layers.set(i,c);});
    const hasExplode=active.some(s=>s?.action==='explodeview');const activeIndices=plan.map((s,i)=>(s?.action==='yaw3d'||s?.action==='explodeview')?i:-1).filter(i=>i>=0);const norms=hasExplode?[-1,-.75,-.5,-.25,0,.25,.5,.75,1]:[-1,-.66,-.33,0,.33,.66,1];
    const frames=engine.generateActionFrames({base,layers,selections:plan,activeIndices,W,H,phases:norms,phaseForSelection:(_s,n)=>(n+1)/2});
    transformCache={subRef:reliefLayers.sub,planRef:plan,frames,selection:active[0],hasExplode};return transformCache;
  }

  function drawTransformSubject(r,norm){const cache=getTransformCache();if(!cache?.frames?.length)return false;const p=Math.max(0,Math.min(1,(Number(norm||0)+1)/2)),pos=p*(cache.frames.length-1),lo=Math.floor(pos),hi=Math.min(cache.frames.length-1,lo+1),mix=pos-lo;const d=Math.max(.02,Math.min(.80,Number(cache.selection.depth)||.35));const shift=Number(norm||0)*(10+22*(d/.80))*(canvas.width/320);ctx.save();ctx.globalAlpha=1;ctx.drawImage(cache.frames[lo],r.x+shift,r.y,r.w,r.h);if(hi!==lo&&mix>.001){ctx.globalAlpha=mix;ctx.drawImage(cache.frames[hi],r.x+shift,r.y,r.w,r.h);}ctx.restore();return true;}

  function getGlintCache(){
    const s=activeGlintSelection(),engine=window.HappyHoloActionPreviewEngine;if(!s||!reliefLayers?.sub?.length||typeof engine?.buildGlintOverlay!=='function')return null;
    const intensity=Number(s.intensity||50);if(glintCache&&glintCache.zonesRef===s.actionZones&&glintCache.subRef===reliefLayers.sub&&glintCache.intensity===intensity)return glintCache;
    const W=reliefLayers.w,H=reliefLayers.h,subject=document.createElement('canvas');subject.width=W;subject.height=H;const sx=subject.getContext('2d');reliefLayers.sub.forEach(l=>sx.drawImage(l.canvas,0,0));
    const phases=[0,.17,.34,.5,.66,.83,1],frames=phases.map(phase=>engine.buildGlintOverlay({layer:subject,phase,intensity:Math.max(.1,Math.min(1,intensity/100)),W,H,zones:s.actionZones}));glintCache={zonesRef:s.actionZones,subRef:reliefLayers.sub,intensity,frames,selection:s};return glintCache;
  }
  function drawGlintEffect(r,norm){const cache=getGlintCache();if(!cache?.frames?.length)return;const p=Math.max(0,Math.min(1,(Number(norm||0)+1)/2));const frame=cache.frames[Math.min(cache.frames.length-1,Math.round(p*(cache.frames.length-1)))];const d=Math.max(.02,Math.min(.80,Number(cache.selection.depth)||.35));const shift=Number(norm||0)*(10+22*(d/.80))*(canvas.width/320);ctx.save();ctx.globalCompositeOperation='screen';ctx.drawImage(frame,r.x+shift,r.y,r.w,r.h);ctx.restore();}

  function buildHeadlightLayerCache(){
    const s=activeHeadlightSelection();if(!s||!reliefLayers?.sub?.length)return null;const zones=s.actionZones.filter(z=>z?.kind==='paint'&&Array.isArray(z.strokes));if(!zones.length)return null;
    const W=reliefLayers.w,H=reliefLayers.h,baseMask=document.createElement('canvas');baseMask.width=W;baseMask.height=H;const bx=baseMask.getContext('2d');for(const z of zones){const zm=drawPaintMask(z,W,H);bx.drawImage(zm,0,0,W,H);}
    const layers=reliefLayers.sub.map(l=>{const clip=document.createElement('canvas');clip.width=W;clip.height=H;const cx=clip.getContext('2d');cx.drawImage(baseMask,0,0);cx.globalCompositeOperation='destination-in';cx.drawImage(l.canvas,0,0);cx.globalCompositeOperation='source-over';const dark=document.createElement('canvas');dark.width=W;dark.height=H;const dx=dark.getContext('2d');dx.fillStyle='#000';dx.fillRect(0,0,W,H);dx.globalCompositeOperation='destination-in';dx.drawImage(clip,0,0);dx.globalCompositeOperation='source-over';const light=document.createElement('canvas');light.width=W;light.height=H;const lx=light.getContext('2d');lx.fillStyle='rgba(255,248,225,1)';lx.fillRect(0,0,W,H);lx.globalCompositeOperation='destination-in';lx.drawImage(clip,0,0);lx.globalCompositeOperation='source-over';return{dark,light};});
    return{zonesRef:s.actionZones,subRef:reliefLayers.sub,intensity:Number(s.intensity||50),mode:s.headlightMode||'off_to_on',layers};
  }
  function getHeadlightLayerCache(){const s=activeHeadlightSelection();if(!s||!reliefLayers?.sub?.length)return null;const invalid=!headlightCache||headlightCache.zonesRef!==s.actionZones||headlightCache.subRef!==reliefLayers.sub||headlightCache.intensity!==Number(s.intensity||50)||headlightCache.mode!==(s.headlightMode||'off_to_on');if(invalid)headlightCache=buildHeadlightLayerCache();return headlightCache;}
  function drawHeadlightEffectForLayer(index,r,shift,pulse){const s=activeHeadlightSelection(),cache=getHeadlightLayerCache(),layerFx=cache?.layers?.[index];if(!s||!layerFx)return;const intensity=Math.max(.1,Math.min(1,Number(s.intensity||50)/100)),mode=s.headlightMode||'off_to_on';if(mode==='off_to_on'){ctx.save();ctx.globalAlpha=(1-pulse)*.58*intensity;ctx.drawImage(layerFx.dark,r.x+shift,r.y,r.w,r.h);ctx.restore();}ctx.save();ctx.globalCompositeOperation='screen';ctx.globalAlpha=(.18+.82*pulse)*intensity;ctx.drawImage(layerFx.light,r.x+shift,r.y,r.w,r.h);ctx.restore();if(pulse>.55){const halo=(pulse-.55)*.40*intensity;ctx.save();ctx.globalCompositeOperation='screen';ctx.globalAlpha=halo;ctx.drawImage(layerFx.light,r.x+shift-1.5,r.y-1.5,r.w+3,r.h+3);ctx.restore();}}

  function applyHeadlightsFlat(r,pulse){const s=activeHeadlightSelection();if(!s)return;const zones=s.actionZones.filter(z=>z?.kind==='paint'&&Array.isArray(z.strokes));if(!zones.length)return;const intensity=Math.max(.1,Math.min(1,Number(s.intensity||50)/100));const mask=document.createElement('canvas');mask.width=canvas.width;mask.height=canvas.height;const mx=mask.getContext('2d');for(const z of zones){const zm=drawPaintMask(z,Math.max(2,Math.round(r.w)),Math.max(2,Math.round(r.h)));mx.drawImage(zm,r.x,r.y,r.w,r.h);}if((s.headlightMode||'off_to_on')==='off_to_on'){const dark=document.createElement('canvas');dark.width=canvas.width;dark.height=canvas.height;const dx=dark.getContext('2d');dx.fillStyle='#000';dx.fillRect(0,0,dark.width,dark.height);dx.globalCompositeOperation='destination-in';dx.drawImage(mask,0,0);ctx.save();ctx.globalAlpha=(1-pulse)*.58*intensity;ctx.drawImage(dark,0,0);ctx.restore();}const light=document.createElement('canvas');light.width=canvas.width;light.height=canvas.height;const lx=light.getContext('2d');lx.fillStyle='rgba(255,248,225,1)';lx.fillRect(0,0,light.width,light.height);lx.globalCompositeOperation='destination-in';lx.drawImage(mask,0,0);ctx.save();ctx.globalCompositeOperation='screen';ctx.globalAlpha=(.18+.82*pulse)*intensity;ctx.drawImage(light,0,0);ctx.restore();}
  function drawTextLayer(norm,r){window.HappyHoloTextLayer?.draw?.(ctx,norm,r);}

  function backRect(img,W,H){
    if(!img)return{x:0,y:0,w:W,h:H};
    const iw=img.naturalWidth||img.width||1,ih=img.naturalHeight||img.height||1;
    const sc=Math.max(W/iw,H/ih)*(Math.max(60,Math.min(180,Number(state.backZoom)||100))/100);
    const w=iw*sc,h=ih*sc;
    return{
      x:(W-w)/2+(Number(state.backX)||0)/100*W*.5,
      y:(H-h)/2+(Number(state.backY)||0)/100*H*.5,
      w,h
    };
  }

  function drawBackFace(){
    ensureCanvas();
    ctx.clearRect(0,0,canvas.width,canvas.height);

    // Le support DOM est déjà tourné de 180° : on retourne donc le dessin
    // du verso horizontalement pour qu'il soit lisible normalement à l'écran.
    ctx.save();
    ctx.translate(canvas.width,0);
    ctx.scale(-1,1);

    if(backImage){
      const r=backRect(backImage,canvas.width,canvas.height);
      ctx.drawImage(backImage,r.x,r.y,r.w,r.h);
    }else{
      const g=ctx.createLinearGradient(0,0,canvas.width,canvas.height);
      if(isCardSupport()){
        g.addColorStop(0,'#ffffff'); g.addColorStop(1,'#e9e9ee');
      }else{
        g.addColorStop(0,'#f2f2f3'); g.addColorStop(1,'#c9ccd3');
      }
      ctx.fillStyle=g; ctx.fillRect(0,0,canvas.width,canvas.height);
      ctx.strokeStyle='rgba(0,0,0,.12)';
      ctx.lineWidth=Math.max(2,Math.round(Math.min(canvas.width,canvas.height)*0.014));
      ctx.strokeRect(6,6,canvas.width-12,canvas.height-12);
      ctx.fillStyle='rgba(0,0,0,.62)';
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.font=`700 ${Math.max(16,Math.round(Math.min(canvas.width,canvas.height)*0.08))}px -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif`;
      ctx.fillText('VERSO', canvas.width/2, canvas.height/2 - 10);
      ctx.font=`500 ${Math.max(10,Math.round(Math.min(canvas.width,canvas.height)*0.038))}px -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif`;
      ctx.fillText('Charge une image dans le bloc « Verso du support »', canvas.width/2, canvas.height/2 + 22);
    }

    // Les guides doivent suivre le verso lui aussi.
    if(isCardSupport() && state.showSafe){
      const W=canvas.width,H=canvas.height;
      const trimPad=Math.round(Math.min(W,H)*0.012);
      const safePad=Math.round(Math.min(W,H)*(Number(state.safe)||6)/100);
      ctx.strokeStyle='rgba(255,255,255,.92)';
      ctx.lineWidth=Math.max(1,Math.round(Math.min(W,H)*0.006));
      ctx.strokeRect(trimPad,trimPad,W-trimPad*2,H-trimPad*2);
      ctx.setLineDash([Math.max(6,Math.round(W*0.02)),Math.max(4,Math.round(W*0.012))]);
      ctx.strokeStyle='rgba(255,214,80,.95)';
      ctx.lineWidth=Math.max(1,Math.round(Math.min(W,H)*0.005));
      ctx.strokeRect(safePad,safePad,W-safePad*2,H-safePad*2);
      ctx.setLineDash([]);
    }
    ctx.restore();
  }

  function renderFaceByState(norm=0, actionPulse=0){
    const face=currentRenderedFace();
    if(face==='back'){ drawBackFace(); return; }
    draw(norm, actionPulse);
  }
  function drawFallback(actionPulse=0,norm=0){
    ensureCanvas();ctx.clearRect(0,0,canvas.width,canvas.height);if(!uploadedImage)return;
    const r=fitBox(uploadedImage.naturalWidth,uploadedImage.naturalHeight,canvas.width,canvas.height);
    const customBg=window.HappyHoloCustomBackground?.draw?.(ctx,norm,canvas.width,canvas.height,{x:0,y:0,w:canvas.width,h:canvas.height});
    if(!customBg)ctx.drawImage(uploadedImage,r.x,r.y,r.w,r.h);
    applyHeadlightsFlat(r,actionPulse);drawTextLayer(norm,r);drawCardGuides();
  }

  function draw(norm,actionPulse=0){
    ensureCanvas();ctx.clearRect(0,0,canvas.width,canvas.height);if(!reliefLayers){drawFallback(actionPulse,norm);return;}const r=fitBox(reliefLayers.w,reliefLayers.h,canvas.width,canvas.height);
    ctx.save();ctx.beginPath();ctx.rect(0,0,canvas.width,canvas.height);ctx.clip();
    const full={x:0,y:0,w:canvas.width,h:canvas.height};
    const customBg=window.HappyHoloCustomBackground?.draw?.(ctx,norm,canvas.width,canvas.height,full);
    if(!customBg){
      const br=coverRect(reliefLayers.w,reliefLayers.h,canvas.width,canvas.height);
      if(reliefLayers.safetyBackground)ctx.drawImage(reliefLayers.safetyBackground,br.x-1,br.y-1,br.w+2,br.h+2);
      for(const l of reliefLayers.bg){const z=(l.depth-.5)*2,shift=norm*(4+5*z)*(canvas.width/320);ctx.drawImage(l.canvas,br.x+shift,br.y,br.w,br.h);}
    }
    const textDepth=Number(window.happyHoloTextLayer?.depth)||0;if(textDepth<0)drawTextLayer(norm,r);
    const transformDrawn=drawTransformSubject(r,norm);if(!transformDrawn){reliefLayers.sub.forEach((l,i)=>{const z=(l.depth-.5)*2,shift=norm*(12+13*z)*(canvas.width/320);ctx.drawImage(l.canvas,r.x+shift,r.y,r.w,r.h);drawHeadlightEffectForLayer(i,r,shift,actionPulse);});}else if(activeHeadlightSelection())applyHeadlightsFlat(r,actionPulse);
    drawGlintEffect(r,norm);if(textDepth>=0)drawTextLayer(norm,r);ctx.restore();drawCardGuides();
  }

  function headlightPulse(ts){const s=activeHeadlightSelection();if(!s)return 0;const ms=Math.max(800,Number(s.actionSpeed||2000)),t=((ts-start)%ms)/ms;return(1-Math.cos(t*Math.PI*2))/2;}
  function tick(ts){if(!running)return;if(!start)start=ts;if(ts-lastFrame<38){raf=requestAnimationFrame(tick);return;}lastFrame=ts;const phase=Math.sin((ts-start)/(state.speed*1000)*Math.PI*2);renderFaceByState(phase,headlightPulse(ts));raf=requestAnimationFrame(tick);}
  function play(){if(!uploadedImage&&!reliefLayers)return;running=true;start=0;lastFrame=0;product.style.setProperty('--support-neg',`${-state.rot}deg`);product.style.setProperty('--support-pos',`${state.rot}deg`);product.style.setProperty('--support-speed',`${state.speed}s`);product.classList.add('support-playing');cancelAnimationFrame(raf);raf=requestAnimationFrame(tick);}
  function stop(){running=false;cancelAnimationFrame(raf);product.classList.remove('support-playing');flipAngle=state.face==='back'?180:0;setProductTilt(flipAngle);renderFaceByState(0,0);}
  function apply(){const wasRunning=running;product.className=`product-object ${state.support}${wasRunning?' support-playing':''}`;applySupportShape();product.style.setProperty('--support-neg',`${-state.rot}deg`);product.style.setProperty('--support-pos',`${state.rot}deg`);product.style.setProperty('--support-speed',`${state.speed}s`);updateText();updateFaceButtons();if(!flipping)setProductTilt(flipAngle);renderFaceByState(0,0);if(running)start=0;}

  function animateToAngle(target,duration=900){
    cancelAnimationFrame(flipRAF);
    cancelAnimationFrame(raf);
    running=false;
    product.classList.remove('support-playing');
    flipping=true;
    const startAngle=flipAngle;
    const delta=target-startAngle;
    const t0=performance.now();
    const ease=t=>1-Math.pow(1-t,3);
    const step=now=>{
      const p=Math.min(1,(now-t0)/duration);
      flipAngle=startAngle+delta*ease(p);
      setProductTilt(flipAngle);
      renderFaceByState(0,0);
      if(p<1){ flipRAF=requestAnimationFrame(step); return; }
      flipping=false;
      flipAngle=target;
      const norm=((flipAngle%360)+360)%360;
      state.face = (norm>=90 && norm<270) ? 'back' : 'front';
      updateFaceButtons();
      setProductTilt(flipAngle);
      renderFaceByState(0,0);
    };
    flipRAF=requestAnimationFrame(step);
  }

  function showFront(){ animateToAngle(flipAngle<=180?360:720); state.face='front'; }
  function showBack(){
    const a=((flipAngle%360)+360)%360;
    let target = a<180 ? 180 : 540;
    animateToAngle(target);
    state.face='back';
  }
  function showRecto(){
    const a=((flipAngle%360)+360)%360;
    let target = a<180 ? 360 : 720;
    animateToAngle(target);
    state.face='front';
  }
  function demo360(){
    const a=flipAngle;
    animateToAngle(a+360,2800);
  }

  [type,fit,margin,zoom,xp,yp,rot,speed,safe].forEach(el=>el.addEventListener('input',()=>{state.support=type.value;state.fit=fit.value;state.margin=+margin.value;state.zoom=+zoom.value;state.x=+xp.value;state.y=+yp.value;state.rot=+rot.value;state.speed=+speed.value;state.safe=+safe.value;apply();}));
  showSafe.addEventListener('input',()=>{state.showSafe=showSafe.checked?1:0;apply();});
  [backZoom,backX,backY].forEach(el=>el.addEventListener('input',()=>{state.backZoom=+backZoom.value;state.backX=+backX.value;state.backY=+backY.value;updateText();renderFaceByState(0,0);}));
  backReset.addEventListener('click',()=>{state.backZoom=100;state.backX=0;state.backY=0;backZoom.value='100';backX.value='0';backY.value='0';updateText();renderFaceByState(0,0);});
  frontBtn.addEventListener('click',showRecto);
  backBtn.addEventListener('click',showBack);
  demo360Btn.addEventListener('click',demo360);
  $('#supportPlay').addEventListener('click',play);$('#supportStop').addEventListener('click',stop);
  file.addEventListener('change',()=>{const f=file.files?.[0];if(!f)return;if(objectUrl)URL.revokeObjectURL(objectUrl);objectUrl=URL.createObjectURL(f);const im=new Image();im.onload=()=>{uploadedImage=im;reliefLayers=null;empty.style.display='none';const rr=im.naturalWidth/im.naturalHeight;if(rr>1.12){type.value='keychain-horizontal';state.support=type.value;$('#supportRecommendation').textContent='Paysage → porte-clé horizontal recommandé.';}else{type.value='keychain-vertical';state.support=type.value;$('#supportRecommendation').textContent='Portrait → porte-clé vertical recommandé.';}apply();};im.src=objectUrl;});
  backFile.addEventListener('change',()=>{const f=backFile.files?.[0];if(!f)return;if(backObjectUrl)URL.revokeObjectURL(backObjectUrl);backObjectUrl=URL.createObjectURL(f);const im=new Image();im.onload=()=>{backImage=im;backStatus.textContent=`✓ ${f.name}`;renderFaceByState(0,0);};im.src=backObjectUrl;});
  window.addEventListener('happyholo-relief-ready',rebuildReliefLayers);
  window.addEventListener('happyholo-action-plan-changed',()=>{headlightCache=null;glintCache=null;transformCache=null;renderFaceByState(0,0);});
  window.addEventListener('happyholo-background-changed',()=>renderFaceByState(0,0));
  window.addEventListener('happyholo-subject-placement-changed',()=>{headlightCache=null;glintCache=null;transformCache=null;rebuildReliefLayers();});
  window.addEventListener('happyholo-text-layer-changed',()=>renderFaceByState(0,0));
  window.addEventListener('resize',()=>renderFaceByState(0,0));
  showSafe.checked=!!state.showSafe;safe.value=state.safe;backZoom.value=state.backZoom;backX.value=state.backX;backY.value=state.backY;updateFaceButtons();apply();console.log('[HAPPYHOLO] support-preview V3.7.3 · verso lisible + réglages dédiés');
})();
