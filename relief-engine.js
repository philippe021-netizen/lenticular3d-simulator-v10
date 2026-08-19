import * as THREE from "https://esm.sh/three@0.169.0";

let scene=null, camera=null, renderer=null, viewer=null;
let reliefMesh=null, depthEstimator=null;
let animationFrame=0, animationStart=0;
let cameraRadius=5.8;
let maxAngle=8;

function fileToImage(file){
  return new Promise((resolve,reject)=>{
    const url=URL.createObjectURL(file);
    const img=new Image();
    img.onload=()=>{ URL.revokeObjectURL(url); resolve(img); };
    img.onerror=()=>{ URL.revokeObjectURL(url); reject(new Error('Impossible de lire la photo.')); };
    img.src=url;
  });
}

async function getEstimator(setStatus){
  if(depthEstimator) return depthEstimator;
  setStatus?.('Chargement du moteur de profondeur…',15);
  const { pipeline, env } = await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/+esm');
  env.allowLocalModels=false;
  depthEstimator=await pipeline('depth-estimation','onnx-community/depth-anything-v2-small',{dtype:'q4'});
  return depthEstimator;
}

function percentile(values,p){
  const sorted=Array.from(values).sort((a,b)=>a-b);
  return sorted[Math.max(0,Math.min(sorted.length-1,Math.floor((sorted.length-1)*p)))];
}

async function estimateDepth(image,estimator){
  const maxSide=720;
  const scale=Math.min(1,maxSide/Math.max(image.naturalWidth,image.naturalHeight));
  const width=Math.max(64,Math.round(image.naturalWidth*scale));
  const height=Math.max(64,Math.round(image.naturalHeight*scale));
  const canvas=document.createElement('canvas');
  canvas.width=width; canvas.height=height;
  canvas.getContext('2d').drawImage(image,0,0,width,height);
  const blob=await new Promise(r=>canvas.toBlob(r,'image/jpeg',0.92));
  if(!blob) throw new Error('Impossible de préparer la carte de profondeur.');
  const url=URL.createObjectURL(blob);
  try {
    const result=await estimator(url);
    return {raw:result.depth,width,height};
  } finally { URL.revokeObjectURL(url); }
}

function makeDepthCanvas(rawDepth,width,height,softness=1.5){
  const src=document.createElement('canvas');
  src.width=rawDepth.width; src.height=rawDepth.height;
  const sctx=src.getContext('2d');
  const sd=sctx.createImageData(rawDepth.width,rawDepth.height);
  for(let i=0;i<rawDepth.width*rawDepth.height;i++){
    const v=rawDepth.data[i];
    sd.data[i*4]=v; sd.data[i*4+1]=v; sd.data[i*4+2]=v; sd.data[i*4+3]=255;
  }
  sctx.putImageData(sd,0,0);

  const c=document.createElement('canvas');
  c.width=width; c.height=height;
  const ctx=c.getContext('2d');
  ctx.filter=`blur(${softness}px)`;
  ctx.drawImage(src,0,0,width,height);
  ctx.filter='none';
  const id=ctx.getImageData(0,0,width,height);
  const vals=new Uint8Array(width*height);
  for(let i=0;i<vals.length;i++) vals[i]=id.data[i*4];
  let low=percentile(vals,0.03), high=percentile(vals,0.97);
  if(high<=low){ low=0; high=255; }
  for(let i=0;i<vals.length;i++){
    let d=(vals[i]-low)/Math.max(1,high-low);
    d=Math.max(0,Math.min(1,d));
    d=Math.pow(d,1.0);
    const v=Math.round(d*255);
    id.data[i*4]=v; id.data[i*4+1]=v; id.data[i*4+2]=v; id.data[i*4+3]=255;
  }
  ctx.putImageData(id,0,0);
  return c;
}

export async function init(targetViewer){
  if(renderer) return;
  viewer=targetViewer;
  scene=new THREE.Scene();
  scene.background=new THREE.Color(0x05070b);
  camera=new THREE.PerspectiveCamera(27,1,0.01,30);
  camera.position.set(0,0,cameraRadius);
  renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  viewer.innerHTML='';
  viewer.appendChild(renderer.domElement);
  resize();
  window.addEventListener('resize',resize);
}

function resize(){
  if(!renderer||!viewer) return;
  const w=viewer.clientWidth||760, h=viewer.clientHeight||520;
  renderer.setSize(w,h,false);
  camera.aspect=w/h;
  camera.updateProjectionMatrix();
  render();
}

function render(){ if(renderer&&scene&&camera) renderer.render(scene,camera); }

