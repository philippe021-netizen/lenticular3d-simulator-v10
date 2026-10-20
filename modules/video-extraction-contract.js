export function requireExportableFrames(result){
  if(result?.frames?.length!==9)throw new Error('Les 9 vues ne sont pas prêtes.');
  if(!result.qualityGate||typeof result.qualityGate.passed!=='boolean')throw new Error('Contrôle extraction incomplet. Réextrais la vidéo existante, sans relancer PixVerse.');
  if(!result.qualityGate.passed){
    if(result.qualityGate.reason==='return-detected')throw new Error('Export bloqué : retour brutal à la pose initiale détecté dans les vues.');
    throw new Error('Contrôle extraction non validé. Réextrais la vidéo existante.');
  }
}
export async function completeExtraction(result){
  if(!result?.qualityGate||!Number.isFinite(result.width)||!Number.isFinite(result.height)||result.width<=0||result.height<=0)throw new Error('Résultat extraction incomplet : dimensions ou contrôle absents.');
  const dataUrls=await Promise.all(result.frames.map(async frame=>{
    if(!(frame.blob instanceof Blob))throw new Error('Fichier image absent de l’extraction.');
    const bytes=new Uint8Array(await frame.blob.arrayBuffer());let binary='';
    for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
    const url=`data:${frame.blob.type};base64,${btoa(binary)}`;frame.dataUrl=url;return url;
  }));
  return {...result,dataUrls};
}
