const $=s=>document.querySelector(s);

const file=$('#file');
const view=$('#view');
const status=$('#status');
const buildBtn=$('#build');
const exportBtn=$('#export');
const downloadBtn=$('#download');
const framesEl=$('#frames');

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
let sourceImg=null;
let subjectImg=null;
let backgroundImg=null;
let subjectDepthCanvas=null;
let backgroundDepthCanvas=null;
let subjectAlphaCanvas=null;
let anim=0;
let exported=[];

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

// Expose la fonction pour l'éditeur de masque chargé après ce script.
window.localRemoveBackground = localRemoveBackground;

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
        if(n>=2) next.push([idx,sr/n,sg/n,sb/n]);
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

  for(let i=0;i<w*h;i++){
    if(filled[i]) continue;
    data[i*4]=data[Math.max(0,i-1)*4];
    data[i*4+1]=data[Math.max(0,i-1)*4+1];
    data[i*4+2]=data[Math.max(0,i-1)*4+2];
    data[i*4+3]=255;
  }

  x.putImageData(img,0,0);

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

  const fb=fitCover(backgroundImg,W,H);
  const bgShift=norm*6*amplitude*bgK;
  x.drawImage(backgroundImg,fb.x+bgShift,fb.y,fb.w,fb.h);

  const tmp=document.createElement('canvas');
  tmp.width=W;tmp.height=H;
  const tx=tmp.getContext('2d');

  const fs=fitCover(subjectImg,W,H);
  tx.drawImage(subjectImg,fs.x,fs.y,fs.w,fs.h);

  const subShift=norm*18*amplitude*subK;
  const strips=96;

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

    const local=(d-.5)*2;
    const internal=subShift*local*(0.10*(1-protect)+0.025);

    x.drawImage(tmp,sx,0,ww,H,sx+subShift+internal,0,ww+1,H);
  }

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

file.addEventListener('change',async()=>{
  sourceFile=file.files?.[0]||null;
  exported=[];
  exportBtn.disabled=true;
  downloadBtn.disabled=true;
  framesEl.innerHTML='';

  if(!sourceFile) return;
  sourceImg=await fileToImage(sourceFile);

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
    const subjectBlob=await window.localRemoveBackground(sourceFile);
    subjectImg=await blobToImage(subjectBlob);

    subjectAlphaCanvas=makeAlphaCanvas(subjectImg);

    const backgroundBlob=await reconstructBackground(sourceImg,subjectAlphaCanvas);
    backgroundImg=await blobToImage(backgroundBlob);

    subjectDepthCanvas=await estimateDepth(subjectImg,'4/5 Analyse de profondeur du sujet…');
    backgroundDepthCanvas=await estimateDepth(backgroundImg,'5/5 Analyse de profondeur du fond…');

    startPreview();
    exportBtn.disabled=false;
    setStatus('V3.1 prête — détourage, fond et profondeur calculés localement.');
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
  exported.forEach((b,i)=>zip.file(`vue-${String(i+1).padStart(2,'0')}.png`,b));

  zip.file('manifest.json',JSON.stringify({
    generator:'LentiPrint Relief 3D V3.1 local',
    localSegmentation:true,
    externalPaidApi:false,
    views:9,
    angle:Number(angle.value),
    subjectDepth:Number(subjectDepth.value),
    backgroundDepth:Number(bgDepth.value),
    edgeProtection:Number(edgeProtect.value)
  },null,2));

  const b=await zip.generateAsync({type:'blob'});
  const u=URL.createObjectURL(b);
  const a=document.createElement('a');
  a.href=u;
  a.download='9-vues-relief-3d-v31-local.zip';
  a.click();
  setTimeout(()=>URL.revokeObjectURL(u),1500);
});
