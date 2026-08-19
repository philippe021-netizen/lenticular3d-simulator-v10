const $=s=>document.querySelector(s);

const file=$('#file');
const view=$('#view');
const status=$('#status');
const buildBtn=$('#build');
const exportBtn=$('#export');
const downloadBtn=$('#download');
const framesEl=$('#frames');

const prepareTarget=$('#prepareTarget');
const cardOrientation=$('#cardOrientation');
const orientationAdvice=$('#orientationAdvice');
const prepareCreativity=$('#prepareCreativity');
const prepareCreativityOut=$('#prepareCreativityOut');
const prepareOutpaint=$('#prepareOutpaint');
const prepareReset=$('#prepareReset');
const prepareStatus=$('#prepareStatus');

const subjectDepth=$('#subjectDepth');
const bgDepth=$('#bgDepth');
const angle=$('#angle');
const edgeProtect=$('#edgeProtect');

const subjectOut=$('#subjectOut');
const bgOut=$('#bgOut');
const angleOut=$('#angleOut');
const edgeOut=$('#edgeOut');

[subjectDepth,bgDepth,angle,edgeProtect].forEach(el=>{
  el.addEventListener('input',()=>{
    subjectOut.textContent=Number(subjectDepth.value).toFixed(2);
    bgOut.textContent=Number(bgDepth.value).toFixed(2);
    angleOut.textContent=`±${angle.value}°`;
    edgeOut.textContent=`${edgeProtect.value}%`;
  });
});

let sourceFile=null;
let originalSourceFile=null;
let originalSourceImg=null;
let aiPrepared=false;
let sourceImg=null;
let subjectImg=null;
let backgroundImg=null;
let subjectDepthCanvas=null;
let backgroundDepthCanvas=null;
let subjectAlphaCanvas=null;
let anim=0;
let exported=[];
let reliefReady=false;
window.LentiRelief32={ready:false};

function setStatus(t){ status.textContent=t; }
function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }

function blobToImage(blob){
  return new Promise((resolve,reject)=>{
    const u=URL.createObjectURL(blob);
    const im=new Image();
    im.onload=()=>{ URL.revokeObjectURL(u); resolve(im); };
    im.onerror=e=>{ URL.revokeObjectURL(u); reject(e); };
    im.src=u;
  });
}

function fileToImage(f){ return blobToImage(f); }

function canvasToBlob(canvas){
  return new Promise((resolve,reject)=>{
    canvas.toBlob(b=>b?resolve(b):reject(new Error('Impossible de créer le PNG.')),'image/png');
  });
}

function fitContain(img,W,H){
  const s=Math.min(W/img.naturalWidth,H/img.naturalHeight);
  const w=img.naturalWidth*s, h=img.naturalHeight*s;
  return {x:(W-w)/2,y:(H-h)/2,w,h};
}

function fitCover(img,W,H){
  const s=Math.max(W/img.naturalWidth,H/img.naturalHeight);
  const w=img.naturalWidth*s, h=img.naturalHeight*s;
  return {x:(W-w)/2,y:(H-h)/2,w,h};
}

/* =========================================================
   1 — DETOURAGE LOCAL
   @imgly/background-removal tourne dans le navigateur.
========================================================= */

async function localRemoveBackground(file){
  setStatus('1/5 Chargement du moteur de détourage local…');

  const mod = await import('https://esm.sh/@imgly/background-removal');
  const removeBackground = mod.removeBackground || mod.default;

  if(typeof removeBackground!=='function'){
    throw new Error('Moteur de détourage local indisponible.');
  }

  const result = await removeBackground(file,{
    progress:(key,current,total)=>{
      if(Number.isFinite(current) && Number.isFinite(total) && total>0){
        const p=Math.round(current/total*100);
        setStatus(`1/5 Détourage local… ${p}%`);
      }else{
        setStatus('1/5 Détourage local…');
      }
    }
  });

  return result;
}

/* =========================================================
   2 — ALPHA / MASQUE
========================================================= */

function makeAlphaCanvas(subject){
  const maxSide=900;
  const s=Math.min(1,maxSide/Math.max(subject.naturalWidth,subject.naturalHeight));
  const w=Math.max(64,Math.round(subject.naturalWidth*s));
  const h=Math.max(64,Math.round(subject.naturalHeight*s));

  const c=document.createElement('canvas');
  c.width=w;c.height=h;

  const x=c.getContext('2d',{willReadFrequently:true});
  x.drawImage(subject,0,0,w,h);

  const d=x.getImageData(0,0,w,h);

  const a=document.createElement('canvas');
  a.width=w;a.height=h;
  const ax=a.getContext('2d');
  const out=ax.createImageData(w,h);

  for(let i=0;i<w*h;i++){
    const alpha=d.data[i*4+3];
    out.data[i*4]=alpha;
    out.data[i*4+1]=alpha;
    out.data[i*4+2]=alpha;
    out.data[i*4+3]=255;
  }

  ax.putImageData(out,0,0);
  return a;
}

/* =========================================================
   3 — RECONSTRUCTION LOCALE DU FOND
   Pas de vraie "inpainting" générative : on propage
   progressivement les pixels voisins dans la zone masquée,
   puis on lisse uniquement la zone reconstruite.
========================================================= */

async function reconstructBackground(original, alphaCanvas){
  setStatus('2/5 Reconstruction locale du fond…');

  const maxSide=900;
  const s=Math.min(1,maxSide/Math.max(original.naturalWidth,original.naturalHeight));
  const w=Math.max(64,Math.round(original.naturalWidth*s));
  const h=Math.max(64,Math.round(original.naturalHeight*s));

  const c=document.createElement('canvas');
  c.width=w;c.height=h;
  const x=c.getContext('2d',{willReadFrequently:true});
  x.drawImage(original,0,0,w,h);

  const img=x.getImageData(0,0,w,h);
  const alphaCtx=alphaCanvas.getContext('2d',{willReadFrequently:true});
  const alpha=alphaCtx.getImageData(0,0,alphaCanvas.width,alphaCanvas.height).data;

  // redimension alpha si nécessaire
  let mask;
  if(alphaCanvas.width===w && alphaCanvas.height===h){
    mask=new Uint8Array(w*h);
    for(let i=0;i<w*h;i++) mask[i]=alpha[i*4];
  }else{
    const ac=document.createElement('canvas');ac.width=w;ac.height=h;
    const acx=ac.getContext('2d',{willReadFrequently:true});
    acx.drawImage(alphaCanvas,0,0,w,h);
    const ad=acx.getImageData(0,0,w,h).data;
    mask=new Uint8Array(w*h);
    for(let i=0;i<w*h;i++) mask[i]=ad[i*4];
  }

  // dilate mask so hair fringe is also removed
  const dilated=new Uint8Array(mask);
  const r=5;
  for(let y=0;y<h;y++){
    for(let xx=0;xx<w;xx++){
      if(mask[y*w+xx]<20) continue;
      for(let yy=Math.max(0,y-r);yy<=Math.min(h-1,y+r);yy++){
        for(let x2=Math.max(0,xx-r);x2<=Math.min(w-1,xx+r);x2++){
          dilated[yy*w+x2]=255;
        }
      }
    }
  }

  const data=img.data;
  const filled=new Uint8Array(w*h);
  for(let i=0;i<w*h;i++) filled[i]=dilated[i]<30 ? 1 : 0;

  // propagation multi-pass depuis l'extérieur vers l'intérieur
  const passes=42;
  for(let pass=0;pass<passes;pass++){
    let changed=0;
    const next=[];
    for(let y=1;y<h-1;y++){
      for(let xx=1;xx<w-1;xx++){
        const idx=y*w+xx;
        if(filled[idx]) continue;

        let sr=0,sg=0,sb=0,n=0;
        const ns=[idx-1,idx+1,idx-w,idx+w,idx-w-1,idx-w+1,idx+w-1,idx+w+1];
        for(const ni of ns){
          if(!filled[ni]) continue;
          sr+=data[ni*4];
          sg+=data[ni*4+1];
          sb+=data[ni*4+2];
          n++;
        }
        if(n>=2){
          next.push([idx,sr/n,sg/n,sb/n]);
        }
      }
    }

    for(const [idx,r0,g0,b0] of next){
      data[idx*4]=r0;
      data[idx*4+1]=g0;
      data[idx*4+2]=b0;
      data[idx*4+3]=255;
      filled[idx]=1;
      changed++;
    }

    if(pass%8===0){
      setStatus(`2/5 Reconstruction locale du fond… passe ${pass+1}/${passes}`);
      await sleep(0);
    }

    if(!changed) break;
  }

  // dernier secours pour petits trous
  for(let i=0;i<w*h;i++){
    if(filled[i]) continue;
    data[i*4]=data[Math.max(0,i-1)*4];
    data[i*4+1]=data[Math.max(0,i-1)*4+1];
    data[i*4+2]=data[Math.max(0,i-1)*4+2];
    data[i*4+3]=255;
  }

  x.putImageData(img,0,0);

  // lissage modéré du fond reconstruit
  const blurred=document.createElement('canvas');
  blurred.width=w;blurred.height=h;
  const bx=blurred.getContext('2d');
  bx.filter='blur(5px)';
  bx.drawImage(c,0,0);
  bx.filter='none';

  const out=document.createElement('canvas');
  out.width=w;out.height=h;
  const ox=out.getContext('2d');
  ox.drawImage(c,0,0);

  // uniquement dans la zone retirée, fond légèrement lissé
  ox.save();
  ox.globalCompositeOperation='source-over';

  const maskCanvas=document.createElement('canvas');
  maskCanvas.width=w;maskCanvas.height=h;
  const mx=maskCanvas.getContext('2d');
  const mid=mx.createImageData(w,h);
  for(let i=0;i<w*h;i++){
    const v=dilated[i];
    mid.data[i*4]=255;mid.data[i*4+1]=255;mid.data[i*4+2]=255;mid.data[i*4+3]=v;
  }
  mx.putImageData(mid,0,0);

  const patch=document.createElement('canvas');
  patch.width=w;patch.height=h;
  const px=patch.getContext('2d');
  px.drawImage(blurred,0,0);
  px.globalCompositeOperation='destination-in';
  px.drawImage(maskCanvas,0,0);

  ox.drawImage(patch,0,0);
  ox.restore();

  return await canvasToBlob(out);
}

