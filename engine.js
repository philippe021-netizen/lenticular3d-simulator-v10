import * as THREE from 'https://esm.sh/three@0.169.0';
import { GLTFLoader } from 'https://esm.sh/three@0.169.0/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'https://esm.sh/three@0.169.0/examples/jsm/controls/OrbitControls.js';
import { GIFEncoder, quantize, applyPalette } from 'https://unpkg.com/gifenc@1.0.3?module';

let scene,camera,renderer,controls,bgPlane,subjectGroup,model,objectUrl,viewer;

export async function init3D(v){
  if(renderer) return;
  viewer=v;
  scene=new THREE.Scene(); scene.background=new THREE.Color(0x030508);
  camera=new THREE.PerspectiveCamera(35,1,0.01,100); camera.position.set(0,0.10,4.6);
  renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true,alpha:false});
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  viewer.prepend(renderer.domElement);
  controls=new OrbitControls(camera,renderer.domElement);
  controls.enableDamping=true; controls.target.set(0,0.02,0); controls.update();
  scene.add(new THREE.HemisphereLight(0xffffff,0x223344,2.15));
  const key=new THREE.DirectionalLight(0xffffff,2.4); key.position.set(3,4,5);scene.add(key);
  const fill=new THREE.DirectionalLight(0x9ec8ff,1.0);fill.position.set(-4,1,2);scene.add(fill);
  subjectGroup=new THREE.Group(); scene.add(subjectGroup);
  function resize(){const w=viewer.clientWidth||700,h=Math.max(560,viewer.clientHeight||560);renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}
  addEventListener('resize',resize); resize();
  renderer.setAnimationLoop(()=>{controls.update();renderer.render(scene,camera)});
}

async function removeBackground(file){
  const fd=new FormData();
  fd.append('image',file,file.name || 'photo.jpg');
  fd.append('output_format','png');
  const r=await fetch('/api/remove-background',{method:'POST',body:fd});
  if(!r.ok){
    let msg=await r.text();
    try{msg=JSON.parse(msg).error||msg}catch{}
    throw new Error(msg || `Erreur détourage ${r.status}`);
  }
  return await r.blob();
}

async function generateGLB(file){
  const isolated=await removeBackground(file);
  const fd=new FormData();
  fd.append('image',isolated,'subject.png');
  fd.append('texture_resolution','1024');
  fd.append('foreground_ratio','0.78');
  const r=await fetch('/api/generate-3d',{method:'POST',body:fd});
  const ct=r.headers.get('content-type')||'';
  if(!r.ok){
    let msg=await r.text();
    try{msg=JSON.parse(msg).error||msg}catch{}
    throw new Error(msg || `Erreur serveur ${r.status}`);
  }
  if(!ct.includes('model/gltf-binary') && !ct.includes('application/octet-stream')){
    const b=await r.blob();
    if(b.size<1000) throw new Error('Réponse 3D invalide reçue du serveur.');
    return b;
  }
  return await r.blob();
}


function fitObject(obj){
  // Stable Fast 3D frequently returns a canonical orientation that does not
  // match the input photo. Normalize first, then turn the model back toward
  // the source camera and place it directly over the photographed subject.
  const box0=new THREE.Box3().setFromObject(obj);
  const size0=box0.getSize(new THREE.Vector3());
  const center0=box0.getCenter(new THREE.Vector3());
  const max0=Math.max(size0.x,size0.y,size0.z)||1;

  const scale=1.48/max0;
  obj.scale.setScalar(scale);

  // Recenter geometry around its own origin after scaling.
  const box1=new THREE.Box3().setFromObject(obj);
  const center1=box1.getCenter(new THREE.Vector3());
  obj.position.sub(center1);

  // Canonical SF3D output often needs a quarter-turn to face the input view.
  // This is the key correction for the "second cat in profile" artifact.
  obj.rotation.set(0, -Math.PI/2, 0);

  // Recompute bounds after yaw and place in front of the source photo.
  obj.updateMatrixWorld(true);
  const box2=new THREE.Box3().setFromObject(obj);
  const size2=box2.getSize(new THREE.Vector3());
  const center2=box2.getCenter(new THREE.Vector3());

  // Slight vertical bias keeps paws/base aligned with the photographed animal.
  obj.position.x -= center2.x;
  obj.position.y -= center2.y + 0.015;
  obj.position.z += 0.22 - center2.z;

  // Final safety fit so the subject stays inside the card frame.
  obj.updateMatrixWorld(true);
  const box3=new THREE.Box3().setFromObject(obj);
  const size3=box3.getSize(new THREE.Vector3());
  const fit=Math.min(1, 1.52/Math.max(size3.x,size3.y));
  if(fit < 1){
    obj.scale.multiplyScalar(fit);
  }
}


