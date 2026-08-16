
const $ = s => document.querySelector(s);
const fileEl=$('#file'), buildBtn=$('#build'), gifBtn=$('#gif'), statusEl=$('#status'), bar=$('#bar');
const preview=$('#sourcePreview'), viewer=$('#viewer'), download=$('#download');
const angle=$('#angle'), frames=$('#frames'), speed=$('#speed');
const angleOut=$('#angleOut'), framesOut=$('#framesOut'), speedOut=$('#speedOut');

angle.oninput=()=>angleOut.value=`±${angle.value}°`;
frames.oninput=()=>framesOut.value=frames.value;
speed.oninput=()=>speedOut.value=`${Number(speed.value).toFixed(1)} s`;

let sourceFile=null;
let engine=null;

async function compressForUpload(file, maxSide=1600, quality=0.82){
  if(file.size <= 2.5 * 1024 * 1024) return file;

  const url = URL.createObjectURL(file);
  try{
    const img = await new Promise((resolve,reject)=>{
      const im = new Image();
      im.onload=()=>resolve(im);
      im.onerror=()=>reject(new Error("Impossible de préparer l’image pour l’envoi."));
      im.src=url;
    });

    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));

    const canvas = document.createElement('canvas');
    canvas.width=w; canvas.height=h;
    const ctx=canvas.getContext('2d', {alpha:false});
    ctx.drawImage(img,0,0,w,h);

    const blob = await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',quality));
    if(!blob) throw new Error("Compression de la photo impossible.");

    return new File([blob], 'photo-optimisee.jpg', {type:'image/jpeg'});
  } finally {
    URL.revokeObjectURL(url);
  }
}


function setStatus(t,p=null){
  statusEl.textContent=t;
  if(p!==null) bar.style.width=`${p}%`;
}

function loadSelectedFile(f){
  if(!f) return;
  if(!f.type || !f.type.startsWith('image/')){
    setStatus('Le fichier choisi n’est pas une image compatible.',0);
    return;
  }
  sourceFile=f;
  buildBtn.disabled=false;
  buildBtn.textContent='Créer la simulation 3D';
  gifBtn.disabled=true;
  download.style.display='none';

  const url=URL.createObjectURL(f);
  preview.onload=()=>URL.revokeObjectURL(url);
  preview.src=url;
  preview.style.display='block';
  setStatus(`Photo chargée : ${f.name || 'image'}. Appuie sur « Créer la simulation 3D ».`,0);
}

fileEl.addEventListener('change',()=>loadSelectedFile(fileEl.files && fileEl.files[0]));

const dropZone=$('#dropZone');
['dragenter','dragover'].forEach(ev=>dropZone.addEventListener(ev,e=>{e.preventDefault();dropZone.classList.add('drag')}));
['dragleave','drop'].forEach(ev=>dropZone.addEventListener(ev,e=>{e.preventDefault();dropZone.classList.remove('drag')}));
dropZone.addEventListener('drop',e=>loadSelectedFile(e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]));

async function getEngine(){
  if(engine) return engine;
  setStatus('Chargement du moteur 3D…',5);
  engine = await import('/engine.js');
  await engine.init3D(viewer);
  return engine;
}

async function fetchWithTimeout(url, options={}, timeout=15000){
  const ctrl=new AbortController();
  const timer=setTimeout(()=>ctrl.abort(), timeout);
  try{
    return await fetch(url,{...options,signal:ctrl.signal,cache:'no-store'});
  }finally{
    clearTimeout(timer);
  }
}

buildBtn.addEventListener('click', async ()=>{
  if(!sourceFile){
    setStatus('Choisis d’abord une photo.',0);
    return;
  }

  buildBtn.disabled=true;
  buildBtn.textContent='Connexion au moteur 3D…';
  gifBtn.disabled=true;
  download.style.display='none';

  try{
    // Crucial: test the Vercel server BEFORE importing Three.js or any external module.
    setStatus('Test du serveur Vercel et de la clé Stability AI…',3);
    const chk=await fetchWithTimeout('/api/check?ts='+Date.now(),{},12000);
    if(!chk.ok) throw new Error(`Serveur Vercel inaccessible (${chk.status}).`);
    const info=await chk.json();

    if(!info.keyConfigured){
      throw new Error('La clé Stability AI n’est pas configurée sur CE projet Vercel V5.');
    }

    setStatus('Serveur OK. Préparation du moteur 3D…',8);
    buildBtn.textContent='Chargement du moteur 3D…';

    const e=await getEngine();
    buildBtn.textContent='Reconstruction 3D en cours…';
    setStatus('Optimisation de la photo pour Vercel…',10);
    const uploadFile = await compressForUpload(sourceFile);
    if(uploadFile.size > 4 * 1024 * 1024){
      throw new Error('La photo reste trop lourde après optimisation.');
    }
    setStatus(`Photo optimisée : ${(uploadFile.size/1024/1024).toFixed(1)} Mo. Reconstruction 3D…`,12);
    await e.build3D(uploadFile, setStatus);
    gifBtn.disabled=false;
    buildBtn.textContent='Recréer la simulation 3D';
  }catch(err){
    console.error(err);
    const msg=(err && err.name==='AbortError')
      ? 'Le serveur ne répond pas. Réessaie dans quelques secondes.'
      : (err && err.message ? err.message : String(err));
    setStatus(`ERREUR : ${msg}`,0);
    buildBtn.textContent='Réessayer la simulation 3D';
  }finally{
    buildBtn.disabled=false;
  }
});

gifBtn.addEventListener('click', async ()=>{
  try{
    if(!engine) throw new Error('Le modèle 3D doit être créé avant le GIF.');
    const blob=await engine.exportGIF({
      angle:Number(angle.value),
      frames:Number(frames.value),
      speed:Number(speed.value)
    }, setStatus);
    download.href=URL.createObjectURL(blob);
    download.style.display='block';
  }catch(err){
    console.error(err);
    setStatus(`Erreur GIF : ${err && err.message ? err.message : String(err)}`,0);
  }
});
