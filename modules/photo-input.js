export function assessPhotoFrameMatch(source, ply, tolerance = 0.035) {
  const sourceAspect = Number(source?.width) / Number(source?.height);
  const plyAspect = Number(ply?.width) / Number(ply?.height);
  if (!(sourceAspect > 0) || !(plyAspect > 0)) {
    return { available: false, warning: false, sourceAspect: null, plyAspect: null, relativeDifference: null, message: 'Cadrage source non mesurable.' };
  }
  const relativeDifference = Math.abs(plyAspect / sourceAspect - 1);
  const warning = relativeDifference > tolerance;
  return {
    available: true,
    warning,
    sourceAspect,
    plyAspect,
    relativeDifference,
    message: warning
      ? `Cadrage différent : photo ${source.width}×${source.height}, PLY ${ply.width}×${ply.height}. Le PLY peut avoir perdu une partie du sujet; MicroPlayer ne peut pas recréer ces pixels.`
      : 'Le ratio du PLY correspond à celui de la photo.'
  };
}

export async function readPhotoDimensions(file, env = globalThis) {
  const objectUrl = env.URL.createObjectURL(file);
  try {
    const image = await new Promise((resolve, reject) => {
      const element = new env.Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('Décodage de la photo impossible.'));
      element.src = objectUrl;
    });
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    if (!(width > 0) || !(height > 0)) throw new Error('Dimensions photo invalides.');
    return { width, height };
  } finally {
    env.URL.revokeObjectURL(objectUrl);
  }
}

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
