
import * as THREE from 'https://esm.sh/three@0.169.0';
import { GIFEncoder, quantize, applyPalette } from 'https://unpkg.com/gifenc@1.0.3?module';

let scene,camera,renderer,viewer,mesh,imgTex,depthTex,uniforms,depthEstimator;
let aspect=1.58, raf=0, startTime=0;

function imageFromFile(file){
  return new Promise((resolve,reject)=>{
    const url=URL.createObjectURL(file);
    const img=new Image();
    img.onload=()=>{URL.revokeObjectURL(url);resolve(img)};
    img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('Impossible de lire la photo.'))};
    img.src=url;
  });
}

async function estimator(status){
  if(depthEstimator) return depthEstimator;
  status('Analyse de profondeur IA… premier lancement un peu plus long.',12);
  const {pipeline,env}=await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/+esm');
  env.allowLocalModels=false;
  depthEstimator=await pipeline('depth-estimation','onnx-community/depth-anything-v2-small',{dtype:'q4'});
  return depthEstimator;
}

function percentile(a,p){
  const x=Array.from(a).sort((m,n)=>m-n);
  return x[Math.floor((x.length-1)*p)];
}

function depthCanvas(raw,w,h){
  const sc=document.createElement('canvas');sc.width=raw.width;sc.height=raw.height;
  const sx=sc.getContext('2d'), id=sx.createImageData(raw.width,raw.height);
  for(let i=0;i<raw.width*raw.height;i++){
    const v=raw.data[i];
    id.data[i*4]=v;id.data[i*4+1]=v;id.data[i*4+2]=v;id.data[i*4+3]=255;
  }
  sx.putImageData(id,0,0);

  const c=document.createElement('canvas');c.width=w;c.height=h;
  const ctx=c.getContext('2d');ctx.drawImage(sc,0,0,w,h);
  const d=ctx.getImageData(0,0,w,h), vals=new Uint8Array(w*h);
  for(let i=0;i<vals.length;i++) vals[i]=d.data[i*4];
  let lo=percentile(vals,.04),hi=percentile(vals,.96);if(hi<=lo){lo=0;hi=255}

  for(let i=0;i<vals.length;i++){
    let t=(vals[i]-lo)/(hi-lo);t=Math.max(0,Math.min(1,t));
    // make broad planes rather than noisy pixel deformation
    t=t<.2?.10:t<.42?.30:t<.66?.58:t<.84?.78:.95;
    const v=Math.round(t*255);
    d.data[i*4]=v;d.data[i*4+1]=v;d.data[i*4+2]=v;d.data[i*4+3]=255;
  }
  ctx.putImageData(d,0,0);

  const b=document.createElement('canvas');b.width=w;b.height=h;
  const bx=b.getContext('2d');bx.filter='blur(5px)';bx.drawImage(c,0,0);
  return b;
}

export async function init(v){
  if(renderer) return;
  viewer=v;
  scene=new THREE.Scene();scene.background=new THREE.Color(0x020305);
  camera=new THREE.OrthographicCamera(-.79,.79,.5,-.5,.1,10);camera.position.z=2;
  renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.outputColorSpace=THREE.SRGBColorSpace;
  viewer.appendChild(renderer.domElement);
  resize();addEventListener('resize',resize);
}
function resize(){
  if(!renderer||!viewer) return;
  const w=viewer.clientWidth||760,h=viewer.clientHeight||480;
  renderer.setSize(w,h,false);
}

