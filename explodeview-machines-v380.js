/* HappyHolo V3.8.2 — ExplodeView générique pour machines et objets techniques */
(() => {
  'use strict';

  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const state=window.HappyHoloExplodeViewState||{mode:'simple'};
  try{state.mode=localStorage.getItem('happyholo:explodeview-mode')||state.mode||'simple';}catch(_){state.mode=state.mode||'simple';}
  window.HappyHoloExplodeViewState=state;

  const plan=()=>Array.isArray(window.happyHoloSelectionPlan)?window.happyHoloSelectionPlan:[];
  const renderer=()=>window.HappyHoloSelectionRenderer;
  const engine=()=>window.HappyHoloActionPreviewEngine;
  const explodeSelections=()=>plan().filter(s=>s?.action==='explodeview');

  let slimSAMLoading=null;
  function loadSlimSAM(){
    if(window.HappyHoloSlimSAM?.open)return Promise.resolve(window.HappyHoloSlimSAM);
    if(slimSAMLoading)return slimSAMLoading;
    slimSAMLoading=new Promise((resolve,reject)=>{
      const existing=document.querySelector('script[data-happyholo-slimsam]');
      if(existing){
        const done=()=>window.HappyHoloSlimSAM?.open?resolve(window.HappyHoloSlimSAM):reject(new Error('Module SlimSAM chargé sans API.'));
        window.addEventListener('happyholo-slimsam-ready',done,{once:true});
        setTimeout(done,2500);
        return;
      }
      const s=document.createElement('script');
      s.src='./slimsam-piece-selector-v330.js?v=330';
      s.async=true;
      s.dataset.happyholoSlimsam='1';
      s.onload=()=>window.HappyHoloSlimSAM?.open?resolve(window.HappyHoloSlimSAM):reject(new Error('API SlimSAM absente.'));
      s.onerror=()=>reject(new Error('Impossible de charger le sélecteur SlimSAM.'));
      document.head.appendChild(s);
    }).catch(e=>{slimSAMLoading=null;throw e;});
    return slimSAMLoading;
  }

  function maskStats(mask){
    const d=mask?.data,w=mask?.width,h=mask?.height;if(!d||!w||!h)return null;
    let minX=w,minY=h,maxX=-1,maxY=-1,pixels=0;
    for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(d[(y*w+x)*4+3]>12){pixels++;if(x<minX)minX=x;if(x>maxX)maxX=x;if(y<minY)minY=y;if(y>maxY)maxY=y;}
    return maxX<minX?null:{area:pixels,x:minX,y:minY,w:maxX-minX+1,h:maxY-minY+1,cx:(minX+maxX)/2,cy:(minY+maxY)/2};
  }

  function expectedRange(){return state.mode==='technical'?[10,12]:state.mode==='detailed'?[7,9]:[4,6];}

  function statusText(){
    const all=plan(),pieces=explodeSelections(),[min,max]=expectedRange();
    if(all.length<2)return 'Crée la machine complète, puis utilise « IA — toucher une pièce » pour sélectionner les grands sous-ensembles.';
    if(!pieces.length)return `${all.length} sélections prêtes. Lance la répartition ExplodeView.`;
    const range=pieces.length<min?`Ajoute encore ${min-pieces.length} grosse${min-pieces.length>1?'s':''} pièce${min-pieces.length>1?'s':''} pour ce mode.`:pieces.length>max?'Trop de détails pour ce mode : réduis le nombre de petites pièces.':'Nombre de pièces cohérent pour ce mode.';
    return `${pieces.length} pièces ExplodeView • ${range}`;
  }

  function notify(){
    window.dispatchEvent(new CustomEvent('happyholo-action-plan-changed'));
    window.dispatchEvent(new CustomEvent('happyholo-background-changed'));
    try{window.renderAt?.(0,window.HappyHoloReliefState?.view);}catch(_){}
    updatePanel();
  }

  function configureAutomatically(){
    const selections=plan();
    if(selections.length<2){alert('ExplodeView a besoin de plusieurs grosses pièces. Utilise « IA — toucher une pièce » pour sélectionner les roues, la selle, le moteur ou les grands sous-ensembles.');return;}
    const ranked=selections.map((s,i)=>({s,i,stats:maskStats(s.mask)})).filter(x=>x.stats).sort((a,b)=>a.stats.area-b.stats.area);
    if(ranked.length<2){alert('Les sélections sont vides. Sélectionne au moins deux grandes pièces avant de préparer ExplodeView.');return;}
    ranked.forEach((item,rank)=>{
      item.s.action='explodeview';item.s.explodeOrder=rank+1;item.s.explodeMode=state.mode;
      item.s.explodeDirection=rank===ranked.length-1?'stay':'auto';
      if(!Number.isFinite(Number(item.s.intensity))||Number(item.s.intensity)===50)item.s.intensity=65;
    });
    window.dispatchEvent(new CustomEvent('happyholo:selection-plan',{detail:{count:selections.length,source:'explodeview-auto'}}));
    setTimeout(notify,30);
  }

  function disable(){
    for(const s of plan())if(s.action==='explodeview'){s.action='none';delete s.explodeOrder;delete s.explodeDirection;delete s.explodeMode;}
    window.dispatchEvent(new CustomEvent('happyholo:selection-plan',{detail:{count:plan().length,source:'explodeview-disable'}}));
    setTimeout(notify,30);
  }

  let panel=null,status=null,modeSelect=null;
  function ensurePanel(){
    const anchor=document.getElementById('happyHoloSelectionControls');
    if(!anchor||!plan().length)return;
    panel=document.getElementById('happyHoloExplodeViewControls');
    if(!panel){
      panel=document.createElement('section');panel.id='happyHoloExplodeViewControls';
      panel.style.cssText='background:linear-gradient(145deg,#071018,#102536);color:#fff;border:2px solid #28a8ee;border-radius:18px;padding:16px;margin:16px 0;box-shadow:0 12px 32px #00111f26';
      panel.innerHTML='<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap"><div><div style="font-size:20px;font-weight:900">⚙️ ExplodeView — machines</div><div style="font-size:12px;color:#bdd0df;line-height:1.45;margin-top:4px">Moto, voiture, outil, moteur, montre, appareil ou machine industrielle. Uniquement les grands sous-ensembles : pas de vis ni de micro-pièces.</div></div><span style="background:#28a8ee;color:#00121d;padding:6px 9px;border-radius:999px;font-size:12px;font-weight:900">9 vues progressives</span></div>';

      const aiBtn=document.createElement('button');aiBtn.type='button';aiBtn.textContent='🎯 IA — toucher une pièce';aiBtn.style.cssText='width:100%;margin:13px 0 0;min-height:50px;background:#fff;color:#071018;border:0;border-radius:11px;font-weight:950;font-size:16px;padding:10px 14px';
      const aiInfo=document.createElement('div');aiInfo.textContent='Nouveau : touche une roue, un phare, une selle ou un grand élément. SlimSAM calcule le masque complet, puis tu peux recommencer pour la pièce suivante.';aiInfo.style.cssText='margin-top:7px;color:#c9dce9;font-size:11px;line-height:1.45';
      aiBtn.addEventListener('click',async()=>{
        const old=aiBtn.textContent;aiBtn.disabled=true;aiBtn.textContent='Chargement du sélecteur IA…';
        try{const api=await loadSlimSAM();aiBtn.textContent=old;await api.open();}
        catch(e){console.error('[SlimSAM loader]',e);alert('Sélection IA indisponible : '+(e?.message||e));}
        finally{aiBtn.disabled=false;aiBtn.textContent=old;}
      });
      panel.append(aiBtn,aiInfo);

      const controls=document.createElement('div');controls.style.cssText='display:grid;grid-template-columns:minmax(170px,1fr) minmax(190px,1.35fr) minmax(150px,.8fr);gap:9px;margin-top:13px';
      modeSelect=document.createElement('select');[['Simple • 4–6 pièces','simple'],['Détaillé • 7–9 pièces','detailed'],['Technique • 10–12 pièces','technical']].forEach(([t,v])=>modeSelect.appendChild(new Option(t,v)));modeSelect.value=state.mode;modeSelect.style.cssText='width:100%;min-height:44px;padding:9px;border-radius:10px;border:1px solid #527085;background:#0b1a25;color:#fff;font-weight:800';
      const prepare=document.createElement('button');prepare.type='button';prepare.textContent='Répartir les pièces dans ExplodeView';prepare.style.cssText='margin:0;min-height:44px;background:#28a8ee;color:#00121d;border:0;border-radius:10px;font-weight:900;padding:9px 12px';
      const stop=document.createElement('button');stop.type='button';stop.textContent='Désactiver';stop.style.cssText='margin:0;min-height:44px;background:#233746;color:#fff;border:1px solid #527085;border-radius:10px;font-weight:800;padding:9px 12px';
      controls.append(modeSelect,prepare,stop);panel.appendChild(controls);
      status=document.createElement('div');status.style.cssText='margin-top:10px;padding:10px 11px;border-radius:10px;background:#ffffff12;color:#dce9f2;font-size:12px;line-height:1.4';panel.appendChild(status);
      const note=document.createElement('div');note.style.cssText='margin-top:8px;color:#9eb0bf;font-size:11px;line-height:1.45';note.textContent='Ordre automatique : les petites pièces périphériques partent d’abord ; la plus grande structure reste au centre. L’ordre et la direction restent modifiables dans chaque sélection.';panel.appendChild(note);
      modeSelect.addEventListener('change',()=>{state.mode=modeSelect.value;try{localStorage.setItem('happyholo:explodeview-mode',state.mode);}catch(_){}for(const s of explodeSelections())s.explodeMode=state.mode;notify();});
      prepare.addEventListener('click',configureAutomatically);stop.addEventListener('click',disable);
      anchor.insertAdjacentElement('afterend',panel);
      const mq=matchMedia('(max-width:720px)');const responsive=()=>controls.style.gridTemplateColumns=mq.matches?'1fr':'minmax(170px,1fr) minmax(190px,1.35fr) minmax(150px,.8fr)';responsive();mq.addEventListener?.('change',responsive);
    }else if(anchor.nextElementSibling!==panel)anchor.insertAdjacentElement('afterend',panel);
    updatePanel();
  }

  function updatePanel(){
    if(!panel)return ensurePanel();
    if(modeSelect)modeSelect.value=state.mode;
    if(status)status.textContent=statusText();
  }

  function setupMainSelectionButton(){
    const start=document.getElementById('startPieceSelection');
    const file=document.getElementById('file');
    const build=document.getElementById('build');
    const statusBox=document.getElementById('status');
    const autoEnabled=document.getElementById('autoPieceSelectionEnabled');
    if(!start||!file||!build||start.dataset.ready==='1')return;
    start.dataset.ready='1';

    build.addEventListener('click',()=>{
      window.HappyHoloPendingAutoPieceSplit=autoEnabled?.checked!==false;
    },true);

    start.addEventListener('click',()=>{
      if(!file.files?.length){
        window.HappyHoloPendingAutoPieceSplit=autoEnabled?.checked!==false;
        if(statusBox)statusBox.textContent='Choisis d’abord la photo de la machine.';
        file.scrollIntoView({block:'center',behavior:'smooth'});
        file.click();
        return;
      }
      if(statusBox)statusBox.textContent='Ouverture de l’écran de sélection des roues et des autres pièces…';
      window.HappyHoloPendingAutoPieceSplit=autoEnabled?.checked!==false;
      build.click();
    });
    const sync=()=>{
      start.disabled=build.disabled;
      start.textContent=build.disabled?'Ouverture de la sélection…':'Sélectionner les pièces de la machine';
    };
    new MutationObserver(sync).observe(build,{attributes:true,attributeFilter:['disabled']});
    sync();
  }

  function drawBackground(ctx,norm,W,H,api){
    if(window.HappyHoloCustomBackground?.draw?.(ctx,norm,W,H,{x:0,y:0,w:W,h:H}))return;
    const bg=api.bgImage?.();if(!bg)return;
    const f=api.fitCoverLocal(bg,W,H);const amplitude=Number(document.querySelector('#angle')?.value||7)/4,bgDepth=Number(document.querySelector('#bgDepth')?.value||.10);
    ctx.drawImage(bg,f.x+norm*6*amplitude*(bgDepth/.10),f.y,f.w,f.h);
  }

  function explodeRender(norm,target,baseRender){
    const selections=plan(),parts=explodeSelections(),api=renderer(),fx=engine();
    if(parts.length<2||!api||typeof fx?.buildExplodeFrame!=='function')return baseRender?.(norm,target);
    target=target||window.HappyHoloReliefState?.view;if(!target)return;
    const W=target.width,H=target.height,ctx=target.getContext('2d');ctx.clearRect(0,0,W,H);drawBackground(ctx,norm,W,H,api);
    const textDepth=Number(window.happyHoloTextLayer?.depth)||0;if(textDepth<0)window.HappyHoloTextLayer?.draw?.(ctx,norm,{x:0,y:0,w:W,h:H});
    const layers=new Map();selections.forEach((_,i)=>layers.set(i,api.getExclusiveLayer(i,W,H)));
    const valid=[...layers.values()].filter(Boolean);if(valid.length<2)return baseRender?.(norm,target);
    const phase=clamp((Number(norm)||0)+1,0,2)/2,amplitude=Number(document.querySelector('#angle')?.value||7)/4,subjectDepth=Number(document.querySelector('#subjectDepth')?.value||.48),commonShift=Number(norm||0)*18*amplitude*(subjectDepth/.30);
    const boxes=selections.map((s,i)=>s.action==='explodeview'?fx.alphaBounds?.(layers.get(i)):null).filter(Boolean);const groupCenter=boxes.length?{x:boxes.reduce((a,b)=>a+b.cx,0)/boxes.length,y:boxes.reduce((a,b)=>a+b.cy,0)/boxes.length}:{x:W/2,y:H/2};
    const ordered=selections.map((s,i)=>({s,i,d:Number(s.depth)||0})).sort((a,b)=>a.d-b.d);
    for(const item of ordered){
      const layer=layers.get(item.i);if(!layer)continue;const intensity=clamp(Number(item.s.intensity||50)/100,.1,1);
      if(item.s.action==='explodeview'){
        const moved=fx.buildExplodeFrame({layer,phase,intensity,W,H,selection:item.s,index:item.i,selections,layers,groupCenter});ctx.drawImage(moved,commonShift,0);continue;
      }
      const depthShift=Number(norm||0)*18*amplitude*clamp((Number(item.s.depth)||.02)/.30,.05,3);
      if(item.s.action&&item.s.action!=='none'){
        const rendered=document.createElement('canvas');rendered.width=W;rendered.height=H;fx.renderAction(rendered.getContext('2d'),layer,item.s,phase,W,H,{index:item.i,selections,layers});ctx.drawImage(rendered,depthShift,0);
      }else ctx.drawImage(layer,depthShift,0);
    }
    if(textDepth>=0)window.HappyHoloTextLayer?.draw?.(ctx,norm,{x:0,y:0,w:W,h:H});
  }

  const baseRender=window.renderAt;
  if(typeof baseRender==='function')window.renderAt=(norm,target)=>explodeRender(norm,target,baseRender);

  function serialize(){
    const parts=explodeSelections();if(parts.length<2)return null;
    return{effect:'explodeview',mode:state.mode,direction:'assembled-to-exploded',views:9,parts:parts.map((s,i)=>({name:s.name||`Pièce ${i+1}`,order:Number(s.explodeOrder)||i+1,direction:s.explodeDirection||'auto',intensity:Number(s.intensity)||65})),notes:'Déplacement progressif des grands sous-ensembles, sans vis ni micro-pièces. La simulation est continue ; l’impression reste composée de neuf vues.'};
  }

  window.HappyHoloExplodeView={state,configureAutomatically,disable,serialize,render:explodeRender,selectWithAI:async()=>{const api=await loadSlimSAM();return api.open();}};
  window.addEventListener('happyholo:selection-plan',()=>setTimeout(ensurePanel,40));
  window.addEventListener('happyholo-action-plan-changed',updatePanel);
  window.addEventListener('happyholo-relief-ready',()=>setTimeout(ensurePanel,60));
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{setupMainSelectionButton();setTimeout(ensurePanel,350);},{once:true});else{setupMainSelectionButton();setTimeout(ensurePanel,350);}
  console.log('[HAPPYHOLO] ExplodeView machines V3.8.2 + SlimSAM actif');
})();