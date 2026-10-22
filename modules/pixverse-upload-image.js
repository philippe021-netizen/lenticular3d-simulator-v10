// Keep multipart requests comfortably below Vercel's 4.5 MB body limit.
export const MAX_PIXVERSE_UPLOAD_BYTES = 3500000;

async function decodeImage(file) {
  if (typeof createImageBitmap === 'function') {
    try { return await createImageBitmap(file); } catch { /* Image fallback below. */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return image;
  } finally { URL.revokeObjectURL(url); }
}

export async function preparePixVerseUpload(file, {
  decode = decodeImage, makeCanvas = () => document.createElement('canvas')
} = {}) {
  if (!file || !Number.isFinite(file.size) || !file.size) throw new Error('Photo source manquante.');
  if (file.size <= MAX_PIXVERSE_UPLOAD_BYTES) return file;
  let image;
  try { image = await decode(file); }
  catch { throw new Error('Impossible de lire cette photo pour PixVerse. Utilise un fichier JPEG ou PNG.'); }
  try {
    const width = image.naturalWidth || image.width, height = image.naturalHeight || image.height;
    if (!(width > 0 && height > 0)) throw new Error('Dimensions de photo invalides.');
    const canvas = makeCanvas();
    let scale = Math.min(1, 2048 / Math.max(width, height));
    for (let attempt = 0; attempt < 4; attempt++) {
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Impossible de préparer la copie PixVerse.');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.92 - attempt * 0.1));
      if (!blob) throw new Error('Impossible de préparer la copie PixVerse.');
      if (blob.size <= MAX_PIXVERSE_UPLOAD_BYTES) return blob;
      scale *= 0.75;
    }
    throw new Error('La copie PixVerse reste trop volumineuse. Choisis une photo JPEG plus légère.');
  } finally { image.close?.(); }
}
