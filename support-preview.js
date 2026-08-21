/* HappyHolo V3.1.11 — Rendu support animé relié au vrai moteur Relief 3D */
(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const file = $('#file');
  const view = $('#view');
  if (!file || !view) return;

  let uploadedImage = null, objectUrl = null, raf = 0, running = false, start = 0;
  const state = {support:'keychain-vertical', fit:'preserve', margin:14, zoom:100, x:0, y:0, rot:6, speed:5};

  const host = document.createElement('section');
  host.className = 'support-card';
  host.innerHTML = `
    <div class="support-head"><div><h2>Rendu support</h2><p>Simulation animée — rotation du support + effet lenticulaire synchronisé.</p></div><span class="support-badge">Aperçu</span></div>
    <div class="support-grid">
      <div class="support-controls">
        <label>Support</label>
        <select id="supportType">
          <option value="keychain-vertical">Porte-clé rectangle vertical</option>
          <option value="keychain-horizontal">Porte-clé rectangle horizontal</option>
          <option value="medallion-round">Médaillon rond Ø30 mm</option>
        </select>
        <label>Cadrage</label>
        <select id="supportFit">
          <option value="preserve">Préserver le sujet — recommandé</option>
          <option value="contain">Adapter — image entière</option>
          <option value="cover">Remplir — plein cadre</option>
        </select>
        <label><span>Marge autour du sujet</span><b id="marginOut">14%</b></label>
        <input id="supportMargin" type="range" min="0" max="30" value="14">
        <label><span>Zoom</span><b id="zoomOut">100%</b></label>
        <input id="supportZoom" type="range" min="60" max="180" value="100">
        <label><span>Position horizontale</span><b id="xOut">0%</b></label>
        <input id="supportX" type="range" min="-50" max="50" value="0">
        <label><span>Position verticale</span><b id="yOut">0%</b></label>
        <input id="supportY" type="range" min="-50" max="50" value="0">
        <label><span>Rotation lenticulaire</span><b id="rotOut">±6°</b></label>
        <input id="supportRot" type="range" min="0" max="8" value="6" step="1">
        <label><span>Vitesse</span><b id="speedOut">5.0 s</b></label>
        <input id="supportSpeed" type="range" min="2" max="8" value="5" step="0.5">
        <div><button id="supportPlay">Lancer l’aperçu</button><button id="supportStop" class="secondary">Stop</button></div>
      </div>
      <div class="support-stage-wrap">
        <div class="support-stage">
          <div id="productObject" class="product-object keychain-vertical">
            <div class="ring"></div>
            <div class="link"></div>
            <div class="shell"><div class="image-window"><canvas id="supportCanvas"></canvas></div></div>
          </div>
          <div id="supportEmpty" class="support-empty">Charge une photo pour afficher le support.</div>
        </div>
        <div id="supportRecommendation" class="support-note">Portrait → porte-clé vertical recommandé.</div>
        <div id="supportHint" class="support-note">Astuce : crée le relief 3D local, puis lance l’aperçu pour voir la rotation et l’effet.</div>
      </div>
    </div>`;

  const mainCard = document.querySelector('.card.grid');
  mainCard?.insertAdjacentElement('afterend', host);

  const type=$('#supportType'), fit=$('#supportFit'), margin=$('#supportMargin'), zoom=$('#supportZoom'), xp=$('#supportX'), yp=$('#supportY'), rot=$('#supportRot'), speed=$('#supportSpeed');
  const product=$('#productObject'), supportCanvas=$('#supportCanvas'), empty=$('#supportEmpty'), stage=$('.support-stage');
  const sctx=supportCanvas.getContext('2d');
  const scene=document.createElement('canvas');
  const sceneCtx=scene.getContext('2d');
  let resizeObserver = null;

  function reliefReady(){
    try{ return typeof renderAt === 'function' && !!document.querySelector('#export') && !document.querySelector('#export').disabled; }
    catch(_){ return false; }
  }
  function updateText(){
    $('#marginOut').textContent=`${state.margin}%`;
    $('#zoomOut').textContent=`${state.zoom}%`;
    $('#xOut').textContent=`${state.x}%`;
    $('#yOut').textContent=`${state.y}%`;
    $('#rotOut').textContent=`±${state.rot}°`;
    $('#speedOut').textContent=`${state.speed.toFixed(1)} s`;
  }
  function syncCanvasSize(){
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = supportCanvas.getBoundingClientRect();
    const w = Math.max(2, Math.round(rect.width * dpr));
    const h = Math.max(2, Math.round(rect.height * dpr));
    if (supportCanvas.width !== w || supportCanvas.height !== h){
      supportCanvas.width = w; supportCanvas.height = h;
    }
    scene.width = 1024;
    scene.height = Math.round(1024 * (h / w || 1));
  }
  function fitRect(sw,sh,dw,dh){
    let scale;
    if(state.fit==='contain' || state.fit==='preserve') scale = Math.min(dw/sw, dh/sh);
    else scale = Math.max(dw/sw, dh/sh);
    scale *= (state.zoom/100);
    if(state.fit==='preserve') scale *= Math.max(0.55, 1 - state.margin/100);
    const w = sw * scale, h = sh * scale;
    const dx = (dw-w)/2 + (state.x/100)*dw*0.5;
    const dy = (dh-h)/2 + (state.y/100)*dh*0.5;
    return {dx,dy,w,h};
  }
  function drawUploadedFallback(){
    syncCanvasSize();
    sctx.clearRect(0,0,supportCanvas.width,supportCanvas.height);
    if(!uploadedImage) return;
    const r = fitRect(uploadedImage.naturalWidth, uploadedImage.naturalHeight, supportCanvas.width, supportCanvas.height);
    sctx.drawImage(uploadedImage, r.dx, r.dy, r.w, r.h);
  }
  function drawReliefFrame(norm){
    syncCanvasSize();
    if(reliefReady()){
      sceneCtx.clearRect(0,0,scene.width,scene.height);
      try { renderAt(norm, scene); }
      catch(e){ console.warn('[support-preview] renderAt failed', e); drawUploadedFallback(); return; }
      sctx.clearRect(0,0,supportCanvas.width,supportCanvas.height);
      const r = fitRect(scene.width, scene.height, supportCanvas.width, supportCanvas.height);
      sctx.drawImage(scene, r.dx, r.dy, r.w, r.h);
    } else if (view && view.width && view.height) {
      sctx.clearRect(0,0,supportCanvas.width,supportCanvas.height);
      const r = fitRect(view.width, view.height, supportCanvas.width, supportCanvas.height);
      sctx.drawImage(view, r.dx, r.dy, r.w, r.h);
    } else {
      drawUploadedFallback();
    }
  }
  function applySupport(){
    product.className=`product-object ${state.support}`;
    updateText();
    drawReliefFrame(0);
  }
  function tick(ts){
    if(!running) return;
    if(!start) start = ts;
    const phase = Math.sin((ts-start)/(state.speed*1000)*Math.PI*2);
    product.style.transform = `perspective(900px) rotateY(${phase * state.rot}deg)`;
    drawReliefFrame(phase);
    raf = requestAnimationFrame(tick);
  }
  function play(){
    if(!uploadedImage && !reliefReady()) return;
    running = true; start = 0; cancelAnimationFrame(raf); raf = requestAnimationFrame(tick);
  }
  function stop(){
    running = false; cancelAnimationFrame(raf); product.style.transform='perspective(900px) rotateY(0deg)'; drawReliefFrame(0);
  }
  function maybeAutoplay(){ if(reliefReady()) play(); else drawReliefFrame(0); }

  [type,fit,margin,zoom,xp,yp,rot,speed].forEach(el=>el.addEventListener('input',()=>{
    state.support=type.value; state.fit=fit.value; state.margin=Number(margin.value); state.zoom=Number(zoom.value); state.x=Number(xp.value); state.y=Number(yp.value); state.rot=Number(rot.value); state.speed=Number(speed.value);
    applySupport();
    if(running){ cancelAnimationFrame(raf); raf=requestAnimationFrame(tick); }
  }));
  $('#supportPlay').addEventListener('click', play);
  $('#supportStop').addEventListener('click', stop);

  file.addEventListener('change',()=>{
    const f = file.files?.[0]; if(!f) return;
    if(objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = URL.createObjectURL(f);
    const probe = new Image();
    probe.onload = ()=>{
      uploadedImage = probe; empty.style.display='none';
      const r = probe.naturalWidth/probe.naturalHeight;
      if(r > 1.12){ type.value='keychain-horizontal'; state.support=type.value; $('#supportRecommendation').textContent='Paysage → porte-clé horizontal recommandé.'; }
      else { type.value='keychain-vertical'; state.support=type.value; $('#supportRecommendation').textContent='Portrait → porte-clé vertical recommandé.'; }
      applySupport();
    };
    probe.src = objectUrl;
  });

  // Auto-start once the main relief build finishes.
  const exportBtn = document.querySelector('#export');
  if(exportBtn){
    const obs = new MutationObserver(()=>{ if(!exportBtn.disabled) maybeAutoplay(); });
    obs.observe(exportBtn, {attributes:true, attributeFilter:['disabled']});
  }

  if('ResizeObserver' in window){
    resizeObserver = new ResizeObserver(()=>{ drawReliefFrame(0); if(running){ cancelAnimationFrame(raf); raf=requestAnimationFrame(tick); } });
    resizeObserver.observe(stage);
  } else {
    window.addEventListener('resize', ()=>{ drawReliefFrame(0); if(running){ cancelAnimationFrame(raf); raf=requestAnimationFrame(tick); } });
  }

  applySupport();
})();