/* =========================================================
   4 — DEPTH ANYTHING LOCAL
========================================================= */

let estimator=null;

async function getEstimator(){
  if(estimator) return estimator;

  setStatus('3/5 Chargement de Depth Anything…');

  const {pipeline,env}=await import(
    'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/+esm'
  );

  env.allowLocalModels=false;

  estimator=await pipeline(
    'depth-estimation',
    'onnx-community/depth-anything-v2-small',
    {dtype:'q4'}
  );

  return estimator;
}

async function estimateDepth(img,label){
  setStatus(label);

  const maxSide=720;
  const s=Math.min(1,maxSide/Math.max(img.naturalWidth,img.naturalHeight));
  const w=Math.max(64,Math.round(img.naturalWidth*s));
  const h=Math.max(64,Math.round(img.naturalHeight*s));

  const c=document.createElement('canvas');
  c.width=w;c.height=h;
  c.getContext('2d').drawImage(img,0,0,w,h);

  const blob=await new Promise(r=>c.toBlob(r,'image/jpeg',.9));
  const u=URL.createObjectURL(blob);

  try{
    const est=await getEstimator();
    const r=await est(u);
    const raw=r.depth;

    const src=document.createElement('canvas');
    src.width=raw.width;src.height=raw.height;
    const sx=src.getContext('2d');
    const id=sx.createImageData(raw.width,raw.height);

    for(let i=0;i<raw.width*raw.height;i++){
      const v=raw.data[i];
      id.data[i*4]=v;
      id.data[i*4+1]=v;
      id.data[i*4+2]=v;
      id.data[i*4+3]=255;
    }

    sx.putImageData(id,0,0);

    const out=document.createElement('canvas');
    out.width=w;out.height=h;
    const ox=out.getContext('2d');
    ox.filter='blur(3px)';
    ox.drawImage(src,0,0,w,h);
    ox.filter='none';

    return out;
  }finally{
    URL.revokeObjectURL(u);
  }
}

/* =========================================================
   5 — RENDU MULTICOUCHE
========================================================= */

function renderAt(norm,target=view){
  const x=target.getContext('2d');
  const W=target.width,H=target.height;
  x.clearRect(0,0,W,H);

  const amplitude=Number(angle.value)/4;
  const bgK=Number(bgDepth.value)/0.10;
  const subK=Number(subjectDepth.value)/0.30;
  const protect=Number(edgeProtect.value)/100;

  // Fond : mouvement faible.
  const fb=fitCover(backgroundImg,W,H);
  const bgShift=norm*6*amplitude*bgK;
  x.drawImage(backgroundImg,fb.x+bgShift,fb.y,fb.w,fb.h);

  // Sujet détouré sur canvas temporaire.
  const tmp=document.createElement('canvas');
  tmp.width=W;tmp.height=H;
  const tx=tmp.getContext('2d');

  const fs=fitCover(subjectImg,W,H);
  tx.drawImage(subjectImg,fs.x,fs.y,fs.w,fs.h);

  const subShift=norm*18*amplitude*subK;

  // Déformation interne limitée : 96 bandes verticales.
  // Le déplacement principal est une translation du sujet entier.
  const strips=96;
  const sw=W/strips;

  let depthData=null;
  try{
    const dctx=subjectDepthCanvas.getContext('2d',{willReadFrequently:true});
    depthData=dctx.getImageData(0,0,subjectDepthCanvas.width,subjectDepthCanvas.height).data;
  }catch{}

  for(let i=0;i<strips;i++){
    const sx=Math.floor(i*W/strips);
    const ex=Math.floor((i+1)*W/strips);
    const ww=Math.max(1,ex-sx);

    let d=.5;
    if(depthData){
      const dx=Math.min(subjectDepthCanvas.width-1,Math.floor((i+.5)/strips*subjectDepthCanvas.width));
      const dy=Math.floor(subjectDepthCanvas.height*.52);
      d=depthData[(dy*subjectDepthCanvas.width+dx)*4]/255;
    }

    // Très faible différentiel interne pour éviter les cheveux qui bavent.
    const local=(d-.5)*2;
    const internal=subShift*local*(0.10*(1-protect)+0.025);

    x.drawImage(
      tmp,
      sx,0,ww,H,
      sx+subShift+internal,0,ww+1,H
    );
  }

  // Overlay stabilisateur des contours.
  x.globalAlpha=0.24+protect*0.28;
  x.drawImage(tmp,subShift,0);
  x.globalAlpha=1;
}

function startPreview(){
  cancelAnimationFrame(anim);
  const t0=performance.now();

  const loop=t=>{
    const p=Math.sin((t-t0)/5200*Math.PI*2);
    renderAt(p);
    anim=requestAnimationFrame(loop);
  };

  anim=requestAnimationFrame(loop);
}

/* =========================================================
   UI
========================================================= */


function imageToJpegBlob(img,maxSide=1600){
  const scale=Math.min(1,maxSide/Math.max(img.naturalWidth,img.naturalHeight));
  const c=document.createElement('canvas');
  c.width=Math.max(64,Math.round(img.naturalWidth*scale));
  c.height=Math.max(64,Math.round(img.naturalHeight*scale));
  const cx=c.getContext('2d');
  cx.drawImage(img,0,0,c.width,c.height);
  return new Promise((resolve,reject)=>{
    c.toBlob(b=>b?resolve(b):reject(new Error('Conversion image impossible.')),'image/jpeg',0.94);
  });
}


function cropRetentionForRatio(w,h,targetRatio){
  const sourceRatio=w/h;

  if(sourceRatio>targetRatio){
    // Too wide: height fits, width is cropped.
    const keptW=h*targetRatio;
    return Math.min(1,keptW/w);
  }else{
    // Too tall: width fits, height is cropped.
    const keptH=w/targetRatio;
    return Math.min(1,keptH/h);
  }
}

function extensionFractionForRatio(w,h,targetRatio){
  const sourceArea=w*h;
  const sourceRatio=w/h;

  let targetW=w,targetH=h;

  if(sourceRatio<targetRatio){
    targetW=h*targetRatio;
  }else if(sourceRatio>targetRatio){
    targetH=w/targetRatio;
  }

  const targetArea=targetW*targetH;
  return Math.max(0,(targetArea-sourceArea)/sourceArea);
}

function bestCardOrientation(w,h){
  const landscapeRatio=85.6/54;
  const portraitRatio=54/85.6;

  const landRetention=cropRetentionForRatio(w,h,landscapeRatio);
  const portRetention=cropRetentionForRatio(w,h,portraitRatio);

  const landExtension=extensionFractionForRatio(w,h,landscapeRatio);
  const portExtension=extensionFractionForRatio(w,h,portraitRatio);

  // Prefer orientation requiring less extension; use retention as tie-breaker.
  let best='landscape';
  if(portExtension < landExtension - 0.01){
    best='portrait';
  }else if(Math.abs(portExtension-landExtension)<=0.01 && portRetention>landRetention){
    best='portrait';
  }

  return {
    best,
    landscape:{retention:landRetention,extension:landExtension},
    portrait:{retention:portRetention,extension:portExtension}
  };
}

function resolvedCardOrientation(){
  if(prepareTarget.value!=='card') return null;

  if(cardOrientation.value==='landscape') return 'landscape';
  if(cardOrientation.value==='portrait') return 'portrait';

  if(!sourceImg) return 'landscape';
  return bestCardOrientation(sourceImg.naturalWidth,sourceImg.naturalHeight).best;
}

function resolvedTargetRatio(){
  if(prepareTarget.value==='square') return 1;

  const orientation=resolvedCardOrientation();
  return orientation==='portrait' ? (54/85.6) : (85.6/54);
}

