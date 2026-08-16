
const $ = s => document.querySelector(s);
const fileEl=$('#file'), buildBtn=$('#build'), gifBtn=$('#gif'), statusEl=$('#status'), bar=$('#bar');
const preview=$('#sourcePreview'), viewer=$('#viewer'), download=$('#download'), dropZone=$('#dropZone');

let sourceFile=null, engine=null;

function setStatus(text,p=null){
  statusEl.textContent=text;
  if(p!==null) bar.style.width=`${p}%`;
}

function setFile(file){
  if(!file) return;
  if(!file.type?.startsWith('image/')){
    setStatus('Le fichier choisi n’est pas une image compatible.',0);
    return;
  }
  sourceFile=file;
  buildBtn.disabled=false;
  gifBtn.disabled=true;
  download.style.display='none';
  const url=URL.createObjectURL(file);
  preview.onload=()=>URL.revokeObjectURL(url);
  preview.src=url;
  preview.style.display='block';
  setStatus('Photo chargée. Appuyez sur « Créer l’aperçu 3D ».',0);
}

fileEl.addEventListener('change',()=>setFile(fileEl.files?.[0]));
['dragenter','dragover'].forEach(ev=>dropZone.addEventListener(ev,e=>{e.preventDefault();dropZone.classList.add('drag')}));
['dragleave','drop'].forEach(ev=>dropZone.addEventListener(ev,e=>{e.preventDefault();dropZone.classList.remove('drag')}));
dropZone.addEventListener('drop',e=>setFile(e.dataTransfer?.files?.[0]));

async function getEngine(){
  if(engine) return engine;
  setStatus('Chargement du moteur d’aperçu…',5);
  engine=await import('/engine.js?v=14');
  await engine.init(viewer);
  return engine;
}

buildBtn.addEventListener('click',async()=>{
  if(!sourceFile) return;
  buildBtn.disabled=true;
  buildBtn.textContent='Création de l’aperçu…';
  gifBtn.disabled=true;
  download.style.display='none';
  try{
    const e=await getEngine();
    await e.build(sourceFile,setStatus);
    e.start();
    gifBtn.disabled=false;
    buildBtn.textContent='Recréer l’aperçu 3D';
  }catch(err){
    console.error(err);
    setStatus(`Erreur : ${err?.message || String(err)}`,0);
    buildBtn.textContent='Réessayer';
  }finally{
    buildBtn.disabled=false;
  }
});

gifBtn.addEventListener('click',async()=>{
  if(!engine) return;
  gifBtn.disabled=true;
  try{
    const blob=await engine.exportGIF(setStatus);
    if(download.href) URL.revokeObjectURL(download.href);
    download.href=URL.createObjectURL(blob);
    download.style.display='block';
  }catch(err){
    setStatus(`Erreur GIF : ${err?.message || String(err)}`,0);
  }finally{
    gifBtn.disabled=false;
  }
});
