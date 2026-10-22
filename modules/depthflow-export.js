export async function packageDepthflowViews(blobs,Zip,settings={}){
 if(blobs.length!==12)throw new Error('Générer les 12 vues complètes avant export.');
 if(typeof Zip!=='function')throw new Error('Module ZIP indisponible. Rechargez avec une connexion.');
 const zip=new Zip();for(let i=0;i<12;i++){
  if(!(blobs[i] instanceof Blob)||blobs[i].type!=='image/png'||!blobs[i].size)throw new Error(`Vue ${i+1} : PNG absent ou invalide.`);
  zip.file(`vue-${String(i+1).padStart(2,'0')}.png`,blobs[i]);
 }
 zip.file('manifest.json',JSON.stringify({generator:'MicroPlayer DepthFlow V42',views:12,interlaced:false,settings,created:new Date().toISOString(),note:'Importer les PNG dans Entrelacement & impression. Résolution source conservée ; ce ZIP ne constitue pas le TIFF entrelacé.'},null,2));
 return zip.generateAsync({type:'blob',compression:'STORE'});
}
