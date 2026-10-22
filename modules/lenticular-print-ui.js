import {pixelsForMm,axisMap,copyView,encodeTiff,makePrintPage,reorderViews} from './lenticular-interlace.js?v=1';
const $=id=>document.getElementById(id),collator=new Intl.Collator('fr',{numeric:true,sensitivity:'base'});
let sources=[],busy=false,version=0,links=[];
const tick=()=>new Promise(r=>setTimeout(r,0));
function status(text,error=false){$('status').textContent=text;$('status').className='status'+(error?' error':'');}
function clearOutput(){for(const url of links)URL.revokeObjectURL(url);links=[];$('download').replaceChildren();$('preview').hidden=true;$('previewNote').hidden=true;}
function options(){
 const dpi=Number($('dpi').value),widthMm=Number($('width').value),heightMm=Number($('height').value),pitch=Number($('pitch').value),phase=Number($('phase').value),w=pixelsForMm(widthMm,dpi),h=pixelsForMm(heightMm,dpi);
 if(widthMm<20||widthMm>180||heightMm<20||heightMm>260||w*h>12000000)throw new Error('Choisir un format entre 20 et 180 × 260 mm et au plus 12 millions de pixels pour la mémoire iPad.');
 if(!Number.isFinite(phase)||phase<-1||phase>1||!Number.isFinite(pitch)||pitch<1||pitch>300)throw new Error('Pitch ou décalage invalide.');
 return {dpi,widthMm,heightMm,w,h,pitch,phase,count:sources.length||12,orientation:$('orientation').value,reverse:$('reverse').value==='reverse',fit:$('fit').value,page:$('page').value};
}
function geometry(){try{const o=options(),a4=o.page==='a4';$('geometry').className='status';$('geometry').textContent=`${o.count} vues · ${o.w} × ${o.h} pixels · ${o.dpi} ppp\nTaille raster : ${(o.w/o.dpi*25.4).toFixed(3)} × ${(o.h/o.dpi*25.4).toFixed(3)} mm (arrondi au pixel)\n${(o.dpi/o.pitch).toFixed(6)} pixels par lentille · ${(o.dpi/o.pitch/o.count).toFixed(6)} pixel par vue en moyenne\nTIFF RVB non compressé : environ ${((a4?pixelsForMm(210,o.dpi)*pixelsForMm(297,o.dpi):o.w*o.h)*3/1e6).toFixed(1)} Mo${a4?' · A4 centré, sans redimensionnement':''}`;return true;}catch(e){$('geometry').className='status error';$('geometry').textContent=e.message;return false;}}
function buttons(){const valid=geometry();$('generate').disabled=$('calibrate').disabled=busy||![9,12].includes(sources.length)||!valid;}
function lock(value){busy=value;document.querySelectorAll('input,select,button').forEach(e=>e.disabled=value);if(!value){drawOrder();buttons();}}
function drawOrder(){const host=$('order');host.replaceChildren();sources.forEach((s,i)=>{const li=document.createElement('li');li.append(document.createTextNode(`${s.name} · ${s.width} × ${s.height} `));for(const [label,delta] of [['↑',-1],['↓',1]]){const b=document.createElement('button');b.type='button';b.className='secondary';b.textContent=label;b.setAttribute('aria-label',`Déplacer la vue ${i+1} vers le ${delta<0?'début':'fin'}`);b.disabled=i+delta<0||i+delta>=sources.length;b.onclick=()=>{sources=reorderViews(sources,i,delta);clearOutput();drawOrder();status('Ordre modifié. Régénérez le TIFF.');};li.append(b);}host.append(li);});}
async function decode(blob){const url=URL.createObjectURL(blob),im=new Image();try{await new Promise((resolve,reject)=>{im.onload=resolve;im.onerror=()=>reject(new Error('Image illisible. Convertissez HEIC ou un format non pris en charge en PNG/JPEG.'));im.src=url;});return {im,close(){im.src='';URL.revokeObjectURL(url);}};}catch(e){URL.revokeObjectURL(url);throw e;}}
async function loadFiles(files){
 if(busy)return;const token=++version;clearOutput();sources=[];drawOrder();lock(true);
 try{
  let entries=[];const zips=files.filter(f=>/\.zip$/i.test(f.name));
  if(zips.length){
   if(files.length!==1)throw new Error('Choisir un seul ZIP ou les images séparées.');
   if(!window.JSZip)throw new Error('Module ZIP indisponible. Rechargez avec une connexion ou importez les images séparées.');
   if(zips[0].size>150e6)throw new Error('ZIP trop volumineux (150 Mo maximum).');
   const zip=await JSZip.loadAsync(zips[0]),items=Object.values(zip.files).filter(e=>!e.dir&&!e.name.startsWith('__MACOSX/')&&/\.(png|jpe?g|webp)$/i.test(e.name));
   if(![9,12].includes(items.length))throw new Error(`Le ZIP contient ${items.length} images prises en charge : 12 attendues, ou 9 existantes.`);
   if(items.reduce((n,e)=>n+(e._data?.uncompressedSize||0),0)>200e6)throw new Error('Images décompressées trop volumineuses (200 Mo maximum).');
   items.sort((a,b)=>collator.compare(a.name,b.name));for(const item of items)entries.push({name:item.name,blob:await item.async('blob')});
  }else{if(![9,12].includes(files.length))throw new Error(`${files.length} fichiers : choisir exactement 12 images, ou vos 9 vues existantes.`);entries=files.sort((a,b)=>collator.compare(a.name,b.name)).map(f=>({name:f.name,blob:f}));}
  for(const [i,e] of entries.entries()){
   if(e.blob.size>30e6)throw new Error(`${e.name} dépasse 30 Mo.`);status(`Vérification image ${i+1}/${entries.length}…`);const image=await decode(e.blob);
   try{e.width=image.im.naturalWidth;e.height=image.im.naturalHeight;if(e.width*e.height>50000000)throw new Error('Source trop grande : 50 millions de pixels maximum.');}finally{image.close();}
   await tick();
  }
  if(token!==version)return;sources=entries;drawOrder();$('sourceInfo').textContent=`${sources.length} vues chargées. Aucune image ajoutée ou dupliquée. Vérifiez le sens de la séquence.`;status('Séquence chargée. Vérifiez les réglages puis créez la mire ou le TIFF.');
 }catch(e){sources=[];$('sourceInfo').textContent='Import incomplet : aucune séquence prête.';status(e.message,true);}finally{lock(false);}
}
$('files').onchange=()=>loadFiles([...$('files').files]);
$('effect').onchange=()=>{$('orientation').value=$('effect').value==='3d'?'vertical':'horizontal';clearOutput();buttons();};
for(const id of ['orientation','pitch','dpi','width','height','phase','reverse','fit','page','upscale'])$(id).addEventListener('input',()=>{clearOutput();buttons();status('Réglages modifiés. Régénérez le fichier.');});
function validate(o){
 if(![9,12].includes(sources.length))throw new Error('Aucune série complète chargée.');
 const ratio=sources[0].width/sources[0].height;
 if(sources.some(s=>Math.abs(s.width/s.height/ratio-1)>.002))throw new Error('Les vues ont des proportions différentes. Recadrez-les toutes de façon identique avant import.');
 if(o.fit==='strict'&&Math.abs(ratio/(o.w/o.h)-1)>.005)throw new Error('Le format photo ne correspond pas aux proportions des sources. Ajustez les dimensions ou choisissez explicitement « Recadrer au centre ».');
 if(!$('upscale').checked&&sources.some(s=>s.width<o.w||s.height<o.h))throw new Error('Sources plus petites que la sortie. Utilisez des sources plus définies ou cochez l’acceptation de l’agrandissement. 600 ppp ne crée pas de détails supplémentaires.');
}
async function raster(o,phases,mire=false){
 const stripH=mire?Math.min(o.h,300):o.h,caption=mire?100:0,blockH=stripH+caption,outH=blockH*phases.length,output=new Uint8Array(o.w*outH*3);output.fill(255);
 // Reference is the top-left of the first image band (not its caption).
 // One fixed sheet covers all five candidates; final photo uses the same image-edge reference.
 const maps=phases.map((phase,p)=>axisMap(o.orientation==='vertical'?o.w:stripH,{...o,phase,origin:o.orientation==='vertical'?0:p*blockH}));
 const canvas=document.createElement('canvas');canvas.width=o.w;canvas.height=o.h;const ctx=canvas.getContext('2d',{willReadFrequently:true,colorSpace:'srgb'});
 try{for(let i=0;i<sources.length;i++){
   status(`Entrelacement ${i+1}/${sources.length}${mire?' · 5 décalages':''}…`);await tick();const image=await decode(sources[i].blob);
   try{ctx.fillStyle='white';ctx.fillRect(0,0,o.w,o.h);const scale=Math.max(o.w/image.im.naturalWidth,o.h/image.im.naturalHeight),w=image.im.naturalWidth*scale,h=image.im.naturalHeight*scale;ctx.drawImage(image.im,(o.w-w)/2,(o.h-h)/2,w,h);
    const rgba=ctx.getImageData(0,Math.floor((o.h-stripH)/2),o.w,stripH).data;
    for(let p=0;p<phases.length;p++){const start=(p*blockH+caption)*o.w*3;copyView(output.subarray(start,start+stripH*o.w*3),rgba,o.w,stripH,i,maps[p],o.orientation);}
   }finally{image.close();}await tick();
  }
 }finally{canvas.width=canvas.height=1;}
 if(mire){const label=document.createElement('canvas');label.width=o.w;label.height=caption;const c=label.getContext('2d');for(let p=0;p<phases.length;p++){
   c.fillStyle='white';c.fillRect(0,0,o.w,caption);c.fillStyle='black';c.font='42px sans-serif';c.fillText(`Décalage ${phases[p].toFixed(2)} · ${o.pitch.toFixed(2)} LPI · ${o.count} vues · ${o.orientation==='vertical'?'stries verticales':'stries horizontales'}`,20,65);
   const pixels=c.getImageData(0,0,o.w,caption).data;for(let i=0;i<o.w*caption;i++)output.set(pixels.subarray(i*4,i*4+3),p*blockH*o.w*3+i*3);
  }label.width=label.height=1;}
 return {rgb:output,width:o.w,height:outH};
}
function link(blob,name,label){const a=document.createElement('a'),url=URL.createObjectURL(blob);links.push(url);a.href=url;a.download=name;a.textContent=label;a.style.display='block';a.style.margin='12px 0';$('download').append(a);return a;}
function preview(rgb,w,h){const c=$('preview');c.width=Math.min(720,w);c.height=Math.round(h*c.width/w);const ctx=c.getContext('2d'),out=ctx.createImageData(c.width,c.height);for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++){const q=(Math.floor(y*h/c.height)*w+Math.floor(x*w/c.width))*3,p=(y*c.width+x)*4;out.data.set([rgb[q],rgb[q+1],rgb[q+2],255],p);}ctx.putImageData(out,0,0);c.hidden=$('previewNote').hidden=false;}
async function generate(mire=false){
 if(busy)return;clearOutput();lock(true);
 try{if(mire)$('page').value='a4';const o=options();validate(o);const phases=mire?[-.2,-.1,0,.1,.2].map(v=>Math.round((o.phase+v)*1000000)/1000000):[o.phase];
  const image=await raster(o,phases,mire);status('Construction du TIFF RVB sans compression…');await tick();
  const page=mire||o.page==='a4'?makePrintPage(image.rgb,image.width,image.height,{dpi:o.dpi,marks:true}):{width:image.width,height:image.height,row:y=>image.rgb.subarray(y*image.width*3,(y+1)*image.width*3)};
  const blob=encodeTiff({...page,dpi:o.dpi}),name=`MicroPlayer-${mire?'mire-decalages':'entrelace'}-${o.count}v-${o.pitch.toFixed(2)}LPI-${o.dpi}ppp.tif`;
  link(blob,name,`Télécharger le TIFF ${mire?'de contrôle':'entrelacé'} · ${(blob.size/1e6).toFixed(1)} Mo`);
  const report={version:1,created:new Date().toISOString(),...o,phases,outputPixels:[page.width,page.height],imagePixels:[image.width,image.height],rasterMm:[image.width/o.dpi*25.4,image.height/o.dpi*25.4],placementPixels:page.left==null?null:[page.left,page.top],encoding:'TIFF RGB 8-bit, uncompressed, 600 ppi, sRGB canvas pixels',addressing:'absolute pixel center relative to first image band top-left, shared across mire strips and final photo, pitch precision 0.000001 LPI, no cumulative rounding',sourceFiles:sources.map(s=>({name:s.name,width:s.width,height:s.height})),physicalValidationRequired:true,mirrored:false};
  link(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}),name.replace('.tif','.json'),'Télécharger la fiche des réglages');
  preview(image.rgb,image.width,image.height);status(mire?'Mire prête : cinq décalages autour de la valeur actuelle. Les bandes sont des extraits centraux de la photo, à la même échelle. Choisissez le meilleur à sec puis reportez sa valeur.':'TIFF prêt. Imprimez le fichier téléchargé à 100 %, puis contrôlez la feuille lenticulaire à sec avant collage.');
 }catch(e){status(e.message,true);}finally{lock(false);}
}
$('generate').onclick=()=>generate(false);$('calibrate').onclick=()=>generate(true);
$('demo').onclick=async()=>{
 if(busy)return;lock(true);clearOutput();sources=[];
 try{const c=document.createElement('canvas'),o=options();c.width=o.w;c.height=o.h;const ctx=c.getContext('2d');for(let i=0;i<12;i++){
  status(`Création vue de contrôle ${i+1}/12…`);ctx.fillStyle=`hsl(${i*30} 60% 72%)`;ctx.fillRect(0,0,c.width,c.height);ctx.fillStyle='#12232c';ctx.font=`bold ${Math.round(c.width/9)}px sans-serif`;ctx.fillText(`VUE ${String(i+1).padStart(2,'0')}`,c.width*.1,c.height*.35);ctx.beginPath();ctx.arc(c.width*(.3+i*.035),c.height*.65,c.height*.12,0,Math.PI*2);ctx.fill();const blob=await new Promise(r=>c.toBlob(r,'image/png'));sources.push({name:`controle-${String(i+1).padStart(2,'0')}.png`,blob,width:c.width,height:c.height});await tick();
 }c.width=c.height=1;drawOrder();$('sourceInfo').textContent='12 vues synthétiques de contrôle. Chaque numéro et couleur identifie une vue distincte.';status('Contrôle chargé : créez la mire ou le TIFF pour vérifier le procédé.');
 }catch(e){sources=[];status(e.message,true);}finally{lock(false);}
};
buttons();
