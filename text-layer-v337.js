/* HappyHolo V3.4.5 — texte en relief compatible carte + exclusion PixVerse */
(() => {
  'use strict';

  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const view=document.getElementById('view');
  if(!view) return;

  const state=window.happyHoloTextLayer||{
    enabled:false,
    suspended:false,
    text:'',
    x:.5,
    y:.18,
    size:8,
    orientation:0,
    rotation3D:14,
    depth:55,
    color:'#ffffff',
    outline:'#111111',
    outlineSize:5,
    font:'system'
  };
  if(typeof state.suspended!=='boolean')state.suspended=false;
  window.happyHoloTextLayer=state;

  const fonts={
    system:'-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
    rounded:'ui-rounded,"Arial Rounded MT Bold",-apple-system,sans-serif',
    serif:'Georgia,"Times New Roman",serif',
    mono:'ui-monospace,"SFMono-Regular",Menlo,monospace'
  };

  function cleanLines(){
    return String(state.text||'').replace(/\r/g,'').split('\n').slice(0,4).map(s=>s.trim()).filter(Boolean);
  }

  function draw(ctx,norm=0,box=null){
    const lines=cleanLines();
    if(state.suspended||!state.enabled||!lines.length||!ctx?.canvas) return;
    const b=box||{x:0,y:0,w:ctx.canvas.width,h:ctx.canvas.height};
    const fontSize=Math.max(10,b.w*(Number(state.size)||8)/100);
    const lineHeight=fontSize*1.04;
    const depthValue=clamp(Number(state.depth)||0,-100,100);
    const parallax=Number(norm||0)*(depthValue/100)*b.w*.10;
    const angle=Number(state.orientation)||0;
    const yaw=Number(norm||0)*(Number(state.rotation3D)||0);
    const face=Math.max(.34,Math.cos(Math.abs(yaw)*Math.PI/180));
    const cx=b.x+clamp(Number(state.x)||.5,0,1)*b.w+parallax;
    const cy=b.y+clamp(Number(state.y)||.18,0,1)*b.h;
    ctx.save();ctx.translate(cx,cy);ctx.rotate(angle*Math.PI/180);ctx.scale(face,1);
    ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=`800 ${fontSize}px ${fonts[state.font]||fonts.system}`;
    ctx.lineJoin='round';ctx.miterLimit=2;ctx.shadowColor='rgba(0,0,0,.28)';ctx.shadowBlur=Math.max(1,fontSize*.07);ctx.shadowOffsetY=Math.max(1,fontSize*.03);
    const firstY=-(lines.length-1)*lineHeight/2;
    lines.forEach((line,i)=>{const y=firstY+i*lineHeight;const stroke=Math.max(0,Number(state.outlineSize)||0)*fontSize/100;if(stroke>.2){ctx.lineWidth=stroke*2;ctx.strokeStyle=state.outline||'#111111';ctx.strokeText(line,0,y,b.w*.92);}ctx.fillStyle=state.color||'#ffffff';ctx.fillText(line,0,y,b.w*.92);});
    ctx.restore();
  }

  function serialize(){
    if(!state.enabled||!cleanLines().length) return null;
    return {text:cleanLines().join('\n'),x:state.x,y:state.y,size:state.size,orientation:state.orientation,rotation3D:state.rotation3D,depth:state.depth,color:state.color,outline:state.outline,outlineSize:state.outlineSize,font:state.font,placement:Number(state.depth)<0?'behind-subject':'front'};
  }

  function setSuspended(value,redraw=true){
    state.suspended=!!value;
    if(redraw&&window.HappyHoloReliefState?.view){try{if(typeof renderAt==='function')renderAt(0,window.HappyHoloReliefState.view);}catch(_){}}
    window.dispatchEvent(new CustomEvent('happyholo-text-suspended',{detail:{suspended:state.suspended}}));
    return state.suspended;
  }

  window.HappyHoloTextLayer={state,draw,serialize,setSuspended};

  function requestRedraw(){
    window.dispatchEvent(new CustomEvent('happyholo-text-layer-changed',{detail:serialize()}));
    if(window.HappyHoloReliefState?.view){try{if(typeof renderAt==='function')renderAt(0,window.HappyHoloReliefState.view);}catch(_){}}
  }

  const card=document.createElement('section');
  card.id='happyHoloTextControls';card.className='card';card.style.marginTop='18px';
  card.innerHTML=`
    <div style="display:flex;justify-content:space-between;gap:12px;align-items:center">
      <div><h2 style="margin:0 0 4px">Texte en relief / carte</h2><div class="small">Le texte reste dans HappyHolo et n’est jamais envoyé à PixVerse. Jusqu’à 4 lignes, avec profondeur propre.</div></div>
      <label style="display:flex;align-items:center;gap:7px;margin:0;font-weight:800"><input id="textEnabled" type="checkbox"> Activer</label>
    </div>
    <div id="textTools" style="display:grid;grid-template-columns:minmax(220px,1.1fr) minmax(220px,1fr);gap:16px;margin-top:14px;opacity:.48">
      <div>
        <label>Texte carte — 4 lignes maximum</label>
        <textarea id="textValue" rows="4" maxlength="160" placeholder="Ex. HAPPYHOLO&#10;Philippe Dhorme&#10;06 00 00 00 00&#10;contact@exemple.fr" style="width:100%;box-sizing:border-box;padding:10px;border:1px solid #bbb;border-radius:10px;font:inherit;resize:none"></textarea>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div><label>Police</label><select id="textFont" style="width:100%;padding:9px;border:1px solid #bbb;border-radius:9px"><option value="system">Moderne</option><option value="rounded">Arrondie</option><option value="serif">Élégante</option><option value="mono">Technique</option></select></div>
          <div><label>Couleur</label><input id="textColor" type="color" value="#ffffff" style="width:100%;height:40px;border:1px solid #bbb;border-radius:9px;background:#fff"></div>
          <div><label>Contour</label><input id="textOutline" type="color" value="#111111" style="width:100%;height:40px;border:1px solid #bbb;border-radius:9px;background:#fff"></div>
          <div><label><span>Épaisseur</span> <b id="textOutlineOut">5%</b></label><input id="textOutlineSize" type="range" min="0" max="12" value="5"></div>
        </div>
      </div>
      <div>
        <label><span>Taille</span> <b id="textSizeOut">8%</b></label><input id="textSize" type="range" min="4" max="18" value="8" step="1">
        <label><span>Orientation fixe</span> <b id="textOrientationOut">0°</b></label><input id="textOrientation" type="range" min="-180" max="180" value="0" step="1">
        <label><span>Profondeur lenticulaire</span> <b id="textDepthOut">Avant +55</b></label><input id="textDepth" type="range" min="-100" max="100" value="55" step="1">
        <label><span>Rotation entre les vues</span> <b id="textRotationOut">±14°</b></label><input id="textRotation" type="range" min="0" max="35" value="14" step="1">
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px"><button id="textCenter" type="button" class="secondary">Recentrer</button><button id="textCardPreset" type="button" class="secondary">Preset carte</button><span class="small" style="align-self:center">Déplace le texte directement sur la grande image.</span></div>
      </div>
    </div>`;

  const main=document.querySelector('.card.grid');if(main?.parentNode)main.parentNode.insertBefore(card,main.nextSibling);else document.body.appendChild(card);
  const $=s=>card.querySelector(s);const enabled=$('#textEnabled'),tools=$('#textTools'),value=$('#textValue'),font=$('#textFont');const color=$('#textColor'),outline=$('#textOutline'),outlineSize=$('#textOutlineSize');const size=$('#textSize'),orientation=$('#textOrientation'),depth=$('#textDepth'),rotation=$('#textRotation');
  function syncOutputs(){
    $('#textSizeOut').textContent=`${state.size}%`;$('#textOrientationOut').textContent=`${state.orientation}°`;const d=Number(state.depth)||0;$('#textDepthOut').textContent=d===0?'Plan image':(d>0?`Avant +${d}`:`Arrière ${d}`);$('#textRotationOut').textContent=`±${state.rotation3D}°`;$('#textOutlineOut').textContent=`${state.outlineSize}%`;tools.style.opacity=state.enabled?'1':'.48';view.style.touchAction=state.enabled?'none':'';
  }
  function pull(){state.enabled=enabled.checked;state.text=value.value.replace(/\r/g,'').split('\n').slice(0,4).join('\n');if(value.value!==state.text)value.value=state.text;state.font=font.value;state.color=color.value;state.outline=outline.value;state.outlineSize=Number(outlineSize.value);state.size=Number(size.value);state.orientation=Number(orientation.value);state.depth=Number(depth.value);state.rotation3D=Number(rotation.value);syncOutputs();requestRedraw();}
  enabled.checked=!!state.enabled;value.value=state.text||'';font.value=state.font||'system';color.value=state.color||'#ffffff';outline.value=state.outline||'#111111';outlineSize.value=state.outlineSize??5;size.value=state.size??8;orientation.value=state.orientation??0;depth.value=state.depth??55;rotation.value=state.rotation3D??14;
  [enabled,value,font,color,outline,outlineSize,size,orientation,depth,rotation].forEach(el=>el.addEventListener('input',pull));
  $('#textCenter').addEventListener('click',()=>{state.x=.5;state.y=.18;requestRedraw();});
  $('#textCardPreset').addEventListener('click',()=>{state.x=.5;state.y=.18;state.size=8;state.rotation3D=14;state.depth=55;size.value='8';rotation.value='14';depth.value='55';syncOutputs();requestRedraw();});

  let dragging=false,dragDX=0,dragDY=0;
  view.addEventListener('pointerdown',e=>{if(!state.enabled||!cleanLines().length)return;e.preventDefault();dragging=true;view.setPointerCapture?.(e.pointerId);const r=view.getBoundingClientRect();dragDX=(e.clientX-r.left)-state.x*r.width;dragDY=(e.clientY-r.top)-state.y*r.height;},{passive:false});
  view.addEventListener('pointermove',e=>{if(!dragging)return;e.preventDefault();const r=view.getBoundingClientRect();state.x=clamp(((e.clientX-r.left)-dragDX)/r.width,0,1);state.y=clamp(((e.clientY-r.top)-dragDY)/r.height,0,1);requestRedraw();},{passive:false});
  const stopDrag=()=>{dragging=false;};view.addEventListener('pointerup',stopDrag);view.addEventListener('pointercancel',stopDrag);
  function placeBeforeSupport(){const support=document.querySelector('.support-card');if(support?.parentNode)support.parentNode.insertBefore(card,support);}
  setTimeout(placeBeforeSupport,0);window.addEventListener('happyholo:selection-plan',placeBeforeSupport);syncOutputs();
  console.log('[HAPPYHOLO] couche texte V3.4.5 · hors PixVerse · relief conservé');
})();