function refreshOrientationAdvice(){
  if(prepareTarget.value!=='card'){
    cardOrientation.disabled=true;
    orientationAdvice.textContent='Le format carré ne nécessite pas de choix horizontal / vertical.';
    return;
  }

  cardOrientation.disabled=false;

  if(!sourceImg){
    orientationAdvice.textContent='Charge une photo pour obtenir une recommandation.';
    return;
  }

  const r=bestCardOrientation(sourceImg.naturalWidth,sourceImg.naturalHeight);
  const chosen=resolvedCardOrientation();

  const landPct=Math.round((1-r.landscape.extension)*100);
  const portPct=Math.round((1-r.portrait.extension)*100);

  const bestLabel=r.best==='portrait' ? 'Verticale' : 'Horizontale';
  const chosenLabel=chosen==='portrait' ? 'Verticale' : 'Horizontale';

  orientationAdvice.textContent=
    `Recommandé : ${bestLabel}. `+
    `Besoin d’extension estimé — Horizontale ${Math.round(r.landscape.extension*100)} %, `+
    `Verticale ${Math.round(r.portrait.extension*100)} %. `+
    `Choix actuel : ${chosenLabel}.`;
}

function requiredOutpaintForRatio(w,h,targetRatio){
  const ratio=w/h;

  if(Math.abs(ratio-targetRatio)<0.01){
    return {left:0,right:0,up:0,down:0};
  }

  if(ratio<targetRatio){
    // Need more width.
    const targetW=Math.ceil(h*targetRatio);
    const extra=Math.max(0,targetW-w);
    const left=Math.floor(extra/2);
    const right=extra-left;
    return {left,right,up:0,down:0};
  }

  // Need more height.
  const targetH=Math.ceil(w/targetRatio);
  const extra=Math.max(0,targetH-h);
  const up=Math.floor(extra/2);
  const down=extra-up;
  return {left:0,right:0,up,down};
}

async function prepareWithOutpaint(){
  if(!sourceImg || !sourceFile){
    prepareStatus.textContent='Charge d’abord une photo.';
    return;
  }

  const targetRatio=resolvedTargetRatio();
  const dirs=requiredOutpaintForRatio(
    sourceImg.naturalWidth,
    sourceImg.naturalHeight,
    targetRatio
  );

  const total=dirs.left+dirs.right+dirs.up+dirs.down;
  if(total===0){
    prepareStatus.textContent='La photo est déjà proche du bon format.';
    return;
  }

  prepareOutpaint.disabled=true;
  buildBtn.disabled=true;

  try{
    prepareStatus.textContent=
      `Extension IA : gauche ${dirs.left}px, droite ${dirs.right}px, haut ${dirs.up}px, bas ${dirs.down}px…`;

    // Compress large phone photos before sending; the original stays preserved locally.
    const blob=await imageToJpegBlob(sourceImg,1600);
    const preparedImg=await blobToImage(blob);

    // Recalculate directions after resize.
    const scaledDirs=requiredOutpaintForRatio(
      preparedImg.naturalWidth,
      preparedImg.naturalHeight,
      targetRatio
    );

    const fd=new FormData();
    fd.append('image',blob,'source.jpg');
    fd.append('left',String(Math.min(2000,scaledDirs.left)));
    fd.append('right',String(Math.min(2000,scaledDirs.right)));
    fd.append('up',String(Math.min(2000,scaledDirs.up)));
    fd.append('down',String(Math.min(2000,scaledDirs.down)));
    fd.append('creativity',String(Number(prepareCreativity.value)));
    fd.append(
      'prompt',
      'Seamlessly continue only the existing background and environment. Preserve the original subject exactly. Do not add another person, animal, face, text, logo or object. Photorealistic natural continuation.'
    );
    fd.append('output_format','png');

    const r=await fetch('/api/outpaint-support',{method:'POST',body:fd});

    if(!r.ok){
      let msg=`Outpaint ${r.status}`;
      try{
        const j=await r.json();
        msg=j.error||msg;
      }catch{
        try{msg=await r.text()}catch{}
      }
      throw new Error(msg);
    }

    const outBlob=await r.blob();
    const outImg=await blobToImage(outBlob);

    sourceFile=new File([outBlob],'photo-support-ready.png',{type:'image/png'});
    sourceImg=outImg;
    aiPrepared=true;
    prepareReset.disabled=false;

    const ratio=sourceImg.naturalWidth/sourceImg.naturalHeight;
    view.width=1024;
    view.height=Math.max(620,Math.round(1024/ratio));

    const vc=view.getContext('2d');
    vc.clearRect(0,0,view.width,view.height);
    const f=fitContain(sourceImg,view.width,view.height);
    vc.drawImage(sourceImg,f.x,f.y,f.w,f.h);

    // Any previous relief is now invalid because source changed.
    reliefReady=false;
    exportBtn.disabled=true;
    downloadBtn.disabled=true;
    subjectImg=null;
    backgroundImg=null;
    subjectDepthCanvas=null;
    backgroundDepthCanvas=null;

    const ori=resolvedCardOrientation();
    const oriLabel=prepareTarget.value==='card'
      ? (ori==='portrait' ? 'verticale' : 'horizontale')
      : 'carrée';

    prepareStatus.textContent=
      `Photo étendue au format ${oriLabel}. Vérifie le décor, puis clique sur « Créer le relief 3D local ».`;

    setStatus('Photo support-ready prête pour le calcul du relief.');
  }catch(e){
    console.error(e);
    prepareStatus.textContent='ERREUR : '+(e?.message||String(e));
  }finally{
    prepareOutpaint.disabled=false;
    buildBtn.disabled=false;
  }
}

prepareCreativity.addEventListener('input',()=>{
  prepareCreativityOut.textContent=Number(prepareCreativity.value).toFixed(2);
});

prepareTarget.addEventListener('change',refreshOrientationAdvice);
cardOrientation.addEventListener('change',refreshOrientationAdvice);


prepareOutpaint.addEventListener('click',prepareWithOutpaint);

prepareReset.addEventListener('click',async()=>{
  if(!originalSourceFile || !originalSourceImg) return;

  sourceFile=originalSourceFile;
  sourceImg=originalSourceImg;
  aiPrepared=false;
  prepareReset.disabled=true;

  const ratio=sourceImg.naturalWidth/sourceImg.naturalHeight;
  view.width=1024;
  view.height=Math.max(620,Math.round(1024/ratio));

  const vc=view.getContext('2d');
  vc.clearRect(0,0,view.width,view.height);
  const f=fitContain(sourceImg,view.width,view.height);
  vc.drawImage(sourceImg,f.x,f.y,f.w,f.h);

  reliefReady=false;
  exportBtn.disabled=true;
  downloadBtn.disabled=true;
  subjectImg=null;
  backgroundImg=null;
  subjectDepthCanvas=null;
  backgroundDepthCanvas=null;

  prepareStatus.textContent='Photo originale restaurée.';
  setStatus('Photo originale restaurée.');
});


file.addEventListener('change',async()=>{
  sourceFile=file.files?.[0]||null;
  originalSourceFile=sourceFile;

  exported=[];
  exportBtn.disabled=true;
  downloadBtn.disabled=true;
  framesEl.innerHTML='';

  if(!sourceFile) return;

  sourceImg=await fileToImage(sourceFile);
  originalSourceImg=sourceImg;
  aiPrepared=false;
  prepareReset.disabled=true;
  prepareStatus.textContent='Optionnel — étends le décor si la photo ne correspond pas au format du produit.';
  refreshOrientationAdvice();

  const ratio=sourceImg.naturalWidth/sourceImg.naturalHeight;
  view.width=1024;
  view.height=Math.max(620,Math.round(1024/ratio));

  const c=view.getContext('2d');
  c.clearRect(0,0,view.width,view.height);

  const f=fitContain(sourceImg,view.width,view.height);
  c.drawImage(sourceImg,f.x,f.y,f.w,f.h);

  setStatus('Photo chargée. Clique sur « Créer le relief 3D local ».');
});

buildBtn.addEventListener('click',async()=>{
  if(!sourceFile){
    setStatus('Choisis d’abord une photo.');
    return;
  }

  buildBtn.disabled=true;
  exportBtn.disabled=true;
  downloadBtn.disabled=true;

  try{
    const subjectBlob=await localRemoveBackground(sourceFile);
    subjectImg=await blobToImage(subjectBlob);

    subjectAlphaCanvas=makeAlphaCanvas(subjectImg);

    const backgroundBlob=await reconstructBackground(
      sourceImg,
      subjectAlphaCanvas
    );

    backgroundImg=await blobToImage(backgroundBlob);

    subjectDepthCanvas=await estimateDepth(
      subjectImg,
      '4/5 Analyse de profondeur du sujet…'
    );

    backgroundDepthCanvas=await estimateDepth(
      backgroundImg,
      '5/5 Analyse de profondeur du fond…'
    );

    startPreview();

    exportBtn.disabled=false;
    reliefReady=true;
    lastReadySource='relief';
    window.LentiRelief32.ready=true;

    setStatus(
      'V3.1 prête — détourage, fond et profondeur calculés localement.'
    );
  }catch(e){
    console.error(e);
    setStatus('ERREUR : '+(e?.message||String(e)));
  }finally{
    buildBtn.disabled=false;
  }
});