export function setStrength(value){
  if(reliefMesh?.material?.uniforms?.uDepthScale){
    reliefMesh.material.uniforms.uDepthScale.value=Number(value);
    render();
  }
}

export function setMaxAngle(value){ maxAngle=Math.max(2,Math.min(12,Number(value)||8)); }

export async function buildFromPhoto(photoFile,setStatus,options={}){
  if(!renderer) throw new Error('Initialise d’abord le moteur.');
  const image=await fileToImage(photoFile);
  const estimator=await getEstimator(setStatus);
  setStatus?.('Analyse du relief de la photo…',45);
  const depth=await estimateDepth(image,estimator);
  setStatus?.('Construction du relief 3D…',70);

  if(reliefMesh){
    scene.remove(reliefMesh);
    reliefMesh.geometry.dispose();
    reliefMesh.material.dispose();
    reliefMesh=null;
  }

  const imageTexture=new THREE.Texture(image);
  imageTexture.needsUpdate=true;
  imageTexture.colorSpace=THREE.SRGBColorSpace;
  imageTexture.minFilter=THREE.LinearFilter;
  imageTexture.magFilter=THREE.LinearFilter;

  const depthTexture=new THREE.CanvasTexture(makeDepthCanvas(depth.raw,depth.width,depth.height,1.5));
  depthTexture.minFilter=THREE.LinearFilter;
  depthTexture.magFilter=THREE.LinearFilter;

  const aspect=image.naturalWidth/image.naturalHeight;
  const planeHeight=2.9;
  const planeWidth=planeHeight*aspect;
  const strength=Number.isFinite(options.strength)?options.strength:0.42;

  const material=new THREE.ShaderMaterial({
    uniforms:{uImage:{value:imageTexture},uDepth:{value:depthTexture},uDepthScale:{value:strength}},
    side:THREE.DoubleSide,
    vertexShader:`
      varying vec2 vUv;
      uniform sampler2D uDepth;
      uniform float uDepthScale;
      void main(){
        vUv=uv;
        float d=texture2D(uDepth,uv).r;
        vec3 p=position;
        float shaped=smoothstep(0.05,0.95,d);
        p.z+=(shaped-0.5)*uDepthScale;
        gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0);
      }
    `,
    fragmentShader:`
      precision highp float;
      varying vec2 vUv;
      uniform sampler2D uImage;
      void main(){ gl_FragColor=texture2D(uImage,vUv); }
    `
  });

  const geometry=new THREE.PlaneGeometry(planeWidth,planeHeight,260,200);
  reliefMesh=new THREE.Mesh(geometry,material);
  scene.add(reliefMesh);

  cameraRadius=5.8;
  camera.position.set(0,0,cameraRadius);
  camera.lookAt(0,0,0);
  setMaxAngle(options.angle ?? 8);
  render();
  startPreview();
  setStatus?.('Relief 3D prêt — prévisualisation en micro-orbite.',100);
}

function setAngleDegrees(degrees){
  const r=THREE.MathUtils.degToRad(degrees);
  camera.position.set(Math.sin(r)*cameraRadius,0,Math.cos(r)*cameraRadius);
  camera.lookAt(0,0,0);
  render();
}

export function startPreview(){
  stopPreview();
  animationStart=performance.now();
  const loop=t=>{
    const elapsed=(t-animationStart)/5200;
    setAngleDegrees(Math.sin(elapsed*Math.PI*2)*maxAngle);
    animationFrame=requestAnimationFrame(loop);
  };
  animationFrame=requestAnimationFrame(loop);
}

export function stopPreview(){
  if(animationFrame){ cancelAnimationFrame(animationFrame); animationFrame=0; }
}

function canvasToBlob(){
  return new Promise((resolve,reject)=>{
    renderer.domElement.toBlob(blob=>blob?resolve(blob):reject(new Error('Impossible de créer le PNG.')),'image/png');
  });
}

export async function exportNineViews(onProgress=null){
  if(!reliefMesh) throw new Error('Crée d’abord le relief 3D.');
  const angles=[-8,-6,-4,-2,0,2,4,6,8].map(a=>a*(maxAngle/8));
  stopPreview();
  const views=[];
  for(let i=0;i<angles.length;i++){
    const angle=angles[i];
    setAngleDegrees(angle);
    await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
    const blob=await canvasToBlob();
    views.push({index:i+1,angle,filename:`vue-${String(i+1).padStart(2,'0')}.png`,blob});
    onProgress?.(i+1,angles.length,angle);
  }
  setAngleDegrees(0);
  startPreview();
  return views;
}