function setBackgroundTexture(file){
  const url=URL.createObjectURL(file);
  const tex=new THREE.TextureLoader().load(url,()=>URL.revokeObjectURL(url));
  tex.colorSpace=THREE.SRGBColorSpace;
  if(bgPlane) scene.remove(bgPlane);
  const mat=new THREE.MeshBasicMaterial({map:tex,color:0xffffff,opacity:1,transparent:false,depthWrite:true});
  bgPlane=new THREE.Mesh(new THREE.PlaneGeometry(3.32,2.02),mat);
  bgPlane.position.set(0,0,-0.46);
  bgPlane.renderOrder=-10;
  scene.add(bgPlane);
}

export async function build3D(file,setStatus){
  setStatus('1/4 Détourage automatique du sujet…',10);
  const glb=await generateGLB(file);
  setStatus('3/4 Chargement du maillage 3D isolé…',60);
  if(objectUrl) URL.revokeObjectURL(objectUrl);
  objectUrl=URL.createObjectURL(glb);
  const loader=new GLTFLoader();
  const gltf=await loader.loadAsync(objectUrl);
  subjectGroup.clear();
  model=gltf.scene;
  fitObject(model);
  subjectGroup.add(model);
  setBackgroundTexture(file);
  camera.position.set(0,0.10,4.6);
  camera.lookAt(0,0.02,0);
  controls.target.set(0,0.02,0);
  controls.update();
  setStatus('4/4 Modèle 3D prêt. Le fond n’est plus envoyé au moteur 3D.',100);
}

function framePose(i,n,maxAngle){
  const t=i/(n-1), s=Math.sin(t*Math.PI*2);
  const a=THREE.MathUtils.degToRad(Math.min(maxAngle,8))*s;
  const r=4.6;
  camera.position.set(Math.sin(a)*r,0.10,Math.cos(a)*r);
  camera.lookAt(0,0.02,0);
  subjectGroup.rotation.set(0,0,0);
  if(bgPlane) bgPlane.rotation.set(0,0,0);
  renderer.render(scene,camera);
}

export async function exportGIF(opts,setStatus){
  const n=opts.frames,total=opts.speed*1000,delay=Math.round(total/n);
  const enc=GIFEncoder();
  const W=640,H=440;
  renderer.setSize(W,H,false); camera.aspect=W/H;camera.updateProjectionMatrix();
  for(let i=0;i<n;i++){
    framePose(i,n,opts.angle);
    const tmp=document.createElement('canvas');tmp.width=W;tmp.height=H;
    const c=tmp.getContext('2d'); c.drawImage(renderer.domElement,0,0,W,H);
    const data=c.getImageData(0,0,W,H).data;
    const palette=quantize(data,256), index=applyPalette(data,palette);
    enc.writeFrame(index,W,H,{palette,delay});
    setStatus(`Création du GIF : ${i+1}/${n}`,Math.round((i+1)/n*100));
    await new Promise(r=>setTimeout(r,0));
  }
  enc.finish();
  setStatus('GIF terminé.',100);
  return new Blob([enc.bytes()],{type:'image/gif'});
}