exportBtn.addEventListener('click',async()=>{
  if(!subjectImg||!backgroundImg) return;

  cancelAnimationFrame(anim);

  exported=[];
  framesEl.innerHTML='';

  const poses=[-1,-.75,-.5,-.25,0,.25,.5,.75,1];

  for(let i=0;i<9;i++){
    setStatus(`Export vue ${i+1}/9…`);

    const c=document.createElement('canvas');
    c.width=view.width;
    c.height=view.height;

    renderAt(poses[i],c);

    const b=await canvasToBlob(c);
    exported.push(b);

    const im=new Image();
    im.src=URL.createObjectURL(b);
    framesEl.appendChild(im);

    await sleep(25);
  }

  downloadBtn.disabled=false;
  startPreview();
  setStatus('9 vues V3.1 prêtes.');
});

downloadBtn.addEventListener('click',async()=>{
  if(exported.length!==9) return;

  const zip=new JSZip();

  exported.forEach((b,i)=>{
    zip.file(`vue-${String(i+1).padStart(2,'0')}.png`,b);
  });

  zip.file(
    'manifest.json',
    JSON.stringify({
      generator:'LentiPrint Relief 3D V3.1 local',
      localSegmentation:true,
      externalPaidApi:false,
      views:9,
      angle:Number(angle.value),
      subjectDepth:Number(subjectDepth.value),
      backgroundDepth:Number(bgDepth.value),
      edgeProtection:Number(edgeProtect.value)
    },null,2)
  );

  const b=await zip.generateAsync({type:'blob'});

  const u=URL.createObjectURL(b);
  const a=document.createElement('a');
  a.href=u;
  a.download='9-vues-relief-3d-v31-local.zip';
  a.click();

  setTimeout(()=>URL.revokeObjectURL(u),1500);
});


/* =========================================================
   V3.2 — ONGLET RENDU SUPPORT
   Ne modifie pas l'export production.
========================================================= */

const tabs=[...document.querySelectorAll('.tab')];
const reliefPanel=$('#panel-relief');
const supportPanel=$('#panel-support');
const proPanel=$('#panel-pro');

tabs.forEach(btn=>{
  btn.addEventListener('click',()=>{
    tabs.forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    const target=btn.dataset.tab;
    reliefPanel.classList.toggle('active',target==='relief');
    supportPanel.classList.toggle('active',target==='support');
    proPanel.classList.toggle('active',target==='pro');
    if(target==='support') setTimeout(syncSupportOptions,0);
  });
});

const supportSource=$('#supportSource');
let lastReadySource=null;
const supportType=$('#supportType');
const supportOrientationInfo=$('#supportOrientationInfo');
const supportFit=$('#supportFit');
const supportMargin=$('#supportMargin');
const supportMarginOut=$('#supportMarginOut');
const supportZoom=$('#supportZoom');
const supportX=$('#supportX');
const supportY=$('#supportY');
const supportZoomOut=$('#supportZoomOut');
const supportXOut=$('#supportXOut');
const supportYOut=$('#supportYOut');
const supportAngle=$('#supportAngle');
const supportSpeed=$('#supportSpeed');
const supportAngleOut=$('#supportAngleOut');
const supportSpeedOut=$('#supportSpeedOut');
const supportPlay=$('#supportPlay');
const supportStop=$('#supportStop');
const supportStatus=$('#supportStatus');
const product=$('#product');
const supportCanvas=$('#supportCanvas');
const supportCtx=supportCanvas.getContext('2d');

let supportRAF=0;
let supportRunning=false;
let supportStartTime=0;

supportAngle.addEventListener('input',()=>{
  supportAngleOut.textContent=`±${supportAngle.value}°`;
});

supportSpeed.addEventListener('input',()=>{
  supportSpeedOut.textContent=`${Number(supportSpeed.value).toFixed(1)} s`;
});

function refreshSupportFraming(){
  supportMarginOut.textContent=`${supportMargin.value}%`;
  supportZoomOut.textContent=`${supportZoom.value}%`;
  supportXOut.textContent=`${supportX.value}%`;
  supportYOut.textContent=`${supportY.value}%`;

  if(resolvedSupportSource()){
    renderSupportFrame(0);
    product.style.transform='none';
  }
}

supportFit.addEventListener('change',refreshSupportFraming);
supportMargin.addEventListener('input',refreshSupportFraming);
supportZoom.addEventListener('input',refreshSupportFraming);
supportX.addEventListener('input',refreshSupportFraming);
supportY.addEventListener('input',refreshSupportFraming);



function currentCardOrientation(){
  if(typeof prepareTarget!=='undefined' && prepareTarget?.value!=='card'){
    return 'landscape';
  }

  if(typeof cardOrientation!=='undefined'){
    if(cardOrientation?.value==='portrait') return 'portrait';
    if(cardOrientation?.value==='landscape') return 'landscape';
  }

  if(typeof resolvedCardOrientation==='function'){
    try{
      const r=resolvedCardOrientation();
      if(r) return r;
    }catch{}
  }

  if(sourceImg && typeof bestCardOrientation==='function'){
    try{
      return bestCardOrientation(sourceImg.naturalWidth,sourceImg.naturalHeight).best;
    }catch{}
  }

  return 'landscape';
}

function syncSupportOrientationLabel(){
  if(!supportOrientationInfo) return;

  if(supportType.value!=='card'){
    supportOrientationInfo.textContent='Orientation : non applicable au médaillon.';
    return;
  }

  const ori=currentCardOrientation();
  supportOrientationInfo.textContent=
    `Orientation carte : ${ori==='portrait' ? 'verticale 54 × 85,6 mm' : 'horizontale 85,6 × 54 mm'}`;
}

function updateSupportShape(){
  const type=supportType.value;

  product.classList.remove('card-product','medal-product');

  if(type==='card'){
    product.classList.add('card-product');

    const ori=currentCardOrientation();

    if(ori==='portrait'){
      supportCanvas.width=756;
      supportCanvas.height=1200;
      product.style.aspectRatio='54 / 85.6';
    }else{
      supportCanvas.width=1200;
      supportCanvas.height=756;
      product.style.aspectRatio='85.6 / 54';
    }
  }else{
    product.classList.add('medal-product');
    supportCanvas.width=900;
    supportCanvas.height=900;
    product.style.aspectRatio='1 / 1';
  }

  syncSupportOrientationLabel();
}



function resolvedSupportSource(){
  const requested=supportSource.value;
  if(requested!=='auto') return requested;

  if(lastReadySource==='pro' && proSourceCanvas) return 'pro';
  if(lastReadySource==='relief' && reliefReady) return 'relief';
  if(proSourceCanvas) return 'pro';
  if(reliefReady) return 'relief';
  return null;
}

function drawProSnapshotIntoSupport(norm){
  if(!proSourceCanvas) return false;

  const temp=document.createElement('canvas');
  temp.width=proCanvas.width;
  temp.height=proCanvas.height;

  try{
    renderPro(norm,temp);
  }catch(err){
    console.error('renderPro support failed',err);
    // fallback: copy the current visible pro canvas exactly
    const tx=temp.getContext('2d');
    tx.drawImage(proCanvas,0,0,temp.width,temp.height);
  }

  return temp;
}


function drawImageCover(ctx,img,W,H,shiftX=0,shiftY=0){
  const ratio=img.naturalWidth/img.naturalHeight;
  const target=W/H;
  let sx=0,sy=0,sw=img.naturalWidth,sh=img.naturalHeight;

  if(ratio>target){
    sw=img.naturalHeight*target;
    sx=(img.naturalWidth-sw)/2;
  }else{
    sh=img.naturalWidth/target;
    sy=(img.naturalHeight-sh)/2;
  }

  ctx.drawImage(img,sx,sy,sw,sh,shiftX,shiftY,W,H);
}

