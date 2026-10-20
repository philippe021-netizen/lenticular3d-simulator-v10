export function getOriginalPixVerseFile(iframe,directFile=null){
  const file=directFile||iframe?.contentWindow?.HappyHoloGetSourceFile?.()||iframe?.contentDocument?.getElementById('file')?.files?.[0];
  if(!file||typeof file.arrayBuffer!=='function'||!Number.isFinite(file.size))throw new Error('Choisis une photo originale pour PixVerse. Aucun calcul de profondeur n’est nécessaire.');
  return file;
}