export async function build(file,status){
  status('1/3 Lecture de la photo…',8);
  const img=await imageFromFile(file);aspect=img.naturalWidth/img.naturalHeight;

  status('2/3 Création des plans de profondeur…',22);
  const est=await estimator(status);
  const max=640,scale=Math.min(1,max/Math.max(img.naturalWidth,img.naturalHeight));
  const iw=Math.max(64,Math.round(img.naturalWidth*scale)),ih=Math.max(64,Math.round(img.naturalHeight*scale));
  const c=document.createElement('canvas');c.width=iw;c.height=ih;c.getContext('2d').drawImage(img,0,0,iw,ih);
  const blob=await new Promise(r=>c.toBlob(r,'image/jpeg',.9)),url=URL.createObjectURL(blob);
  let out;try{out=await est(url)}finally{URL.revokeObjectURL(url)}

  status('3/3 Mise en scène de l’aperçu lenticulaire…',72);
  if(mesh){scene.remove(mesh);mesh.geometry.dispose();mesh.material.dispose()}
  imgTex=new THREE.Texture(img);imgTex.needsUpdate=true;imgTex.colorSpace=THREE.SRGBColorSpace;
  depthTex=new THREE.CanvasTexture(depthCanvas(out.depth,iw,ih));

  uniforms={
    uImage:{value:imgTex},uDepth:{value:depthTex},uView:{value:0},
    uStrength:{value:.065},uZoom:{value:1.0}
  };

  const mat=new THREE.ShaderMaterial({
    uniforms,
    vertexShader:`
      varying vec2 vUv;
      uniform float uView;
      void main(){
        vUv=uv;
        vec3 p=position;
        // subtle whole-card perspective cue
        p.x*=1.0-abs(uView)*0.012;
        p.z+=p.x*uView*.025;
        gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0);
      }
    `,
    fragmentShader:`
      precision highp float;
      varying vec2 vUv;
      uniform sampler2D uImage;
      uniform sampler2D uDepth;
      uniform float uView;
      uniform float uStrength;
      uniform float uZoom;

      float dep(vec2 uv){return texture2D(uDepth,clamp(uv,0.0,1.0)).r;}
      float plane(float d){
        if(d<.2)return .10;
        if(d<.42)return .30;
        if(d<.66)return .58;
        if(d<.84)return .78;
        return .95;
      }

      void main(){
        vec2 center=vec2(.5,.5);
        vec2 uv=center+(vUv-center)/uZoom;

        // background barely moves; near planes move clearly more
        for(int i=0;i<4;i++){
          float d=plane(dep(uv));
          float relative=(d-.34);
          float xshift=uView*uStrength*relative;
          float yshift=uView*uStrength*.06*(d-.5);
          uv=vec2(vUv.x-xshift,vUv.y-yshift);
        }

        uv=clamp(uv,vec2(.003),vec2(.997));

        vec4 c0=texture2D(uImage,uv);
        float px=.0016;
        vec4 c1=texture2D(uImage,clamp(uv+vec2(px,0),0.0,1.0));
        vec4 c2=texture2D(uImage,clamp(uv-vec2(px,0),0.0,1.0));

        float edge=abs(dep(uv+vec2(px,0))-dep(uv-vec2(px,0)));
        float protect=smoothstep(.07,.22,edge);
        vec4 safe=c0*.82+c1*.09+c2*.09;
        gl_FragColor=mix(c0,safe,protect);
      }
    `
  });

  mesh=new THREE.Mesh(new THREE.PlaneGeometry(aspect,1),mat);
  scene.add(mesh);

  camera.left=-aspect/2;camera.right=aspect/2;camera.top=.5;camera.bottom=-.5;camera.updateProjectionMatrix();
  renderer.render(scene,camera);
  status('Aperçu prêt. La simulation tourne automatiquement.',100);
}

function pose(v){
  if(!uniforms)return;
  uniforms.uView.value=v;
  uniforms.uZoom.value=1.0+Math.abs(v)*.012;
  renderer.render(scene,camera);
}

export function start(){
  if(raf)cancelAnimationFrame(raf);
  startTime=performance.now();
  const tick=now=>{
    const t=(now-startTime)/5200;
    pose(Math.sin(t*Math.PI*2)*.42);
    raf=requestAnimationFrame(tick);
  };
  raf=requestAnimationFrame(tick);
}

export async function exportGIF(status){
  if(!mesh)throw new Error('Crée d’abord l’aperçu.');
  if(raf){cancelAnimationFrame(raf);raf=0}
  const enc=GIFEncoder(),n=40,total=5200,delay=Math.round(total/n);
  const W=640,H=Math.round(W/aspect);
  renderer.setSize(W,H,false);
  camera.left=-aspect/2;camera.right=aspect/2;camera.top=.5;camera.bottom=-.5;camera.updateProjectionMatrix();

  for(let i=0;i<n;i++){
    const t=i/(n-1),v=Math.sin(t*Math.PI*2)*.42;
    pose(v);
    const c=document.createElement('canvas');c.width=W;c.height=H;
    const ctx=c.getContext('2d');ctx.drawImage(renderer.domElement,0,0,W,H);
    const rgba=ctx.getImageData(0,0,W,H).data,p=quantize(rgba,256),idx=applyPalette(rgba,p);
    enc.writeFrame(idx,W,H,{palette:p,delay});
    status(`Création du GIF : ${i+1}/${n}`,Math.round((i+1)/n*100));
    await new Promise(r=>setTimeout(r,0));
  }
  enc.finish();
  resize();start();status('GIF démo terminé.',100);
  return new Blob([enc.bytes()],{type:'image/gif'});
}