function drawHybridSourceBackdrop(ctx,W,H,dx,dy,dw,dh){
  if(!sourceImg) return false;

  const imgW=sourceImg.naturalWidth;
  const imgH=sourceImg.naturalHeight;

  // La photo originale reste strictement intacte au centre.
  // On remplit uniquement les zones extérieures avec les pixels du bord.
  const leftGap=Math.max(0,dx);
  const topGap=Math.max(0,dy);
  const rightEdge=dx+dw;
  const bottomEdge=dy+dh;
  const rightGap=Math.max(0,W-rightEdge);
  const bottomGap=Math.max(0,H-bottomEdge);

  // Épaisseur de prélèvement dans l'image source :
  // quelques pixels seulement, au bord extrême.
  const sampleX=Math.max(1,Math.min(4,imgW));
  const sampleY=Math.max(1,Math.min(4,imgH));

  // Fond de sécurité.
  ctx.fillStyle='#111';
  ctx.fillRect(0,0,W,H);

  // 1) Bandes gauche et droite :
  // on étire uniquement les colonnes extrêmes de la photo.
  if(leftGap>0){
    ctx.drawImage(
      sourceImg,
      0,0,sampleX,imgH,
      0,dy,leftGap,dh
    );
  }

  if(rightGap>0){
    ctx.drawImage(
      sourceImg,
      imgW-sampleX,0,sampleX,imgH,
      rightEdge,dy,rightGap,dh
    );
  }

  // 2) Bandes haut et bas :
  // on étire uniquement les lignes extrêmes de la photo.
  if(topGap>0){
    ctx.drawImage(
      sourceImg,
      0,0,imgW,sampleY,
      dx,0,dw,topGap
    );
  }

  if(bottomGap>0){
    ctx.drawImage(
      sourceImg,
      0,imgH-sampleY,imgW,sampleY,
      dx,bottomEdge,dw,bottomGap
    );
  }

  // 3) Coins : uniquement les pixels des quatre coins.
  if(leftGap>0 && topGap>0){
    ctx.drawImage(
      sourceImg,
      0,0,sampleX,sampleY,
      0,0,leftGap,topGap
    );
  }

  if(rightGap>0 && topGap>0){
    ctx.drawImage(
      sourceImg,
      imgW-sampleX,0,sampleX,sampleY,
      rightEdge,0,rightGap,topGap
    );
  }

  if(leftGap>0 && bottomGap>0){
    ctx.drawImage(
      sourceImg,
      0,imgH-sampleY,sampleX,sampleY,
      0,bottomEdge,leftGap,bottomGap
    );
  }

  if(rightGap>0 && bottomGap>0){
    ctx.drawImage(
      sourceImg,
      imgW-sampleX,imgH-sampleY,sampleX,sampleY,
      rightEdge,bottomEdge,rightGap,bottomGap
    );
  }

  // 4) Photo originale nette par-dessus, sans flou ni agrandissement de fond.
  ctx.drawImage(sourceImg,dx,dy,dw,dh);

  return true;
}

function drawPreservedReliefToCanvas(norm,target){
  if(!subjectImg || !backgroundImg) return false;

  const ctx=target.getContext('2d');
  const W=target.width,H=target.height;
  ctx.clearRect(0,0,W,H);

  const zoom=Number(supportZoom.value)/100;
  const posX=Number(supportX.value)/100;
  const posY=Number(supportY.value)/100;
  const margin=Number(supportMargin.value)/100;

  const iw=backgroundImg.naturalWidth;
  const ih=backgroundImg.naturalHeight;

  // Same exact geometry for background and subject.
  const safeW=W*(1-margin*2);
  const safeH=H*(1-margin*2);

  let baseScale;

  if(supportType.value==='medal'){
    // Fill the medallion while preserving user zoom/position.
    baseScale=Math.max(W/iw,H/ih);
  }else{
    // Card preserve mode: keep subject comfortably inside the support.
    baseScale=Math.min(safeW/iw,safeH/ih);
  }

  const scale=baseScale*zoom;
  const dw=iw*scale;
  const dh=ih*scale;

  const dx=(W-dw)/2 + posX*(W*0.35);
  const dy=(H-dh)/2 + posY*(H*0.35);

  ctx.fillStyle='#111';
  ctx.fillRect(0,0,W,H);

  // 1) Clean background only: never sourceImg in preserve mode.
  ctx.drawImage(backgroundImg,dx,dy,dw,dh);

  // 2) Subject once, aligned exactly on the same geometry.
  // Only the lenticular parallax moves it horizontally.
  const subShift=norm*12*(Number(subjectDepth.value)/0.30);
  ctx.drawImage(subjectImg,dx+subShift,dy,dw,dh);

  return true;
}

function drawReliefIntoSupport(norm){
  const W=supportCanvas.width;
  const H=supportCanvas.height;
  const type=supportType.value;
  const source=resolvedSupportSource();

  supportCtx.clearRect(0,0,W,H);

  let temp=null;

  if(!source){
    supportStatus.textContent='Aucun rendu disponible. Crée un Relief photo ou une Carte pro 3D.';
    return;
  }

  if(source==='pro'){
    if(!proSourceCanvas){
      supportStatus.textContent='Crée d’abord la Carte pro 3D dans l’onglet correspondant.';
      return false;
    }

    temp=drawProSnapshotIntoSupport(norm);
    if(!temp){
      supportStatus.textContent='Carte pro non disponible.';
      return false;
    }

  }else{
    if(!reliefReady || !subjectImg || !backgroundImg){
      supportStatus.textContent='Crée d’abord le relief 3D dans le premier onglet.';
      return false;
    }

    temp=document.createElement('canvas');

    if(supportFit.value==='preserve' && type==='card'){
      // Prepare the image directly at the final card ratio.
      temp.width=W;
      temp.height=H;
      drawPreservedReliefToCanvas(norm,temp);
    }else{
      temp.width=view.width;
      temp.height=view.height;
      renderAt(norm,temp);
    }
  }

  if(type==='card'){
    const fitMode=supportFit.value;

    supportCtx.fillStyle='#111';
    supportCtx.fillRect(0,0,W,H);

    if(fitMode==='preserve' && source==='relief'){
      // Already composed to the exact card ratio.
      supportCtx.drawImage(temp,0,0,W,H);
    }else{
      const zoom=Number(supportZoom.value)/100;
      const posX=Number(supportX.value)/100;
      const posY=Number(supportY.value)/100;

      const srcRatio=temp.width/temp.height;
      const dstRatio=W/H;

      let baseScale;
      if(fitMode==='contain'){
        baseScale = srcRatio > dstRatio ? W/temp.width : H/temp.height;
      }else{
        baseScale = srcRatio > dstRatio ? H/temp.height : W/temp.width;
      }

      const scale=baseScale*zoom;
      const dw=temp.width*scale;
      const dh=temp.height*scale;

      const dx=(W-dw)/2 + posX*(W*0.45);
      const dy=(H-dh)/2 + posY*(H*0.45);

      supportCtx.drawImage(temp,dx,dy,dw,dh);
    }

    const g=supportCtx.createLinearGradient(0,0,W,H);
    g.addColorStop(0,'rgba(255,255,255,0.03)');
    g.addColorStop(.48,'rgba(255,255,255,0.12)');
    g.addColorStop(.55,'rgba(255,255,255,0.02)');
    supportCtx.fillStyle=g;
    supportCtx.fillRect(0,0,W,H);

  }else{
    // Medal only makes sense with the Relief photo workflow.
    if(source==='pro'){
      supportStatus.textContent='Le mode Carte pro 3D est disponible uniquement sur le support carte.';
      return false;
    }

    supportCtx.save();
    supportCtx.beginPath();
    supportCtx.arc(W/2,H/2,Math.min(W,H)/2,0,Math.PI*2);
    supportCtx.clip();

    // Médaillon : appliquer réellement les réglages de zoom et position.
    const fitMode=supportFit.value;
    const zoom=Number(supportZoom.value)/100;
    const posX=Number(supportX.value)/100;
    const posY=Number(supportY.value)/100;

    let baseScale;

    if(fitMode==='contain'){
      baseScale=Math.min(W/temp.width,H/temp.height);
    }else{
      // Pour preserve/cover dans un médaillon, remplir le cercle.
      baseScale=Math.max(W/temp.width,H/temp.height);
    }

    const scale=baseScale*zoom;
    const dw=temp.width*scale;
    const dh=temp.height*scale;

    const dx=(W-dw)/2 + posX*(W*0.45);
    const dy=(H-dh)/2 + posY*(H*0.45);

    supportCtx.drawImage(temp,dx,dy,dw,dh);

    const rg=supportCtx.createRadialGradient(W*.36,H*.28,10,W*.5,H*.5,W*.65);
    rg.addColorStop(0,'rgba(255,255,255,.08)');
    rg.addColorStop(.7,'rgba(255,255,255,0)');
    rg.addColorStop(1,'rgba(0,0,0,.10)');
    supportCtx.fillStyle=rg;
    supportCtx.fillRect(0,0,W,H);

    supportCtx.restore();
  }

  return true;
}

function renderSupportFrame(norm){
  const ok=drawReliefIntoSupport(norm);
  if(!ok) return;

  const maxA=Number(supportAngle.value);
  const rotY=norm*maxA;
  const rotX=Math.sin(norm*Math.PI*.5)*1.2;

  // Product rotation is presentation only.
  product.style.transform=
    `perspective(1200px) rotateY(${rotY}deg) rotateX(${rotX}deg)`;
}

function supportLoop(t){
  if(!supportRunning) return;

  if(!supportStartTime) supportStartTime=t;

  const duration=Number(supportSpeed.value)*1000;
  const elapsed=(t-supportStartTime)%duration;
  const phase=elapsed/duration;

  // smooth left-right-left
  const norm=Math.sin(phase*Math.PI*2);

  renderSupportFrame(norm);

  supportRAF=requestAnimationFrame(supportLoop);
}

