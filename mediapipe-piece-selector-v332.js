/* HappyHolo V3.32 — MediaPipe MagicTouch interactive machine part selector */
(() => {
  'use strict';

  const LIB='https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/+esm';
  const WASM='https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm';
  const MODEL='https://storage.googleapis.com/mediapipe-models/interactive_segmenter_v2/magic_touch/int8/1/interactive_segmentation.task';
  let apiPromise=null, segmenterPromise=null, activeImageKey='';

  const plan=()=>Array.isArray(window.happyHoloSelectionPlan)?window.happyHoloSelectionPlan:null;
  const cloneImageData=m=>new ImageData(new Uint8ClampedArray(m.data),m.width,m.height);

  async function getApi(){
    apiPromise ||= import(LIB);
    return apiPromise;
  }

  async function getSegmenter(setStatus){
    if(!segmenterPromise){
      segmenterPromise=(async()=>{
        setStatus?.('Chargement MediaPipe MagicTouch…');
        const api=await getApi();
        const vision=await api.FilesetResolver.forVisionTasks(WASM);
        setStatus?.('Chargement du modèle MagicTouch…');
        return api.InteractiveSegmenter.createFromOptions(vision,{
          baseOptions:{modelAssetPath:MODEL,delegate:'CPU'}
        });
      })();
    }
    return segmenterPromise;
  }

  function fileToDataURL(file){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file);});}

  function maskToImageData(mask,targetW,targetH,baseMask,threshold){
    const srcW=mask.width,srcH=mask.height;
    const values=mask.getAsFloat32Array();
    const src=document.createElement('canvas');src.width=srcW;src.height=srcH;
    const sctx=src.getContext('2d',{willReadFrequently:true});
    const out=sctx.createImageData(srcW,srcH);
    const t=Number(threshold)||0.45;
    for(let i=0;i<srcW*srcH;i++){
      const a=values[i]>=t?Math.min(255,Math.max(0,Math.round(values[i]*255))):0;
      const o=i*4;out.data[o]=255;out.data[o+1]=214;out.data[o+2]=10;out.data[o+3]=a;
    }
    sctx.putImageData(out,0,0);
    const dst=document.createElement('canvas');dst.width=targetW;dst.height=targetH;
    const dctx=dst.getContext('2d',{willReadFrequently:true});dctx.imageSmoothingEnabled=false;dctx.drawImage(src,0,0,targetW,targetH);
    const converted=dctx.getImageData(0,0,targetW,targetH);
    if(baseMask?.data){
      for(let i=0;i<targetW*targetH;i++){
        const o=i*4;
        converted.data[o+3]=Math.min(converted.data[o+3],baseMask.data[o+3]||0);
      }
    }
    return converted;
  }

  function addSelection(mask){
    const selections=plan();if(!selections)return;
    const mode=window.HappyHoloExplodeViewState?.mode||'simple';
    const existing=selections.filter(s=>s?.source==='mediapipe-magic-touch').length;
    selections.push({
      id:Date.now()+Math.random(),name:`Pièce IA ${existing+1}`,depth:.34+existing*.025,
      action:'explodeview',intensity:65,timing:'all',actionZones:[],explodeOrder:existing+1,
      explodeDirection:'auto',explodeMode:mode,source:'mediapipe-magic-touch',confidence:1,
      mask,initialMask:cloneImageData(mask)
    });
    window.dispatchEvent(new CustomEvent('happyholo:selection-plan',{detail:{count:selections.length,source:'mediapipe-magic-touch'}}));
    window.dispatchEvent(new CustomEvent('happyholo-action-plan-changed'));
  }

  async function open(){
    const selections=plan();const file=document.getElementById('file')?.files?.[0];
    if(!file){alert('Choisis d’abord la photo de la machine.');return;}
    if(!selections?.[0]?.mask){alert('Crée d’abord le relief pour obtenir le détourage global de la machine.');return;}

    const overlay=document.createElement('div');
    overlay.style.cssText='position:fixed;inset:0;z-index:10000150;background:#05080bf5;color:#fff;display:flex;flex-direction:column;padding:max(10px,env(safe-area-inset-top)) 10px max(10px,env(safe-area-inset-bottom));box-sizing:border-box;font-family:system-ui,sans-serif';
    const head=document.createElement('div');head.style.cssText='display:flex;justify-content:space-between;gap:8px;align-items:flex-start;margin-bottom:8px';
    const title=document.createElement('div');title.innerHTML='<b style="font-size:19px">Magic Touch — sélection d’une pièce</b><div style="font-size:12px;color:#c7d7e3;margin-top:3px">Vert = ajouter à la pièce · Rouge = retirer une zone · puis Valider la pièce.</div>';
    const finish=document.createElement('button');finish.textContent='Terminer';finish.style.cssText='margin:0;background:#eee;color:#111;border:0;border-radius:10px;padding:10px 14px;font-weight:900';head.append(title,finish);

    const controls=document.createElement('div');controls.style.cssText='display:flex;gap:7px;flex-wrap:wrap;margin-bottom:8px';
    const mk=(txt,bg)=>{const b=document.createElement('button');b.textContent=txt;b.style.cssText=`margin:0;border:0;border-radius:10px;padding:10px 12px;font-weight:900;background:${bg};color:#111`;return b};
    const plus=mk('➕ Ajouter','#76e59a'),minus=mk('➖ Retirer','#ff8f8f'),reset=mk('↺ Refaire pièce','#ddd'),validate=mk('✓ Valider la pièce','#62c7ff');
    controls.append(plus,minus,reset,validate);

    const thresholdWrap=document.createElement('label');thresholdWrap.style.cssText='display:flex;align-items:center;gap:8px;font-size:12px;margin:0 0 8px;color:#d9e5ed';
    thresholdWrap.innerHTML='Précision du bord <input type="range" min="25" max="75" value="45" step="5" style="flex:1"><b>45%</b>';
    const threshold=thresholdWrap.querySelector('input'),thresholdOut=thresholdWrap.querySelector('b');

    const status=document.createElement('div');status.textContent='Préparation…';status.style.cssText='padding:9px 11px;border-radius:10px;background:#142531;color:#dce9f2;font-size:12px;margin-bottom:8px';
    const stage=document.createElement('div');stage.style.cssText='position:relative;flex:1;min-height:260px;overflow:hidden;border:2px solid #28a8ee;border-radius:14px;background:#111;touch-action:none';
    const img=document.createElement('img');img.style.cssText='position:absolute;inset:0;width:100%;height:100%;object-fit:contain;user-select:none;-webkit-user-drag:none;pointer-events:none';
    const maskCanvas=document.createElement('canvas');maskCanvas.style.cssText='position:absolute;inset:0;width:100%;height:100%;object-fit:contain;pointer-events:none;opacity:.62';
    const strokeCanvas=document.createElement('canvas');strokeCanvas.style.cssText='position:absolute;inset:0;width:100%;height:100%;object-fit:contain;pointer-events:none';
    stage.append(img,maskCanvas,strokeCanvas);overlay.append(head,controls,thresholdWrap,status,stage);document.body.appendChild(overlay);

    finish.onclick=()=>overlay.remove();
    let brush='positive',strokes=[],currentMask=null,busy=false,pointerDown=false,currentPoints=[];
    const setBrush=(v)=>{brush=v;plus.style.outline=v==='positive'?'3px solid #fff':'none';minus.style.outline=v==='negative'?'3px solid #fff':'none';status.textContent=v==='positive'?'Mode AJOUTER : touche ou trace dans la pièce.':'Mode RETIRER : touche ou trace sur ce qui ne doit pas être sélectionné.';};
    plus.onclick=()=>setBrush('positive');minus.onclick=()=>setBrush('negative');setBrush('positive');

    const dataURL=await fileToDataURL(file);img.src=dataURL;
    await new Promise((res,rej)=>{img.onload=res;img.onerror=rej;});
    const base=selections[0].mask;maskCanvas.width=strokeCanvas.width=base.width;maskCanvas.height=strokeCanvas.height=base.height;

    let segmenter;
    try{
      segmenter=await getSegmenter(t=>status.textContent=t);
      const key=`${file.name}:${file.size}:${file.lastModified}`;
      if(activeImageKey!==key){status.textContent='Analyse de la photo…';segmenter.setImage(img);activeImageKey=key;}
      status.textContent='Prêt. Mode AJOUTER : touche la roue, selle, phare, moteur…';
    }catch(e){console.error('[MagicTouch init]',e);status.textContent='MediaPipe indisponible : '+(e?.message||e);return;}

    function containPoint(ev){
      const r=stage.getBoundingClientRect(),iw=img.naturalWidth,ih=img.naturalHeight;
      const scale=Math.min(r.width/iw,r.height/ih),dw=iw*scale,dh=ih*scale,ox=(r.width-dw)/2,oy=(r.height-dh)/2;
      const px=ev.clientX-r.left-ox,py=ev.clientY-r.top-oy;
      if(px<0||py<0||px>dw||py>dh)return null;
      return {x:px/dw,y:py/dh};
    }

    function drawStrokes(){
      const c=strokeCanvas.getContext('2d');c.clearRect(0,0,strokeCanvas.width,strokeCanvas.height);
      const all=currentPoints.length?[...strokes,{brushMode:brush,point:currentPoints,isCompleted:false}]:strokes;
      for(const s of all){
        if(!s.point?.length)continue;c.save();c.strokeStyle=s.brushMode==='negative'?'#ff3b30':'#34c759';c.fillStyle=c.strokeStyle;c.lineWidth=5;c.lineCap='round';c.lineJoin='round';
        if(s.point.length===1){const p=s.point[0];c.beginPath();c.arc(p.x*c.canvas.width,p.y*c.canvas.height,7,0,Math.PI*2);c.fill();c.strokeStyle='#fff';c.lineWidth=2;c.stroke();}
        else{c.beginPath();c.moveTo(s.point[0].x*c.canvas.width,s.point[0].y*c.canvas.height);for(let i=1;i<s.point.length;i++)c.lineTo(s.point[i].x*c.canvas.width,s.point[i].y*c.canvas.height);c.stroke();}c.restore();
      }
    }

    async function recompute(){
      if(busy||!strokes.length)return;busy=true;validate.disabled=true;
      try{
        status.textContent='Calcul précis des limites de la pièce…';
        const api=await getApi();
        const formatted=strokes.map(s=>({brushMode:s.brushMode==='negative'?(api.BrushMode?.NEGATIVE??2):(api.BrushMode?.POSITIVE??1),point:s.point,isCompleted:true}));
        const result=segmenter.segment(formatted);
        const mpMask=result?.confidenceMasks?.[0]||result?.categoryMask||result;
        if(!mpMask?.getAsFloat32Array)throw new Error('Masque MediaPipe non reçu');
        currentMask=maskToImageData(mpMask,base.width,base.height,base,Number(threshold.value)/100);
        const c=maskCanvas.getContext('2d');c.clearRect(0,0,base.width,base.height);c.putImageData(currentMask,0,0);
        status.textContent='Sélection proposée. Corrige avec Ajouter/Retirer, puis Valider la pièce.';
      }catch(e){console.error('[MagicTouch segment]',e);status.textContent='Erreur de segmentation : '+(e?.message||e);}finally{busy=false;validate.disabled=false;}
    }

    stage.addEventListener('pointerdown',ev=>{if(busy)return;const p=containPoint(ev);if(!p)return;pointerDown=true;currentPoints=[p];stage.setPointerCapture?.(ev.pointerId);drawStrokes();});
    stage.addEventListener('pointermove',ev=>{if(!pointerDown)return;const p=containPoint(ev);if(!p)return;const last=currentPoints[currentPoints.length-1];if(!last||Math.hypot(p.x-last.x,p.y-last.y)>.008){currentPoints.push(p);drawStrokes();}});
    const endPointer=async ev=>{if(!pointerDown)return;pointerDown=false;if(currentPoints.length){strokes.push({brushMode:brush,point:[...currentPoints],isCompleted:true});currentPoints=[];drawStrokes();await recompute();}try{stage.releasePointerCapture?.(ev.pointerId)}catch(_){}};
    stage.addEventListener('pointerup',endPointer);stage.addEventListener('pointercancel',endPointer);

    reset.onclick=()=>{strokes=[];currentPoints=[];currentMask=null;maskCanvas.getContext('2d').clearRect(0,0,base.width,base.height);drawStrokes();status.textContent='Pièce effacée. Touche à nouveau une zone à conserver.';setBrush('positive');};
    threshold.oninput=()=>{thresholdOut.textContent=threshold.value+'%';if(strokes.length)recompute();};
    validate.onclick=()=>{if(!currentMask){status.textContent='Sélectionne d’abord une pièce.';return;}addSelection(cloneImageData(currentMask));strokes=[];currentPoints=[];currentMask=null;maskCanvas.getContext('2d').clearRect(0,0,base.width,base.height);drawStrokes();setBrush('positive');status.textContent='Pièce validée. Touche maintenant la pièce suivante.';};
  }

  window.HappyHoloMagicTouch={open};
  window.dispatchEvent(new CustomEvent('happyholo-magictouch-ready'));
  console.log('[HAPPYHOLO] MediaPipe MagicTouch V3.32 chargé');
})();
