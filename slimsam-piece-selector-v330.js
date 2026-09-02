/* HappyHolo V3.30 — sélection de grosses pièces par point avec SlimSAM */
(() => {
  'use strict';

  const MODEL='Xenova/slimsam-77-uniform';
  const LIB='https://cdn.jsdelivr.net/npm/@xenova/transformers@2.14.0';
  let apiPromise=null, modelPromise=null, processorPromise=null;
  let imageInputs=null, embeddings=null, rawImage=null, imageKey='';

  const plan=()=>Array.isArray(window.happyHoloSelectionPlan)?window.happyHoloSelectionPlan:null;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

  async function getApi(){
    if(!apiPromise) apiPromise=import(LIB).then(m=>{m.env.allowLocalModels=false;return m;});
    return apiPromise;
  }

  async function getModel(){
    const api=await getApi();
    modelPromise ||= api.SamModel.from_pretrained(MODEL,{quantized:true});
    processorPromise ||= api.AutoProcessor.from_pretrained(MODEL);
    return Promise.all([modelPromise,processorPromise]);
  }

  function fileToDataURL(file){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file);});}

  async function ensureEmbedding(file,setStatus){
    const key=`${file.name}:${file.size}:${file.lastModified}`;
    if(embeddings&&imageInputs&&imageKey===key)return;
    setStatus('Chargement de l’IA SlimSAM…');
    const [{RawImage},[model,processor],dataURL]=await Promise.all([getApi(),getModel(),fileToDataURL(file)]);
    setStatus('Analyse de la machine… première fois seulement.');
    rawImage=await RawImage.read(dataURL);
    imageInputs=await processor(rawImage);
    embeddings=await model.get_image_embeddings(imageInputs);
    imageKey=key;
    setStatus('IA prête — touche une grosse pièce.');
  }

  async function decodePoint(nx,ny){
    const api=await getApi();
    const [model,processor]=await getModel();
    const reshaped=imageInputs.reshaped_input_sizes[0];
    const x=clamp(nx,0,1)*reshaped[1], y=clamp(ny,0,1)*reshaped[0];
    const input_points=new api.Tensor('float32',[x,y],[1,1,1,2]);
    const input_labels=new api.Tensor('int64',[1n],[1,1,1]);
    const out=await model({...embeddings,input_points,input_labels});
    const masks=await processor.post_process_masks(out.pred_masks,imageInputs.original_sizes,imageInputs.reshaped_input_sizes);
    return {mask:api.RawImage.fromTensor(masks[0][0]),scores:Array.from(out.iou_scores.data)};
  }

  function bestMaskToImageData(result,targetW,targetH,baseMask){
    const {mask,scores}=result;
    let best=0;for(let i=1;i<scores.length;i++)if(scores[i]>scores[best])best=i;
    const src=document.createElement('canvas');src.width=mask.width;src.height=mask.height;
    const sctx=src.getContext('2d');const img=sctx.createImageData(mask.width,mask.height);
    const count=scores.length;
    for(let i=0;i<mask.width*mask.height;i++)if(mask.data[count*i+best]===1){const o=i*4;img.data[o]=255;img.data[o+1]=255;img.data[o+2]=255;img.data[o+3]=255;}
    sctx.putImageData(img,0,0);
    const dst=document.createElement('canvas');dst.width=targetW;dst.height=targetH;
    const dctx=dst.getContext('2d',{willReadFrequently:true});dctx.imageSmoothingEnabled=false;dctx.drawImage(src,0,0,targetW,targetH);
    const out=dctx.getImageData(0,0,targetW,targetH);
    if(baseMask?.data){for(let i=0;i<targetW*targetH;i++){const o=i*4;out.data[o+3]=Math.min(out.data[o+3],baseMask.data[o+3]||0);}}
    return {imageData:out,score:scores[best]||0};
  }

  function addSelection(mask,score){
    const selections=plan();if(!selections)return;
    const mode=window.HappyHoloExplodeViewState?.mode||'simple';
    const existing=selections.filter(s=>s?.source==='slimsam').length;
    selections.push({
      id:Date.now()+Math.random(),name:`Pièce IA ${existing+1}`,depth:.34+existing*.025,action:'explodeview',intensity:65,timing:'all',actionZones:[],
      explodeOrder:existing+1,explodeDirection:'auto',explodeMode:mode,source:'slimsam',confidence:Number(score)||0,
      mask,initialMask:new ImageData(new Uint8ClampedArray(mask.data),mask.width,mask.height)
    });
    window.dispatchEvent(new CustomEvent('happyholo:selection-plan',{detail:{count:selections.length,source:'slimsam-point'}}));
    window.dispatchEvent(new CustomEvent('happyholo-action-plan-changed'));
  }

  async function open(){
    const selections=plan();const file=document.getElementById('file')?.files?.[0];
    if(!file){alert('Choisis d’abord la photo de la machine.');return;}
    if(!selections?.[0]?.mask){alert('Crée d’abord le relief pour obtenir le détourage global de la machine.');return;}

    const overlay=document.createElement('div');overlay.style.cssText='position:fixed;inset:0;z-index:10000100;background:#05080bf2;color:white;display:flex;flex-direction:column;padding:max(12px,env(safe-area-inset-top)) 12px 12px;box-sizing:border-box';
    const top=document.createElement('div');top.style.cssText='display:flex;gap:8px;align-items:center;justify-content:space-between;flex-wrap:wrap;margin-bottom:8px';
    const title=document.createElement('div');title.innerHTML='<b style="font-size:19px">IA — toucher une pièce</b><div style="font-size:12px;color:#bdd0df">Touche roue, selle, phare, réservoir, moteur… une pièce à la fois.</div>';
    const done=document.createElement('button');done.textContent='Terminer';done.style.cssText='min-height:42px;padding:8px 16px;border:0;border-radius:10px;background:#28a8ee;color:#00121d;font-weight:900';top.append(title,done);
    const status=document.createElement('div');status.textContent='Préparation…';status.style.cssText='padding:9px 11px;border-radius:10px;background:#142531;color:#dce9f2;font-size:12px;margin-bottom:8px';
    const stage=document.createElement('div');stage.style.cssText='position:relative;flex:1;min-height:260px;overflow:hidden;border:2px solid #28a8ee;border-radius:14px;background:#111;touch-action:manipulation';
    const img=document.createElement('img');img.style.cssText='position:absolute;inset:0;width:100%;height:100%;object-fit:contain;user-select:none;-webkit-user-drag:none';
    const maskCanvas=document.createElement('canvas');maskCanvas.style.cssText='position:absolute;inset:0;width:100%;height:100%;object-fit:contain;pointer-events:none;opacity:.55';
    stage.append(img,maskCanvas);overlay.append(top,status,stage);document.body.appendChild(overlay);
    done.onclick=()=>overlay.remove();

    const dataURL=await fileToDataURL(file);img.src=dataURL;
    await new Promise((res,rej)=>{img.onload=res;img.onerror=rej;});
    try{await ensureEmbedding(file,t=>status.textContent=t);}catch(e){status.textContent='SlimSAM indisponible : '+(e?.message||e);return;}

    let busy=false;
    stage.addEventListener('click',async e=>{
      if(busy)return;busy=true;
      try{
        const r=stage.getBoundingClientRect();
        const iw=img.naturalWidth,ih=img.naturalHeight,scale=Math.min(r.width/iw,r.height/ih),dw=iw*scale,dh=ih*scale,ox=(r.width-dw)/2,oy=(r.height-dh)/2;
        const px=e.clientX-r.left-ox,py=e.clientY-r.top-oy;if(px<0||py<0||px>dw||py>dh){busy=false;return;}
        status.textContent='Segmentation de la pièce…';
        const result=await decodePoint(px/dw,py/dh);
        const base=selections[0].mask;const converted=bestMaskToImageData(result,base.width,base.height,base);
        addSelection(converted.imageData,converted.score);
        maskCanvas.width=base.width;maskCanvas.height=base.height;const c=maskCanvas.getContext('2d');c.clearRect(0,0,base.width,base.height);c.putImageData(converted.imageData,0,0);
        status.textContent=`Pièce ajoutée • confiance ${(converted.score*100).toFixed(0)} %. Touche la suivante ou Termine.`;
      }catch(err){console.error('[SlimSAM]',err);status.textContent='Sélection impossible : '+(err?.message||err);}finally{busy=false;}
    });
  }

  window.HappyHoloSlimSAM={open};
  window.dispatchEvent(new CustomEvent('happyholo-slimsam-ready'));
  console.log('[HAPPYHOLO] SlimSAM point selector V3.30 chargé');
})();