supportPlay.addEventListener('click',()=>{
  const source=resolvedSupportSource();

  if(source==='pro'){
    if(!proSourceCanvas){
      supportStatus.textContent='Crée d’abord la Carte pro 3D dans l’onglet correspondant.';
      return;
    }
    if(supportType.value!=='card'){
      supportStatus.textContent='Pour une Carte pro 3D, choisis le support carte.';
      return;
    }
  }else{
    if(!reliefReady){
      supportStatus.textContent='Crée d’abord le relief 3D dans le premier onglet.';
      return;
    }
  }

  supportRunning=true;
  supportStartTime=0;
  cancelAnimationFrame(supportRAF);
  supportRAF=requestAnimationFrame(supportLoop);

  if(source==='pro'){
    supportStatus.textContent='Aperçu de la Carte pro 3D sur support en cours.';
  }else if(supportType.value==='card'){
    const ori=currentCardOrientation();
    supportStatus.textContent=
      `Aperçu carte ${ori==='portrait' ? 'verticale' : 'horizontale'} en cours.`;
  }else{
    supportStatus.textContent='Aperçu médaillon en cours.';
  }
});

supportStop.addEventListener('click',()=>{
  supportRunning=false;
  cancelAnimationFrame(supportRAF);
  supportRAF=0;
  product.style.transform='none';

  if(resolvedSupportSource()){
    renderSupportFrame(0);
    product.style.transform='none';
  }

  supportStatus.textContent='Aperçu support arrêté.';
});

updateSupportShape();


/* =========================================================
   V3.3 — CARTE PRO 3D
   OCR local + QR local + zones manuelles + profondeur par bloc.
   Aucun appel API payant.
========================================================= */

const proFile=$('#proFile');
const proCanvas=$('#proCanvas');
const proCtx=proCanvas.getContext('2d',{willReadFrequently:true});
const proOverlay=$('#proOverlay');
const proAnalyze=$('#proAnalyze');
const proAddZone=$('#proAddZone');
const proCancelZone=$('#proCancelZone');
const proSelection=$('#proSelection');
const proSelectBanner=$('#proSelectBanner');
const proStage=proCanvas.closest('.pro-stage');
const proPreview=$('#proPreview');
const proExport=$('#proExport');
const proDownload=$('#proDownload');
const proStatus=$('#proStatus');
const proList=$('#proList');
const proAmp=$('#proAmp');
const proAmpOut=$('#proAmpOut');

let proImg=null;
let proZones=[];
let proBaseCanvas=null;
let proSourceCanvas=null;
let proAdding=false;
let proDragStart=null;
let proRAF=0;
let proRunning=false;
let proFrames=[];

const TYPE_DEFAULT_DEPTH={
  logo:0.85,
  title:0.55,
  text:0.12,
  qr:0.0,
  graphic:0.28
};

proAmp.addEventListener('input',()=>{
  proAmpOut.textContent=`${proAmp.value} px`;
});

function proSetStatus(t){ proStatus.textContent=t; }

function proImageFromFile(f){
  return new Promise((resolve,reject)=>{
    const u=URL.createObjectURL(f);
    const im=new Image();
    im.onload=()=>{URL.revokeObjectURL(u);resolve(im)};
    im.onerror=e=>{URL.revokeObjectURL(u);reject(e)};
    im.src=u;
  });
}

function proFitImage(){
  if(!proImg)return;
  const ratio=proImg.naturalWidth/proImg.naturalHeight;
  proCanvas.width=1200;
  proCanvas.height=Math.round(1200/ratio);
  if(proCanvas.height<650) proCanvas.height=650;

  proSourceCanvas=document.createElement('canvas');
  proSourceCanvas.width=proCanvas.width;
  proSourceCanvas.height=proCanvas.height;
  const sx=proSourceCanvas.getContext('2d');
  sx.fillStyle='#111';sx.fillRect(0,0,proSourceCanvas.width,proSourceCanvas.height);

  const scale=Math.min(proSourceCanvas.width/proImg.naturalWidth,proSourceCanvas.height/proImg.naturalHeight);
  const dw=proImg.naturalWidth*scale,dh=proImg.naturalHeight*scale;
  const dx=(proSourceCanvas.width-dw)/2,dy=(proSourceCanvas.height-dh)/2;
  sx.drawImage(proImg,dx,dy,dw,dh);

  proCtx.clearRect(0,0,proCanvas.width,proCanvas.height);
  proCtx.drawImage(proSourceCanvas,0,0);
}

proFile.addEventListener('change',async()=>{
  const f=proFile.files?.[0];
  if(!f)return;
  proImg=await proImageFromFile(f);
  lastReadySource='pro';
  proZones=[];
  proFrames=[];
  proFitImage();
  proRefreshOverlay();
  proRefreshList();
  proPreview.disabled=true;
  proExport.disabled=true;
  proDownload.disabled=true;
  proSetStatus('Carte chargée. Clique sur « Analyser la carte ».');
});

function clamp(v,a,b){return Math.max(a,Math.min(b,v))}

function addZone(z){
  z.id=z.id||crypto.randomUUID();
  z.type=z.type||'graphic';
  z.depth=Number.isFinite(z.depth)?z.depth:(TYPE_DEFAULT_DEPTH[z.type]??0.2);
  z.label=z.label||z.type;
  z.locked=z.type==='qr';
  proZones.push(z);
}

function proRefreshOverlay(){
  proOverlay.innerHTML='';
  const rect=proCanvas.getBoundingClientRect();
  const sx=rect.width/proCanvas.width;
  const sy=rect.height/proCanvas.height;

  for(const z of proZones){
    const el=document.createElement('div');
    el.className=`pro-box ${z.type}`;
    el.style.left=`${z.x*sx}px`;
    el.style.top=`${z.y*sy}px`;
    el.style.width=`${z.w*sx}px`;
    el.style.height=`${z.h*sy}px`;
    el.title=`${z.type} — profondeur ${Math.round(z.depth*100)}%`;
    proOverlay.appendChild(el);
  }
}

function proRefreshList(){
  proList.innerHTML='';

  proZones.forEach((z,index)=>{
    const item=document.createElement('div');
    item.className='pro-item';

    const top=document.createElement('div');
    top.className='pro-item-top';

    const name=document.createElement('strong');
    name.textContent=z.label || `Zone ${index+1}`;

    const sel=document.createElement('select');
    [
      ['logo','Logo'],
      ['title','Titre / marque'],
      ['text','Texte'],
      ['qr','QR code'],
      ['graphic','Graphique']
    ].forEach(([v,t])=>{
      const o=document.createElement('option');o.value=v;o.textContent=t;
      if(z.type===v)o.selected=true;
      sel.appendChild(o);
    });

    sel.addEventListener('change',()=>{
      z.type=sel.value;
      z.depth=TYPE_DEFAULT_DEPTH[z.type]??0.2;
      z.locked=z.type==='qr';
      if(z.locked)z.depth=0;
      buildProBase();buildProBase();proRefreshList();proRefreshOverlay();
    });

    const del=document.createElement('button');
    del.type='button';
    del.className='secondary';
    del.textContent='Supprimer';
    del.addEventListener('click',()=>{
      proZones=proZones.filter(q=>q.id!==z.id);
      buildProBase();buildProBase();proRefreshList();proRefreshOverlay();
    });

    top.append(name,sel,del);

    const row=document.createElement('div');
    row.className='row';
    row.style.marginTop='8px';

    const lab=document.createElement('span');
    lab.textContent=z.locked?'Profondeur verrouillée':'Profondeur';

    const val=document.createElement('b');
    val.textContent=`${Math.round(z.depth*100)}%`;

    row.append(lab,val);

    const rng=document.createElement('input');
    rng.type='range';
    rng.min='0';rng.max='1';rng.step='0.01';
    rng.value=z.depth;
    rng.disabled=z.locked;
    rng.addEventListener('input',()=>{
      z.depth=Number(rng.value);
      val.textContent=`${Math.round(z.depth*100)}%`;
      proRefreshOverlay();
    });

    item.append(top,row,rng);
    proList.appendChild(item);
  });
}

async function detectQR(){
  if(typeof jsQR!=='function')return;

  const d=proCtx.getImageData(0,0,proCanvas.width,proCanvas.height);
  const r=jsQR(d.data,d.width,d.height,{inversionAttempts:'attemptBoth'});
  if(!r)return;

  const pts=[
    r.location.topLeftCorner,
    r.location.topRightCorner,
    r.location.bottomLeftCorner,
    r.location.bottomRightCorner
  ];
  const xs=pts.map(p=>p.x),ys=pts.map(p=>p.y);
  const pad=12;
  const x=clamp(Math.min(...xs)-pad,0,proCanvas.width);
  const y=clamp(Math.min(...ys)-pad,0,proCanvas.height);
  const x2=clamp(Math.max(...xs)+pad,0,proCanvas.width);
  const y2=clamp(Math.max(...ys)+pad,0,proCanvas.height);

  addZone({x,y,w:x2-x,h:y2-y,type:'qr',depth:0,label:'QR code'});
}

