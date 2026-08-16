
const $ = s => document.querySelector(s);
const fileEl=$('#file'), buildBtn=$('#build'), gifBtn=$('#gif'), statusEl=$('#status'), bar=$('#bar');
const preview=$('#sourcePreview'), viewer=$('#viewer'), download=$('#download');
const angle=$('#angle'), frames=$('#frames'), speed=$('#speed');
const angleOut=$('#angleOut'), framesOut=$('#framesOut'), speedOut=$('#speedOut');

angle.max='6';
if(Number(angle.value)>6) angle.value='4';
angleOut.value=`±${angle.value}°`;
angle.oninput=()=>angleOut.value=`±${angle.value}°`;
frames.oninput=()=>framesOut.value=frames.value;
speed.oninput=()=>speedOut.value=`${Number(speed.value).toFixed(1)} s`;

let sourceFile=null;
let engine=null;

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
  buildBtn.textContent='Calculer le relief 3D';
  gifBtn.disabled=true;
  download.style.display='none';

  const url=URL.createObjectURL(f);
  preview.onload=()=>URL.revokeObjectURL(url);
  preview.src=url;
  preview.style.display='block';
  setStatus(`Photo chargée : ${f.name || 'image'}. Le chat ne sera pas reconstruit ni redessiné.`,0);
}

fileEl.addEventListener('change',()=>loadSelectedFile(fileEl.files && fileEl.files[0]));

const dropZone=$('#dropZone');
['dragenter','dragover'].forEach(ev=>dropZone.addEventListener(ev,e=>{e.preventDefault();dropZone.classList.add('drag')}));
['dragleave','drop'].forEach(ev=>dropZone.addEventListener(ev,e=>{e.preventDefault();dropZone.classList.remove('drag')}));
dropZone.addEventListener('drop',e=>loadSelectedFile(e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]));

async function getEngine(){
  if(engine) return engine;
  setStatus('Chargement du moteur de profondeur…',4);
  engine=await import('/engine.js?v=11');
  await engine.init3D(viewer);
  return engine;
}

buildBtn.addEventListener('click',async()=>{
  if(!sourceFile){
    setStatus('Choisis d’abord une photo.',0);
    return;
  }
  buildBtn.disabled=true;
  gifBtn.disabled=true;
  download.style.display='none';
  buildBtn.textContent='Calcul du relief…';
  try{
    const e=await getEngine();
    await e.build3D(sourceFile,setStatus);
    gifBtn.disabled=false;
    buildBtn.textContent='Recalculer le relief';
  }catch(err){
    console.error(err);
    setStatus(`ERREUR : ${err?.message || String(err)}`,0);
    buildBtn.textContent='Réessayer';
  }finally{
    buildBtn.disabled=false;
  }
});

gifBtn.addEventListener('click',async()=>{
  try{
    if(!engine) throw new Error('Calcule d’abord le relief.');
    gifBtn.disabled=true;
    const blob=await engine.exportGIF({
      angle:Number(angle.value),
      frames:Number(frames.value),
      speed:Number(speed.value)
    },setStatus);
    if(download.href) URL.revokeObjectURL(download.href);
    download.href=URL.createObjectURL(blob);
    download.style.display='block';
  }catch(err){
    console.error(err);
    setStatus(`Erreur GIF : ${err?.message || String(err)}`,0);
  }finally{
    gifBtn.disabled=false;
  }
});
