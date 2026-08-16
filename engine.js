
import * as THREE from 'https://esm.sh/three@0.169.0';
import { GIFEncoder, quantize, applyPalette } from 'https://unpkg.com/gifenc@1.0.3?module';

let scene, camera, renderer, viewer, mesh, sourceTexture, depthTexture;
let imageAspect = 1.4;
let depthEstimator = null;
let uniforms = null;

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
  setStatus("Chargement du moteur de profondeur…",8);
  const { pipeline, env } = await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/+esm');
  env.allowLocalModels = false;
  depthEstimator = await pipeline(
    'depth-estimation',
    'onnx-community/depth-anything-v2-small',
    { dtype: 'q4' }
  );
  return depthEstimator;
}

function percentile(arr,p){
  const a=Array.from(arr).sort((x,y)=>x-y);
  return a[Math.max(0,Math.min(a.length-1,Math.floor((a.length-1)*p)))];
}

function makeDepthCanvas(raw,w,h){
  const srcW=raw.width, srcH=raw.height, src=raw.data;

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
  const d=ctx.getImageData(0,0,w,h);

  const vals=new Uint8Array(w*h);
  for(let i=0;i<vals.length;i++) vals[i]=d.data[i*4];
  let lo=percentile(vals,.03), hi=percentile(vals,.97);
  if(hi<=lo){lo=0;hi=255;}

  // Decide which end is nearer by comparing central subject to borders.
  function avg(x0,y0,x1,y1){
    let s=0,n=0;
    for(let y=y0;y<y1;y+=5) for(let x=x0;x<x1;x+=5){s+=vals[y*w+x];n++;}
    return s/Math.max(1,n);
  }
  const center=avg(w*.28,h*.12,w*.72,h*.9);
  const border=(avg(0,0,w,h*.12)+avg(0,h*.88,w,h)+avg(0,0,w*.12,h)+avg(w*.88,0,w,h))/4;
  const invert=center<border;

  for(let i=0;i<vals.length;i++){
    let t=(vals[i]-lo)/(hi-lo);
    t=Math.max(0,Math.min(1,t));
    if(invert) t=1-t;

    // Increase separation between foreground and background.
    // Keep mid-depth detail while making foreground clearly move more.
    t=Math.pow(t,1.15);
    t=0.05+0.95*t;

    const v=Math.round(t*255);
    d.data[i*4]=v; d.data[i*4+1]=v; d.data[i*4+2]=v; d.data[i*4+3]=255;
  }
  ctx.putImageData(d,0,0);

  // Gentle blur avoids noisy fur causing shimmer.
  const b=document.createElement('canvas');
  b.width=w; b.height=h;
  const bctx=b.getContext('2d');
  bctx.filter='blur(1.6px)';
  bctx.drawImage(c,0,0);
  return b;
}

function clearMesh(){
  if(mesh){ scene.remove(mesh); mesh.geometry.dispose(); mesh.material.dispose(); mesh=null; }
  if(sourceTexture){sourceTexture.dispose(); sourceTexture=null;}
  if(depthTexture){depthTexture.dispose(); depthTexture=null;}
}

export async function init3D(v){
  if(renderer) return;
  viewer=v;
  scene=new THREE.Scene();
  scene.background=new THREE.Color(0x020407);

  camera=new THREE.OrthographicCamera(-1,1,1,-1,0.1,10);
  camera.position.z=2;

  renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  viewer.prepend(renderer.domElement);

  function resize(){
    const w=viewer.clientWidth||700, h=Math.max(560,viewer.clientHeight||560);
    renderer.setSize(w,h,false);
    const va=w/h;
    if(va>imageAspect){
      camera.left=-imageAspect; camera.right=imageAspect; camera.top=1; camera.bottom=-1;
    }else{
      camera.left=-1; camera.right=1; camera.top=1/imageAspect*va; camera.bottom=-1/imageAspect*va;
    }
    camera.updateProjectionMatrix();
  }
  addEventListener('resize',resize);
  resize();
  renderer.setAnimationLoop(()=>renderer.render(scene,camera));
}

