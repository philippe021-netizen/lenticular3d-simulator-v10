
import * as THREE from 'https://esm.sh/three@0.169.0';
import { OrbitControls } from 'https://esm.sh/three@0.169.0/examples/jsm/controls/OrbitControls.js';
import { GIFEncoder, quantize, applyPalette } from 'https://unpkg.com/gifenc@1.0.3?module';

let scene, camera, renderer, controls, viewer, mesh, texture, depthTexture;
let imageAspect = 1.4;
let depthEstimator = null;
let baseCameraZ = 4.7;

function loadImageFromFile(file){
  return new Promise((resolve,reject)=>{
    const url=URL.createObjectURL(file);
    const img=new Image();
    img.onload=()=>{ URL.revokeObjectURL(url); resolve(img); };
    img.onerror=()=>{ URL.revokeObjectURL(url); reject(new Error("Impossible de lire la photo.")); };
    img.src=url;
  });
}

async function getDepthEstimator(setStatus){
  if(depthEstimator) return depthEstimator;
  setStatus("Téléchargement du moteur Depth Anything V2… Premier lancement plus long.",8);
  const { pipeline, env } = await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/+esm');
  env.allowLocalModels = false;
  depthEstimator = await pipeline(
    'depth-estimation',
    'onnx-community/depth-anything-v2-small',
    { dtype: 'q4' }
  );
  return depthEstimator;
}

function percentile(arr, p){
  const copy=Array.from(arr).sort((a,b)=>a-b);
  const i=Math.max(0,Math.min(copy.length-1,Math.floor((copy.length-1)*p)));
  return copy[i];
}

function processedDepthCanvas(raw, w, h){
  // RawImage from Transformers.js: grayscale 0..255, already resized to the input.
  const srcW=raw.width, srcH=raw.height;
  const src=raw.data;

  // Downsample to a manageable grayscale canvas first.
  const srcCanvas=document.createElement('canvas');
  srcCanvas.width=srcW; srcCanvas.height=srcH;
  const sctx=srcCanvas.getContext('2d');
  const id=sctx.createImageData(srcW,srcH);
  for(let i=0;i<srcW*srcH;i++){
    const v=src[i];
    id.data[i*4]=v; id.data[i*4+1]=v; id.data[i*4+2]=v; id.data[i*4+3]=255;
  }
  sctx.putImageData(id,0,0);

  const c=document.createElement('canvas');
  c.width=w; c.height=h;
  const ctx=c.getContext('2d');
  ctx.drawImage(srcCanvas,0,0,w,h);
  const data=ctx.getImageData(0,0,w,h);

  const vals=new Uint8Array(w*h);
  for(let i=0;i<vals.length;i++) vals[i]=data.data[i*4];
  let lo=percentile(vals,0.03), hi=percentile(vals,0.97);
  if(hi<=lo) { lo=0; hi=255; }

  // Heuristic orientation check: the main subject is usually central.
  function avg(x0,y0,x1,y1){
    let s=0,n=0;
    for(let y=y0;y<y1;y+=4) for(let x=x0;x<x1;x+=4){ s+=vals[y*w+x]; n++; }
    return s/Math.max(1,n);
  }
  const center=avg(Math.floor(w*.25),Math.floor(h*.15),Math.floor(w*.75),Math.floor(h*.9));
  const border=(avg(0,0,w,Math.floor(h*.12))+avg(0,Math.floor(h*.88),w,h)+avg(0,0,Math.floor(w*.12),h)+avg(Math.floor(w*.88),0,w,h))/4;
  const invert = center < border;

  // Normalize, soften and compress background depth so it does not swing like a flat layer.
  for(let i=0;i<vals.length;i++){
    let t=(vals[i]-lo)/(hi-lo);
    t=Math.max(0,Math.min(1,t));
    if(invert) t=1-t;
    // Emphasise nearer structures while keeping distant background relatively flat.
    t=Math.pow(t,1.35);
    t=0.12 + 0.88*t;
    const v=Math.round(t*255);
    data.data[i*4]=v; data.data[i*4+1]=v; data.data[i*4+2]=v; data.data[i*4+3]=255;
  }
  ctx.putImageData(data,0,0);

  // Small blur removes depth stair-stepping / tiny fur noise.
  const b=document.createElement('canvas');
  b.width=w; b.height=h;
  const bctx=b.getContext('2d');
  bctx.filter='blur(2px)';
  bctx.drawImage(c,0,0);
  return b;
}

function clearMesh(){
  if(mesh){
    scene.remove(mesh);
    mesh.geometry.dispose();
    mesh.material.dispose();
    mesh=null;
  }
  if(texture){ texture.dispose(); texture=null; }
  if(depthTexture){ depthTexture.dispose(); depthTexture=null; }
}

export async function init3D(v){
  if(renderer) return;
  viewer=v;
  scene=new THREE.Scene();
  scene.background=new THREE.Color(0x030508);

  camera=new THREE.PerspectiveCamera(30,1,0.01,100);
  camera.position.set(0,0,baseCameraZ);

  renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  viewer.prepend(renderer.domElement);

  controls=new OrbitControls(camera,renderer.domElement);
  controls.enableDamping=true;
  controls.enablePan=false;
  controls.minDistance=3.8;
  controls.maxDistance=6.2;
  controls.target.set(0,0,0);
  controls.update();

  scene.add(new THREE.AmbientLight(0xffffff,2.0));

  function resize(){
    const w=viewer.clientWidth||700;
    const h=Math.max(560,viewer.clientHeight||560);
    renderer.setSize(w,h,false);
    camera.aspect=w/h;
    camera.updateProjectionMatrix();
  }
  addEventListener('resize',resize);
  resize();
  renderer.setAnimationLoop(()=>{controls.update();renderer.render(scene,camera)});
}