async function detectText(){
  if(!window.Tesseract)throw new Error('Tesseract OCR non chargé.');

  proSetStatus('Analyse OCR locale du texte…');

  const result=await Tesseract.recognize(
    proCanvas,
    'fra+eng',
    {
      logger:m=>{
        if(m.status==='recognizing text'){
          proSetStatus(`Analyse OCR locale… ${Math.round((m.progress||0)*100)}%`);
        }
      }
    }
  );

  const words=result?.data?.words||[];
  const useful=words.filter(w=>{
    const txt=(w.text||'').trim();
    const conf=Number(w.confidence ?? w.conf ?? 0);
    return txt.length>=2 && conf>=45 && w.bbox;
  });

  // Regroup words into approximate lines
  useful.sort((a,b)=>a.bbox.y0-b.bbox.y0 || a.bbox.x0-b.bbox.x0);
  const lines=[];

  for(const w of useful){
    const cy=(w.bbox.y0+w.bbox.y1)/2;
    let line=lines.find(l=>Math.abs(l.cy-cy)<Math.max(18,(w.bbox.y1-w.bbox.y0)*0.8));
    if(!line){
      line={cy,words:[]};lines.push(line);
    }
    line.words.push(w);
    line.cy=(line.cy*(line.words.length-1)+cy)/line.words.length;
  }

  const qrZones=proZones.filter(z=>z.type==='qr');

  for(const line of lines){
    const ws=line.words.sort((a,b)=>a.bbox.x0-b.bbox.x0);
    const x0=Math.min(...ws.map(w=>w.bbox.x0));
    const y0=Math.min(...ws.map(w=>w.bbox.y0));
    const x1=Math.max(...ws.map(w=>w.bbox.x1));
    const y1=Math.max(...ws.map(w=>w.bbox.y1));
    const text=ws.map(w=>w.text).join(' ').trim();
    const h=y1-y0;

    // Ignore text substantially inside detected QR
    const insideQR=qrZones.some(q=>x0>=q.x && y0>=q.y && x1<=q.x+q.w && y1<=q.y+q.h);
    if(insideQR)continue;

    const cardArea=proCanvas.width*proCanvas.height;
    const area=(x1-x0)*(y1-y0);
    const largeRelative = h > proCanvas.height*0.045 || area > cardArea*0.018;
    const shortProminent = text.length <= 28 && h > proCanvas.height*0.032;
    const brandLike = /^[A-Z0-9][A-Za-z0-9\s&.\-]{2,30}$/.test(text);
    const type=(largeRelative || shortProminent || brandLike && h > proCanvas.height*0.028) ? 'title' : 'text';

    addZone({
      x:clamp(x0-6,0,proCanvas.width),
      y:clamp(y0-5,0,proCanvas.height),
      w:clamp(x1-x0+12,8,proCanvas.width-x0),
      h:clamp(y1-y0+10,8,proCanvas.height-y0),
      type,
      depth:TYPE_DEFAULT_DEPTH[type],
      label:text.slice(0,42) || (type==='title'?'Titre':'Texte')
    });
  }
}

function overlap(a,b){
  return !(a.x+a.w<b.x || b.x+b.w<a.x || a.y+a.h<b.y || b.y+b.h<a.y);
}

function dedupeZones(){
  const out=[];
  for(const z of proZones){
    const dupe=out.find(o=>o.type===z.type && overlap(o,z) &&
      Math.abs(o.x-z.x)<20 && Math.abs(o.y-z.y)<20);
    if(!dupe)out.push(z);
  }
  proZones=out;
}

proAnalyze.addEventListener('click',async()=>{
  if(!proImg){
    proSetStatus('Importe d’abord une carte.');
    return;
  }

  proAnalyze.disabled=true;
  proZones=[];

  try{
    proSetStatus('Détection locale du QR code…');
    await detectQR();

    await detectText();

    dedupeZones();
    proRefreshOverlay();
    proRefreshList();
    buildProBase();

    proPreview.disabled=false;
    proExport.disabled=false;
    lastReadySource='pro';

    const hasQR=proZones.some(z=>z.type==='qr');
    proSetStatus(
      `${proZones.length} zone(s) détectée(s). `+
      (hasQR?'QR verrouillé à plat. ':'Aucun QR détecté. ')+
      'Les gros titres sont maintenant classés automatiquement. Ajoute/corrige le logo manuellement si nécessaire.'
    );
  }catch(e){
    console.error(e);
    proSetStatus('ERREUR analyse : '+(e?.message||e));
  }finally{
    proAnalyze.disabled=false;
  }
});

/* ----- Manual rectangle selection — iPad/Safari robust ----- */

function resetZoneSelectionUI(message){
  proAdding=false;
  proDragStart=null;
  proCanvas.style.cursor='default';
  proSelection.classList.remove('active');
  proSelection.style.cssText='';
  proSelectBanner.classList.remove('active');
  proCancelZone.style.display='none';
  proStage.classList.remove('selecting');
  if(message) proSetStatus(message);
}

function startZoneMode(){
  if(!proImg){
    proSetStatus('Importe d’abord une carte.');
    return;
  }

  stopProPreview();
  proAdding=true;
  proDragStart=null;
  proCanvas.style.cursor='crosshair';
  proCancelZone.style.display='inline-block';
  proSelectBanner.classList.add('active');
  proStage.classList.add('selecting');
  proSetStatus('Mode sélection actif. Pose le doigt sur un coin du logo, glisse jusqu’au coin opposé puis relâche.');
}

proAddZone.addEventListener('click',startZoneMode);

proCancelZone.addEventListener('click',()=>{
  resetZoneSelectionUI('Sélection annulée.');
  renderPro(0);
});

function eventCanvasPoint(e){
  const r=proCanvas.getBoundingClientRect();
  return {
    x:clamp((e.clientX-r.left)*proCanvas.width/r.width,0,proCanvas.width),
    y:clamp((e.clientY-r.top)*proCanvas.height/r.height,0,proCanvas.height)
  };
}

function updateLiveSelection(start,p){
  const r=proCanvas.getBoundingClientRect();
  const sx=r.width/proCanvas.width;
  const sy=r.height/proCanvas.height;

  const x=Math.min(start.x,p.x);
  const y=Math.min(start.y,p.y);
  const w=Math.abs(p.x-start.x);
  const h=Math.abs(p.y-start.y);

  proSelection.style.left=`${x*sx}px`;
  proSelection.style.top=`${y*sy}px`;
  proSelection.style.width=`${w*sx}px`;
  proSelection.style.height=`${h*sy}px`;
  proSelection.classList.add('active');
}

proCanvas.addEventListener('pointerdown',e=>{
  if(!proAdding)return;

  e.preventDefault();
  e.stopPropagation();

  try{ proCanvas.setPointerCapture(e.pointerId); }catch{}

  proDragStart=eventCanvasPoint(e);
  updateLiveSelection(proDragStart,proDragStart);
});

proCanvas.addEventListener('pointermove',e=>{
  if(!proAdding || !proDragStart)return;

  e.preventDefault();
  e.stopPropagation();

  const p=eventCanvasPoint(e);
  updateLiveSelection(proDragStart,p);
});

function finishPointerSelection(e){
  if(!proAdding || !proDragStart)return;

  e.preventDefault();
  e.stopPropagation();

  const p=eventCanvasPoint(e);

  const x=Math.min(proDragStart.x,p.x);
  const y=Math.min(proDragStart.y,p.y);
  const w=Math.abs(p.x-proDragStart.x);
  const h=Math.abs(p.y-proDragStart.y);

  if(w>24 && h>24){
    addZone({
      x,y,w,h,
      type:'logo',
      depth:TYPE_DEFAULT_DEPTH.logo,
      label:'Logo / zone manuelle'
    });

    proRefreshOverlay();
    proRefreshList();
    buildProBase();
    proPreview.disabled=false;
    proExport.disabled=false;
    lastReadySource='pro';

    resetZoneSelectionUI('Zone ajoutée en Logo à 85 %. Tu peux maintenant ajuster son type ou sa profondeur.');
    renderPro(0);
  }else{
    resetZoneSelectionUI('Zone trop petite. Recommence avec un rectangle plus large.');
    renderPro(0);
  }

  try{ proCanvas.releasePointerCapture(e.pointerId); }catch{}
}

proCanvas.addEventListener('pointerup',finishPointerSelection);
proCanvas.addEventListener('pointercancel',e=>{
  if(!proAdding)return;
  try{ proCanvas.releasePointerCapture(e.pointerId); }catch{}
  resetZoneSelectionUI('Sélection interrompue. Recommence.');
  renderPro(0);
});

// Important pour Safari iPad : empêcher le scroll de voler le geste seulement pendant la sélection.
proCanvas.addEventListener('touchstart',e=>{
  if(proAdding)e.preventDefault();
},{passive:false});

proCanvas.addEventListener('touchmove',e=>{
  if(proAdding)e.preventDefault();
},{passive:false});

proCanvas.addEventListener('touchend',e=>{
  if(proAdding)e.preventDefault();
},{passive:false});

/* ----- Fond original fixe + déplacement local des zones ----- */

function buildProBase(){
  if(!proSourceCanvas)return;

  proBaseCanvas=document.createElement('canvas');
  proBaseCanvas.width=proSourceCanvas.width;
  proBaseCanvas.height=proSourceCanvas.height;

  const bx=proBaseCanvas.getContext('2d');
  bx.drawImage(proSourceCanvas,0,0);
}

