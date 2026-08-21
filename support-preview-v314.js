/* HappyHolo V3.1.14 — simulation lenticulaire multi-couches de profondeur */
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
    <div class="support-head"><div><h2>Rendu support</h2><p>Simulation lenticulaire — couches de profondeur + rotation du support.</p></div><span class="support-badge">Aperçu 3D</span></div>
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
      <div class="support-stage-wrap"><div class="support-stage"><div id="productObject" class="product-object keychain-vertical"><div class="ring"></div><div class="link"></div><div class="shell"><div class="image-window"><canvas id="supportCanvas"></canvas></div></div></div><div id="supportEmpty" class="support-empty">Charge une photo pour afficher le support.</div></div><div id="supportRecommendation" class="support-note">Portrait → porte-clé vertical recommandé.</div><div id="supportHint" class="support-note">Après « Créer le relief 3D local », l’aperçu utilise plusieurs plans de profondeur au lieu d’une image plate.</div></div>
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
    if(!rs?.subjectImg||!rs?.backgroundImg||!rs?.subjectDepthCanvas||!rs?.backgroundDepthCanvas){reliefLayers=null;draw(0);return;}
    $('#supportHint').textContent='Préparation des couches de profondeur…';
    await new Promise(r=>setTimeout(r,30));
    if(token!==buildToken)return;
    const SW=420, SH=Math.max(280,Math.round(SW*(rs.view.height/rs.view.width)));
    const bg=makeDepthLayers(rs.backgroundImg,rs.backgroundDepthCanvas,SW,SH,4,.42);
    const sub=makeDepthLayers(rs.subjectImg,rs.subjectDepthCanvas,SW,SH,6,.30);
    if(token!==buildToken)return;
    reliefLayers={w:SW,h:SH,bg,sub};
    $('#supportHint').textContent='Aperçu 3D prêt — fond et sujet se déplacent selon leur profondeur.';
    play();
  }

  function drawFallback(){ensureCanvas();ctx.clearRect(0,0,canvas.width,canvas.height);if(!uploadedImage)return;const r=fitBox(uploadedImage.naturalWidth,uploadedImage.naturalHeight,canvas.width,canvas.height);ctx.drawImage(uploadedImage,r.x,r.y,r.w,r.h);}
  function draw(norm){
    ensureCanvas();ctx.clearRect(0,0,canvas.width,canvas.height);
    if(!reliefLayers){drawFallback();return;}
    const r=fitBox(reliefLayers.w,reliefLayers.h,canvas.width,canvas.height);
    ctx.save();ctx.beginPath();ctx.rect(0,0,canvas.width,canvas.height);ctx.clip();
    // Fond : petit déplacement, couches proches légèrement plus mobiles.
    for(const l of reliefLayers.bg){const z=(l.depth-.5)*2;const shift=norm*(4+5*z)*(canvas.width/320);ctx.drawImage(l.canvas,r.x+shift,r.y,r.w,r.h);}
    // Sujet : parallax plus forte, chaque tranche de profondeur se déplace différemment.
    for(const l of reliefLayers.sub){const z=(l.depth-.5)*2;const shift=norm*(12+13*z)*(canvas.width/320);ctx.drawImage(l.canvas,r.x+shift,r.y,r.w,r.h);}
    ctx.restore();
  }
  function tick(ts){if(!running)return;if(!start)start=ts;if(ts-lastFrame<38){raf=requestAnimationFrame(tick);return;}lastFrame=ts;const phase=Math.sin((ts-start)/(state.speed*1000)*Math.PI*2);draw(phase);raf=requestAnimationFrame(tick);}
  function play(){if(!uploadedImage&&!reliefLayers)return;running=true;start=0;lastFrame=0;product.style.setProperty('--support-neg',`${-state.rot}deg`);product.style.setProperty('--support-pos',`${state.rot}deg`);product.style.setProperty('--support-speed',`${state.speed}s`);product.classList.add('support-playing');cancelAnimationFrame(raf);raf=requestAnimationFrame(tick);}
  function stop(){running=false;cancelAnimationFrame(raf);product.classList.remove('support-playing');product.style.transform='perspective(620px) rotateY(0deg) translateX(0)';draw(0);}
  function apply(){const wasRunning=running;product.className=`product-object ${state.support}${wasRunning?' support-playing':''}`;product.style.setProperty('--support-neg',`${-state.rot}deg`);product.style.setProperty('--support-pos',`${state.rot}deg`);product.style.setProperty('--support-speed',`${state.speed}s`);updateText();draw(0);if(running){start=0;}}

  [type,fit,margin,zoom,xp,yp,rot,speed].forEach(el=>el.addEventListener('input',()=>{state.support=type.value;state.fit=fit.value;state.margin=+margin.value;state.zoom=+zoom.value;state.x=+xp.value;state.y=+yp.value;state.rot=+rot.value;state.speed=+speed.value;apply();}));
  $('#supportPlay').addEventListener('click',play);$('#supportStop').addEventListener('click',stop);

  file.addEventListener('change',()=>{const f=file.files?.[0];if(!f)return;if(objectUrl)URL.revokeObjectURL(objectUrl);objectUrl=URL.createObjectURL(f);const im=new Image();im.onload=()=>{uploadedImage=im;reliefLayers=null;empty.style.display='none';const rr=im.naturalWidth/im.naturalHeight;if(rr>1.12){type.value='keychain-horizontal';state.support=type.value;$('#supportRecommendation').textContent='Paysage → porte-clé horizontal recommandé.';}else{type.value='keychain-vertical';state.support=type.value;$('#supportRecommendation').textContent='Portrait → porte-clé vertical recommandé.';}apply();};im.src=objectUrl;});
  window.addEventListener('happyholo-relief-ready',rebuildReliefLayers);
  window.addEventListener('resize',()=>draw(0));
  apply();
})();