export async function build3D(file,setStatus){
  setStatus("1/3 Lecture de la photo…",5);
  const img=await loadImageFromFile(file);
  imageAspect=img.naturalWidth/img.naturalHeight;

  setStatus("2/3 Calcul de la carte de profondeur — aucune reconstruction du chat.",12);
  const estimator=await getDepthEstimator(setStatus);

  const inferMax=768;
  const scale=Math.min(1,inferMax/Math.max(img.naturalWidth,img.naturalHeight));
  const iw=Math.max(64,Math.round(img.naturalWidth*scale));
  const ih=Math.max(64,Math.round(img.naturalHeight*scale));

  const inferCanvas=document.createElement('canvas');
  inferCanvas.width=iw; inferCanvas.height=ih;
  inferCanvas.getContext('2d').drawImage(img,0,0,iw,ih);

  const blob=await new Promise(resolve=>inferCanvas.toBlob(resolve,'image/jpeg',0.9));
  const url=URL.createObjectURL(blob);
  let out;
  try{
    out=await estimator(url);
  } finally {
    URL.revokeObjectURL(url);
  }

  setStatus("3/3 Construction du relief lenticulaire 2.5D…",72);
  clearMesh();

  texture=new THREE.Texture(img);
  texture.needsUpdate=true;
  texture.colorSpace=THREE.SRGBColorSpace;
  texture.minFilter=THREE.LinearFilter;
  texture.magFilter=THREE.LinearFilter;

  const depthCanvas=processedDepthCanvas(out.depth, iw, ih);
  depthTexture=new THREE.CanvasTexture(depthCanvas);
  depthTexture.minFilter=THREE.LinearFilter;
  depthTexture.magFilter=THREE.LinearFilter;

  const H=2.55;
  const W=H*imageAspect;
  // Dense grid = smooth perspective without inventing new fur/face.
  const segX=Math.max(96,Math.min(220,Math.round(160*imageAspect)));
  const segY=160;
  const geom=new THREE.PlaneGeometry(W,H,segX,segY);

  const mat=new THREE.MeshBasicMaterial({
    map:texture,
    displacementMap:depthTexture,
    displacementScale:0.44,
    displacementBias:-0.20,
    side:THREE.DoubleSide
  });

  mesh=new THREE.Mesh(geom,mat);
  mesh.position.set(0,0,0);
  scene.add(mesh);

  // Fit camera to image.
  const vfov=THREE.MathUtils.degToRad(camera.fov);
  const zForH=(H/2)/Math.tan(vfov/2);
  baseCameraZ=Math.max(4.3,zForH*1.22);
  camera.position.set(0,0,baseCameraZ);
  camera.lookAt(0,0,0);
  controls.target.set(0,0,0);
  controls.update();

  setStatus("Relief prêt : identité de la photo conservée, profondeur calculée pixel par pixel.",100);
}

function framePose(i,n,maxAngle){
  const t=i/(n-1);
  // smooth ping-pong, starts front and returns front
  const phase=Math.sin(t*Math.PI*2);
  const deg=Math.min(Math.max(maxAngle,1),6);
  const a=THREE.MathUtils.degToRad(deg)*phase;
  const r=baseCameraZ;

  camera.position.set(Math.sin(a)*r,0,Math.cos(a)*r);
  camera.lookAt(0,0,0);

  // Tiny counter-shift helps keep the card framing stable while parallax remains.
  if(mesh) mesh.position.x=-Math.sin(a)*0.045;

  renderer.render(scene,camera);
}

export async function exportGIF(opts,setStatus){
  if(!mesh) throw new Error("Calcule d’abord le relief.");
  const n=Math.max(12,Math.min(64,opts.frames));
  const total=opts.speed*1000;
  const delay=Math.round(total/n);
  const enc=GIFEncoder();

  const W=640;
  const H=Math.round(W/Math.max(1.1,imageAspect));
  renderer.setSize(W,H,false);
  camera.aspect=W/H;
  camera.updateProjectionMatrix();

  for(let i=0;i<n;i++){
    framePose(i,n,opts.angle);
    const c=document.createElement('canvas');
    c.width=W; c.height=H;
    const ctx=c.getContext('2d');
    ctx.drawImage(renderer.domElement,0,0,W,H);
    const rgba=ctx.getImageData(0,0,W,H).data;
    const palette=quantize(rgba,256);
    const index=applyPalette(rgba,palette);
    enc.writeFrame(index,W,H,{palette,delay});
    setStatus(`Création du GIF : ${i+1}/${n}`,Math.round((i+1)/n*100));
    await new Promise(r=>setTimeout(r,0));
  }
  enc.finish();

  // Restore viewport.
  const vw=viewer.clientWidth||700, vh=Math.max(560,viewer.clientHeight||560);
  renderer.setSize(vw,vh,false);
  camera.aspect=vw/vh;
  camera.updateProjectionMatrix();

  setStatus("GIF lenticulaire terminé.",100);
  return new Blob([enc.bytes()],{type:'image/gif'});
}
