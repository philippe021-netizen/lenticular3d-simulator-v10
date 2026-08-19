const $=s=>document.querySelector(s);
const file=$('#file'),view=$('#view'),ctx=view.getContext('2d'),status=$('#status');
const buildBtn=$('#build'),exportBtn=$('#export'),downloadBtn=$('#download'),framesEl=$('#frames');
const subjectDepth=$('#subjectDepth'),bgDepth=$('#bgDepth'),angle=$('#angle'),edgeProtect=$('#edgeProtect');
const subjectOut=$('#subjectOut'),bgOut=$('#bgOut'),angleOut=$('#angleOut'),edgeOut=$('#edgeOut');

[subjectDepth,bgDepth,angle,edgeProtect].forEach(el=>el.addEventListener('input',()=>{
  subjectOut.textContent=Number(subjectDepth.value).toFixed(2);
  bgOut.textContent=Number(bgDepth.value).toFixed(2);
  angleOut.textContent=`±${angle.value}°`;
  edgeOut.textContent=`${edgeProtect.value}%`;
}));

let sourceFile=null, sourceImg=null, subjectImg=null, backgroundImg=null;
let subjectDepthMap=null, backgroundDepthMap=null, anim=0, exported=[];

function setStatus(t){status.textContent=t}
function sleep(ms){return new Promise(r=>setTimeout(r,ms))}
function fileToImage(f){return blobToImage(f)}
function blobToImage(blob){return new Promise((resolve,reject)=>{
  const u=URL.createObjectURL(blob),im=new Image();
  im.onload=()=>{URL.revokeObjectURL(u);resolve(im)}; im.onerror=reject; im.src=u;
})}
function canvasBlob(canvas){return new Promise((res,rej)=>canvas.toBlob(b=>b?res(b):rej(new Error('PNG impossible')),'image/png'))}

async function apiImage(url, form){
  const r=await fetch(url,{method:'POST',body:form});
  if(!r.ok){let m=`${url} ${r.status}`;try{m+=' '+await r.text()}catch{};throw new Error(m)}
  return await r.blob();
}

async function removeBackground(f){
  const fd=new FormData(); fd.append('image',f,f.name||'photo.png'); fd.append('output_format','png');
  return apiImage('/api/remove-background',fd);
}

async function createMaskFromSubject(subject){
  const c=document.createElement('canvas'); c.width=subject.naturalWidth;c.height=subject.naturalHeight;
  const x=c.getContext('2d');x.drawImage(subject,0,0);
  const d=x.getImageData(0,0,c.width,c.height);
  // white = erase, dilated soft mask to cover hair fringes
  const a=new Uint8ClampedArray(c.width*c.height);
  for(let i=0;i<a.length;i++) a[i]=d.data[i*4+3];
  const radius=7;
  const out=new Uint8ClampedArray(a.length);
  for(let y=0;y<c.height;y++){
    for(let x0=0;x0<c.width;x0++){
      let mx=0;
      for(let yy=Math.max(0,y-radius);yy<=Math.min(c.height-1,y+radius);yy+=2){
        for(let xx=Math.max(0,x0-radius);xx<=Math.min(c.width-1,x0+radius);xx+=2){
          mx=Math.max(mx,a[yy*c.width+xx]);
        }
      }
      out[y*c.width+x0]=mx;
    }
  }
  const id=x.createImageData(c.width,c.height);
  for(let i=0;i<out.length;i++){
    const v=out[i]; id.data[i*4]=v;id.data[i*4+1]=v;id.data[i*4+2]=v;id.data[i*4+3]=255;
  }
  x.putImageData(id,0,0);
  return canvasBlob(c);
}

async function eraseSubject(original, maskBlob){
  const fd=new FormData();
  fd.append('image',original,original.name||'photo.png');
  fd.append('mask',maskBlob,'mask.png');
  fd.append('output_format','png');
  return apiImage('/api/erase-background',fd);
}

let estimator=null;
async function getEstimator(){
  if(estimator)return estimator;
  setStatus('Chargement de Depth Anything…');
  const {pipeline,env}=await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/+esm');
  env.allowLocalModels=false;
  estimator=await pipeline('depth-estimation','onnx-community/depth-anything-v2-small',{dtype:'q4'});
  return estimator;
}

async function estimateDepth(img){
  const max=720, s=Math.min(1,max/Math.max(img.naturalWidth,img.naturalHeight));
  const w=Math.max(64,Math.round(img.naturalWidth*s)),h=Math.max(64,Math.round(img.naturalHeight*s));
  const c=document.createElement('canvas');c.width=w;c.height=h;c.getContext('2d').drawImage(img,0,0,w,h);
  const b=await new Promise(r=>c.toBlob(r,'image/jpeg',.9)), u=URL.createObjectURL(b);
  try{
    const est=await getEstimator(); const r=await est(u);
    const raw=r.depth, src=document.createElement('canvas');src.width=raw.width;src.height=raw.height;
    const sx=src.getContext('2d'),id=sx.createImageData(raw.width,raw.height);
    for(let i=0;i<raw.width*raw.height;i++){let v=raw.data[i];id.data[i*4]=v;id.data[i*4+1]=v;id.data[i*4+2]=v;id.data[i*4+3]=255}
    sx.putImageData(id,0,0);
    const out=document.createElement('canvas');out.width=w;out.height=h;
    const ox=out.getContext('2d');ox.filter='blur(3px)';ox.drawImage(src,0,0,w,h);ox.filter='none';
    return out;
  }finally{URL.revokeObjectURL(u)}
}

function fit(img,W,H){
  const s=Math.max(W/img.naturalWidth,H/img.naturalHeight);
  const w=img.naturalWidth*s,h=img.naturalHeight*s;return {x:(W-w)/2,y:(H-h)/2,w,h}
}

