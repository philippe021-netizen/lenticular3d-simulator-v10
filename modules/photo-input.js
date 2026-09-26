export async function normalizePhotoForInfiniSplat(file, env = globalThis) {
  if (!file) return file;
  const name = file.name || 'photo';
  if (!/\.(heic|heif)$/i.test(name) && /^(image\/(jpeg|png|webp))$/i.test(file.type || '')) return file;

  let drawable;
  let objectUrl = null;
  try {
    if (typeof env.createImageBitmap === 'function') {
      try { drawable = await env.createImageBitmap(file); } catch { /* Try Safari's native image decoder below. */ }
    }
    if (!drawable) {
      if (typeof env.Image !== 'function') throw new Error('Décodeur d’image indisponible.');
      objectUrl = env.URL.createObjectURL(file);
      drawable = await new Promise((resolve, reject) => {
        const image = new env.Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('Safari ne peut pas décoder cette image HEIC/HEIF.'));
        image.src = objectUrl;
      });
    }

    const width = drawable.width || drawable.naturalWidth;
    const height = drawable.height || drawable.naturalHeight;
    if (!width || !height) throw new Error('Dimensions photo invalides.');
    const canvas = env.document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas de conversion indisponible.');
    ctx.drawImage(drawable, 0, 0);
    const blob = await new Promise((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('Conversion JPEG impossible.')), 'image/jpeg', .94));
    const safeName = name.replace(/\.(heic|heif)$/i, '') + '.jpg';
    return new env.File([blob], safeName, { type: 'image/jpeg', lastModified: Date.now() });
  } catch (error) {
    throw new Error('Conversion de la photo iPhone impossible dans Safari · ' + (error?.message || error));
  } finally {
    drawable?.close?.();
    if (objectUrl) env.URL.revokeObjectURL(objectUrl);
  }
}