function sampleEdgeColor(z, side){
  const sx=proSourceCanvas.getContext('2d',{willReadFrequently:true});
  const x = side==='left'
    ? Math.max(0,Math.floor(z.x-3))
    : Math.min(proSourceCanvas.width-1,Math.floor(z.x+z.w+3));
  const y0=Math.max(0,Math.floor(z.y));
  const y1=Math.min(proSourceCanvas.height-1,Math.floor(z.y+z.h));
  let sr=0,sg=0,sb=0,n=0;
  for(let y=y0;y<=y1;y+=3){
    const d=sx.getImageData(x,y,1,1).data;
    sr+=d[0];sg+=d[1];sb+=d[2];n++;
  }
  if(!n)return [20,20,20];
  return [sr/n,sg/n,sb/n];
}

function repairRevealedStrip(ctx,z,dx){
  if(Math.abs(dx)<0.5)return;

  const strip=Math.min(Math.abs(dx)+2,Math.max(2,z.w*0.35));
  let rx, color;

  if(dx>0){
    rx=z.x;
    color=sampleEdgeColor(z,'left');
  }else{
    rx=z.x+z.w-strip;
    color=sampleEdgeColor(z,'right');
  }

  ctx.save();
  ctx.fillStyle=`rgb(${color[0]|0},${color[1]|0},${color[2]|0})`;
  ctx.fillRect(rx,z.y,strip,z.h);
  ctx.restore();
}

function drawZoneAt(ctx,z,norm){
  const src=proSourceCanvas;
  const amp=Math.min(16,Number(proAmp.value));
  const dx=norm*amp*z.depth;

  // Only repair the small band that would otherwise reveal the duplicated source.
  repairRevealedStrip(ctx,z,dx);

  // Rigid block translation: no pixel warping.
  ctx.drawImage(
    src,
    z.x,z.y,z.w,z.h,
    z.x+dx,z.y,z.w,z.h
  );
}

function renderPro(norm,target=proCanvas){
  if(!proSourceCanvas)return;
  if(!proBaseCanvas)buildProBase();

  const cx=target.getContext('2d');
  cx.clearRect(0,0,target.width,target.height);

  // Always start from the untouched original card.
  cx.drawImage(proBaseCanvas,0,0,target.width,target.height);

  // Then animate only selected layers.
  for(const z of proZones){
    if(z.type==='qr' || z.depth===0){
      continue; // already present in fixed original background
    }
    drawZoneAt(cx,z,norm);
  }
}

function stopProPreview(){
  proRunning=false;
  cancelAnimationFrame(proRAF);
  proRAF=0;
}

proPreview.addEventListener('click',()=>{
  if(!proSourceCanvas)return;
  stopProPreview();
  proRunning=true;
  const t0=performance.now();

  const loop=t=>{
    if(!proRunning)return;
    const norm=Math.sin((t-t0)/5200*Math.PI*2);
    renderPro(norm);
    proRAF=requestAnimationFrame(loop);
  };

  proRAF=requestAnimationFrame(loop);
  lastReadySource='pro';
  proSetStatus('Aperçu Carte pro 3D en cours.');
});

proExport.addEventListener('click',async()=>{
  if(!proSourceCanvas)return;

  stopProPreview();
  proFrames=[];
  const poses=[-1,-.75,-.5,-.25,0,.25,.5,.75,1];

  for(let i=0;i<9;i++){
    proSetStatus(`Export Carte pro : vue ${i+1}/9…`);
    const c=document.createElement('canvas');
    c.width=proCanvas.width;c.height=proCanvas.height;
    renderPro(poses[i],c);
    const b=await canvasToBlob(c);
    proFrames.push(b);
    await sleep(20);
  }

  renderPro(0);
  proDownload.disabled=false;
  proSetStatus('9 vues Carte pro 3D prêtes.');
});

proDownload.addEventListener('click',async()=>{
  if(proFrames.length!==9)return;

  const zip=new JSZip();

  proFrames.forEach((b,i)=>{
    zip.file(`carte-pro-vue-${String(i+1).padStart(2,'0')}.png`,b);
  });

  zip.file('manifest.json',JSON.stringify({
    generator:'LentiPrint Lab V3.3 Carte pro 3D',
    views:9,
    amplitudePx:Number(proAmp.value),
    zones:proZones.map(z=>({
      type:z.type,
      label:z.label,
      x:Math.round(z.x),
      y:Math.round(z.y),
      width:Math.round(z.w),
      height:Math.round(z.h),
      depth:z.depth
    }))
  },null,2));

  const b=await zip.generateAsync({type:'blob'});
  const u=URL.createObjectURL(b);
  const a=document.createElement('a');
  a.href=u;
  a.download='9-vues-carte-pro-3d-v33.zip';
  a.click();
  setTimeout(()=>URL.revokeObjectURL(u),1500);
});


// V3.3.2 safeguard
if(proAmp){
  if(Number(proAmp.value)>16) proAmp.value=10;
  proAmpOut.textContent=`${proAmp.value} px`;
}


function syncSupportOptions(){
  const source=resolvedSupportSource();

  if(source==='pro'){
    supportType.value='card';
    const medal=supportType.querySelector('option[value="medal"]');
    if(medal) medal.disabled=true;
    supportStatus.textContent = proSourceCanvas
      ? 'Carte pro 3D détectée automatiquement — prête pour le rendu support.'
      : 'Crée d’abord la Carte pro 3D.';
  }else if(source==='relief'){
    const medal=supportType.querySelector('option[value="medal"]');
    if(medal) medal.disabled=false;
    supportStatus.textContent = reliefReady
      ? 'Relief photo détecté automatiquement — prêt pour le rendu support.'
      : 'Crée d’abord le relief 3D.';
  }else{
    const medal=supportType.querySelector('option[value="medal"]');
    if(medal) medal.disabled=false;
    supportStatus.textContent='Aucun rendu disponible pour le moment.';
  }

  updateSupportShape();

  if(source){
    renderSupportFrame(0);
    product.style.transform='none';
  }
}

supportSource.addEventListener('change',syncSupportOptions);

syncSupportOptions();

supportType.addEventListener('change',()=>{
  supportRunning=false;
  cancelAnimationFrame(supportRAF);
  supportRAF=0;
  supportStartTime=0;

  product.style.transform='none';
  updateSupportShape();

  const source=resolvedSupportSource();

  if(source){
    renderSupportFrame(0);
  }else{
    supportCtx.clearRect(0,0,supportCanvas.width,supportCanvas.height);
  }

  if(supportType.value==='card'){
    const ori=currentCardOrientation();
    supportStatus.textContent=
      `Carte ${ori==='portrait' ? 'verticale' : 'horizontale'} prête pour l’aperçu.`;
  }else{
    supportStatus.textContent='Médaillon prêt pour l’aperçu.';
  }
});



if(supportSource){
  supportSource.value='auto';
}


// V3.3.6 initial framing labels
if(supportFit) supportFit.value='preserve';
if(supportZoom) supportZoom.value='100';
if(supportX) supportX.value='0';
if(supportY) supportY.value='0';
if(supportZoomOut) supportZoomOut.textContent='100%';
if(supportXOut) supportXOut.textContent='0%';
if(supportYOut) supportYOut.textContent='0%';

if(supportMargin) supportMargin.value='14';
if(supportMarginOut) supportMarginOut.textContent='14%';


function applyAiPreparedSupportDefaults(){
  if(!aiPrepared) return;
  supportFit.value='preserve';
  supportZoom.value='100';
  supportX.value='0';
  supportY.value='0';
  supportMargin.value='6';
  supportZoomOut.textContent='100%';
  supportXOut.textContent='0%';
  supportYOut.textContent='0%';
  supportMarginOut.textContent='6%';
}

document.querySelectorAll('.tab').forEach(btn=>{
  btn.addEventListener('click',()=>{
    if(btn.dataset.tab==='support'){
      applyAiPreparedSupportDefaults();
      setTimeout(()=>{
        if(resolvedSupportSource()){
          renderSupportFrame(0);
          product.style.transform='none';
        }
      },0);
    }
  });
});


refreshOrientationAdvice();


if(typeof cardOrientation!=='undefined' && cardOrientation){
  cardOrientation.addEventListener('change',()=>{
    if(supportType.value==='card'){
      supportRunning=false;
      cancelAnimationFrame(supportRAF);
      supportRAF=0;
      supportStartTime=0;
      product.style.transform='none';
      updateSupportShape();
      if(resolvedSupportSource()) renderSupportFrame(0);
    }
  });
}

if(typeof prepareTarget!=='undefined' && prepareTarget){
  prepareTarget.addEventListener('change',()=>{
    if(supportType.value==='card'){
      supportRunning=false;
      cancelAnimationFrame(supportRAF);
      supportRAF=0;
      supportStartTime=0;
      product.style.transform='none';
      updateSupportShape();
      if(resolvedSupportSource()) renderSupportFrame(0);
    }
  });
}

syncSupportOrientationLabel();