export async function build3D(file,setStatus){
  setStatus("1/3 Lecture de la photo…",5);
  const img=await loadImageFromFile(file);
  imageAspect=img.naturalWidth/img.naturalHeight;

  setStatus("2/3 Calcul de la profondeur réelle de la scène…",12);
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
  try{ out=await estimator(url); } finally { URL.revokeObjectURL(url); }

  setStatus("3/3 Construction de la parallaxe lenticulaire…",72);
  clearMesh();

  sourceTexture=new THREE.Texture(img);
  sourceTexture.needsUpdate=true;
  sourceTexture.colorSpace=THREE.SRGBColorSpace;
  sourceTexture.minFilter=THREE.LinearFilter;
  sourceTexture.magFilter=THREE.LinearFilter;

  const depthCanvas=makeDepthCanvas(out.depth,iw,ih);
  depthTexture=new THREE.CanvasTexture(depthCanvas);
  depthTexture.minFilter=THREE.LinearFilter;
  depthTexture.magFilter=THREE.LinearFilter;

  uniforms={
    uImage:{value:sourceTexture},
    uDepth:{value:depthTexture},
    uView:{value:0.0},
    uStrength:{value:0.095},
    uCardYaw:{value:0.0},
    uAspect:{value:imageAspect}
  };

  const mat=new THREE.ShaderMaterial({
    uniforms,
    vertexShader:`
      varying vec2 vUv;
      uniform float uCardYaw;
      void main(){
        vUv=uv;
        vec3 p=position;
        // very subtle whole-card yaw, not the source of the 3D effect
        float k = 0.10 * uCardYaw;
        p.x *= (1.0 - abs(k)*0.12);
        p.z += p.x*k;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p,1.0);
      }
    `,
    fragmentShader:`
      precision highp float;
      varying vec2 vUv;
      uniform sampler2D uImage;
      uniform sampler2D uDepth;
      uniform float uView;
      uniform float uStrength;

      float D(vec2 uv){ return texture2D(uDepth, clamp(uv,0.0,1.0)).r; }

      void main(){
        // Depth-dependent reprojection:
        // near pixels travel more than far pixels.
        float d0=D(vUv);
        float centered=(d0-0.38);
        float shift=uView*uStrength*centered;

        // iterative reverse mapping gives noticeably cleaner edges than one sample
        vec2 uv=vUv;
        for(int i=0;i<4;i++){
          float d=D(uv);
          float s=uView*uStrength*(d-0.38);
          uv=vec2(vUv.x-s, vUv.y);
        }

        // edge-safe sampling
        uv=clamp(uv,vec2(0.002),vec2(0.998));

        // multi-tap fill reduces tiny holes/tears at depth boundaries
        vec4 c0=texture2D(uImage,uv);
        float px=0.0018;
        vec4 c1=texture2D(uImage,clamp(uv+vec2(sign(uView)*px,0.0),0.0,1.0));
        vec4 c2=texture2D(uImage,clamp(uv+vec2(sign(uView)*px*2.0,0.0),0.0,1.0));
        vec4 col=c0*0.74+c1*0.18+c2*0.08;

        gl_FragColor=col;
      }
    `,
    side:THREE.DoubleSide
  });

  const geom=new THREE.PlaneGeometry(imageAspect,1,1,1);
  mesh=new THREE.Mesh(geom,mat);
  scene.add(mesh);

  // Fit orthographic camera to image.
  camera.left=-imageAspect/2; camera.right=imageAspect/2;
  camera.top=.5; camera.bottom=-.5;
  camera.updateProjectionMatrix();

  setStatus("Parallaxe prête : le chat et le fond se déplacent différemment selon leur profondeur.",100);
}

function setPose(view){
  if(!uniforms) return;
  uniforms.uView.value=view;
  uniforms.uCardYaw.value=view;
}

export function previewPose(view){
  setPose(Math.max(-1,Math.min(1,view)));
}

export async function exportGIF(opts,setStatus){
  if(!mesh) throw new Error("Calcule d’abord la parallaxe.");
  const n=Math.max(16,Math.min(64,opts.frames));
  const total=opts.speed*1000, delay=Math.round(total/n);
  const enc=GIFEncoder();

  const W=640, H=Math.round(W/imageAspect);
  renderer.setSize(W,H,false);
  camera.left=-imageAspect/2; camera.right=imageAspect/2;
  camera.top=.5; camera.bottom=-.5; camera.updateProjectionMatrix();

  for(let i=0;i<n;i++){
    const t=i/(n-1);
    const phase=Math.sin(t*Math.PI*2);
    const amplitude=Math.min(1,Math.max(.15,opts.angle/6));
    setPose(phase*amplitude);

    renderer.render(scene,camera);
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

  setPose(0);
  const vw=viewer.clientWidth||700, vh=Math.max(560,viewer.clientHeight||560);
  renderer.setSize(vw,vh,false);

  setStatus("GIF lenticulaire terminé.",100);
  return new Blob([enc.bytes()],{type:'image/gif'});
}