function renderAt(norm, target=view){
  const c=target, x=c.getContext('2d'),W=c.width,H=c.height;
  x.clearRect(0,0,W,H);
  const amp=Number(angle.value)/5;
  const bgShift=norm*10*amp*(Number(bgDepth.value)/.12);
  const subShift=norm*26*amp*(Number(subjectDepth.value)/.34);

  // background: clean reconstructed image, tiny motion
  const fb=fit(backgroundImg,W,H);
  x.drawImage(backgroundImg,fb.x+bgShift,fb.y,fb.w,fb.h);

  // subject layer: use alpha cutout, but suppress edge motion with inner-alpha erosion
  const fs=fit(subjectImg,W,H);
  const tmp=document.createElement('canvas');tmp.width=W;tmp.height=H;
  const tx=tmp.getContext('2d');tx.drawImage(subjectImg,fs.x,fs.y,fs.w,fs.h);

  // depth-weighted horizontal micro-warp in strips; inner regions move more than hair edges
  const strips=80, sw=W/strips;
  const dctx=subjectDepthMap.getContext('2d',{willReadFrequently:true});
  const edge=Number(edgeProtect.value)/100;
  for(let i=0;i<strips;i++){
    const sx=Math.floor(i*W/strips), ex=Math.floor((i+1)*W/strips), ww=ex-sx;
    const du=Math.floor(i*subjectDepthMap.width/strips);
    const dd=dctx.getImageData(Math.min(du,subjectDepthMap.width-1),Math.floor(subjectDepthMap.height/2),1,1).data[0]/255;
    const local=(dd-.5)*2;
    const warp=subShift*(0.72+0.28*local);
    // less stretch than v2: whole cutout translates, only small internal differential
    x.drawImage(tmp,sx,0,ww,H,sx+subShift+warp*.18,0,ww+1,H);
  }

  // re-overlay central subject at low opacity to stabilize fine contours / hair
  x.globalAlpha=Math.min(.32, edge*.34);
  x.drawImage(tmp,subShift,0);
  x.globalAlpha=1;
}

function startPreview(){
  cancelAnimationFrame(anim); const t0=performance.now();
  const loop=t=>{const p=Math.sin((t-t0)/4800*Math.PI*2);renderAt(p);anim=requestAnimationFrame(loop)};
  anim=requestAnimationFrame(loop);
}

file.addEventListener('change',async()=>{
  sourceFile=file.files?.[0]||null; exported=[];exportBtn.disabled=true;downloadBtn.disabled=true;framesEl.innerHTML='';
  if(!sourceFile)return;
  sourceImg=await fileToImage(sourceFile);
  view.width=1024;view.height=Math.max(600,Math.round(1024/sourceImg.naturalWidth*sourceImg.naturalHeight));
  ctx.drawImage(sourceImg,0,0,view.width,view.height);
  setStatus('Photo chargée. Clique sur « Créer le relief 3D V3 ».');
});

buildBtn.addEventListener('click',async()=>{
  if(!sourceFile)return setStatus('Choisis d’abord une photo.');
  buildBtn.disabled=true;exportBtn.disabled=true;downloadBtn.disabled=true;
  try{
    setStatus('1/5 Détourage précis du sujet…');
    const subjBlob=await removeBackground(sourceFile);
    subjectImg=await blobToImage(subjBlob);

    setStatus('2/5 Création du masque élargi anti-cheveux…');
    const maskBlob=await createMaskFromSubject(subjectImg);

    setStatus('3/5 Reconstruction du fond derrière le sujet…');
    const bgBlob=await eraseSubject(sourceFile,maskBlob);
    backgroundImg=await blobToImage(bgBlob);

    setStatus('4/5 Analyse de profondeur du sujet détouré…');
    subjectDepthMap=await estimateDepth(subjectImg);

    setStatus('5/5 Analyse de profondeur du fond…');
    backgroundDepthMap=await estimateDepth(backgroundImg);

    startPreview();exportBtn.disabled=false;
    setStatus('V3 prête — sujet et fond sont maintenant deux couches indépendantes.');
  }catch(e){
    console.error(e);setStatus('ERREUR : '+(e?.message||e));
  }finally{buildBtn.disabled=false}
});

exportBtn.addEventListener('click',async()=>{
  if(!subjectImg||!backgroundImg)return;
  cancelAnimationFrame(anim);exported=[];framesEl.innerHTML='';
  const angles=[-1,-.75,-.5,-.25,0,.25,.5,.75,1];
  for(let i=0;i<9;i++){
    setStatus(`Export vue ${i+1}/9…`);
    const c=document.createElement('canvas');c.width=view.width;c.height=view.height;
    renderAt(angles[i],c); const b=await canvasBlob(c);exported.push(b);
    const im=new Image();im.src=URL.createObjectURL(b);framesEl.appendChild(im);
    await sleep(30);
  }
  downloadBtn.disabled=false;startPreview();setStatus('9 vues V3 prêtes.');
});

downloadBtn.addEventListener('click',async()=>{
  if(exported.length!==9)return;
  const zip=new JSZip();
  exported.forEach((b,i)=>zip.file(`vue-${String(i+1).padStart(2,'0')}.png`,b));
  zip.file('manifest.json',JSON.stringify({generator:'LentiPrint Relief 3D V3 multicouche',views:9,angle:Number(angle.value),subjectDepth:Number(subjectDepth.value),backgroundDepth:Number(bgDepth.value),edgeProtection:Number(edgeProtect.value)},null,2));
  const b=await zip.generateAsync({type:'blob'});
  const u=URL.createObjectURL(b),a=document.createElement('a');a.href=u;a.download='9-vues-relief-3d-v3.zip';a.click();setTimeout(()=>URL.revokeObjectURL(u),1500);
});
