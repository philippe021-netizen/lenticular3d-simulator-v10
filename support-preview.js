/* HappyHolo V3.1.8 — Rendu support restauré sans toucher au moteur Relief 3D */
(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const file = $('#file');
  if (!file) return;

  let img = null, objectUrl = null, raf = 0, running = false, start = 0;
  const state = {support:'keychain-vertical', fit:'preserve', margin:14, zoom:100, x:0, y:0, rot:6, speed:5};

  const host = document.createElement('section');
  host.className = 'support-card';
  host.innerHTML = `
    <div class="support-head"><div><h2>Rendu support</h2><p>Simulation simple — cadrage et rotation du support complet.</p></div><span class="support-badge">Aperçu</span></div>
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
            <div class="ring"></div><div class="link"></div><div class="shell"><div class="image-window"><img id="supportImage" alt="Aperçu"></div></div>
          </div>
          <div id="supportEmpty" class="support-empty">Charge une photo pour afficher le support.</div>
        </div>
        <div id="supportRecommendation" class="support-note">Portrait → porte-clé vertical recommandé.</div>
      </div>
    </div>`;

  const mainCard = document.querySelector('.card.grid');
  mainCard?.insertAdjacentElement('afterend', host);

  const type=$('#supportType'), fit=$('#supportFit'), margin=$('#supportMargin'), zoom=$('#supportZoom'), xp=$('#supportX'), yp=$('#supportY'), rot=$('#supportRot'), speed=$('#supportSpeed');
  const product=$('#productObject'), simg=$('#supportImage'), empty=$('#supportEmpty');

  function updateText(){
    $('#marginOut').textContent=`${state.margin}%`; $('#zoomOut').textContent=`${state.zoom}%`; $('#xOut').textContent=`${state.x}%`; $('#yOut').textContent=`${state.y}%`; $('#rotOut').textContent=`±${state.rot}°`; $('#speedOut').textContent=`${state.speed.toFixed(1)} s`;
  }
  function applyImage(){
    if(!img) return;
    const pad = state.fit==='preserve' ? state.margin : 0;
    const base = state.fit==='contain' ? 'contain' : 'cover';
    simg.style.objectFit=base;
    simg.style.width=`${100+state.zoom-100}%`; simg.style.height=`${100+state.zoom-100}%`;
    simg.style.left=`${state.x}%`; simg.style.top=`${state.y}%`;
    simg.style.transform='translate(-50%,-50%)';
    simg.style.padding=`${pad}%`;
  }
  function applySupport(){
    product.className=`product-object ${state.support}`;
    updateText(); applyImage();
  }
  function tick(ts){
    if(!running) return;
    if(!start) start=ts;
    const p=(ts-start)/(state.speed*1000);
    const a=Math.sin(p*Math.PI*2)*state.rot;
    product.style.transform=`perspective(900px) rotateY(${a}deg)`;
    raf=requestAnimationFrame(tick);
  }
  function play(){running=true;start=0;cancelAnimationFrame(raf);raf=requestAnimationFrame(tick);}
  function stop(){running=false;cancelAnimationFrame(raf);product.style.transform='perspective(900px) rotateY(0deg)';}

  [type,fit,margin,zoom,xp,yp,rot,speed].forEach(el=>el.addEventListener('input',()=>{
    state.support=type.value; state.fit=fit.value; state.margin=Number(margin.value); state.zoom=Number(zoom.value); state.x=Number(xp.value); state.y=Number(yp.value); state.rot=Number(rot.value); state.speed=Number(speed.value); applySupport();
  }));
  $('#supportPlay').addEventListener('click',play); $('#supportStop').addEventListener('click',stop);

  file.addEventListener('change',()=>{
    const f=file.files?.[0]; if(!f) return;
    if(objectUrl) URL.revokeObjectURL(objectUrl); objectUrl=URL.createObjectURL(f);
    const probe=new Image();
    probe.onload=()=>{
      img=probe; simg.src=objectUrl; empty.style.display='none';
      const r=probe.naturalWidth/probe.naturalHeight;
      if(r>1.12){ type.value='keychain-horizontal'; state.support=type.value; $('#supportRecommendation').textContent='Paysage → porte-clé horizontal recommandé.'; }
      else { type.value='keychain-vertical'; state.support=type.value; $('#supportRecommendation').textContent='Portrait → porte-clé vertical recommandé.'; }
      applySupport();
    };
    probe.src=objectUrl;
  });
  applySupport();
})();
