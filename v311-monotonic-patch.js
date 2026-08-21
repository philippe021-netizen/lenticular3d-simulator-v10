// HappyHolo Relief 3D — V3.1.8 porte-clé vertical production export
// - 9 vues normalisées en 1024 × 1536 px (ratio 2:3, recadrage centré, sans déformation)
// - vue 06 = milieu exact entre vues 05 et 07
// - taille physique cible 40 × 60 mm ; lenticulaire 75 LPI
(() => {
  const downloadBtn = document.querySelector('#download');
  const framesEl = document.querySelector('#frames');
  if (!downloadBtn || !framesEl) return;

  const OUT_W = 1024;
  const OUT_H = 1536;
  const WIDTH_MM = 40;
  const HEIGHT_MM = 60;
  const LPI = 75;
  // pHYs décrit la densité du raster pour retrouver 40 × 60 mm à l'impression.
  const PPM_X = Math.round(OUT_W / (WIDTH_MM / 1000));
  const PPM_Y = Math.round(OUT_H / (HEIGHT_MM / 1000));

  function blobToImage(blob) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = (e) => {
        URL.revokeObjectURL(url);
        reject(e);
      };
      img.src = url;
    });
  }

  function canvasToBlob(canvas) {
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (b) => b ? resolve(b) : reject(new Error('Impossible de créer le PNG.')),
        'image/png'
      );
    });
  }

  async function normalizeBlob(blob) {
    const img = await blobToImage(blob);
    const c = document.createElement('canvas');
    c.width = OUT_W;
    c.height = OUT_H;
    const x = c.getContext('2d', { alpha: true });
    if (!x) throw new Error('Canvas 2D indisponible.');

    // "cover" : conserve les proportions et recadre au centre.
    // Aucun étirement : le sujet ne change pas de forme.
    const sw = img.naturalWidth || img.width;
    const sh = img.naturalHeight || img.height;
    const scale = Math.max(OUT_W / sw, OUT_H / sh);
    const dw = sw * scale;
    const dh = sh * scale;
    const dx = (OUT_W - dw) / 2;
    const dy = (OUT_H - dh) / 2;

    x.clearRect(0, 0, OUT_W, OUT_H);
    x.drawImage(img, dx, dy, dw, dh);
    return canvasToBlob(c);
  }

  async function buildMiddleBlob(leftBlob, rightBlob) {
    const [left, right] = await Promise.all([
      blobToImage(leftBlob),
      blobToImage(rightBlob)
    ]);

    const c = document.createElement('canvas');
    c.width = OUT_W;
    c.height = OUT_H;
    const x = c.getContext('2d', { alpha: true });
    if (!x) throw new Error('Canvas 2D indisponible.');

    x.clearRect(0, 0, OUT_W, OUT_H);
    x.drawImage(left, 0, 0, OUT_W, OUT_H);
    x.globalAlpha = 0.5;
    x.drawImage(right, 0, 0, OUT_W, OUT_H);
    x.globalAlpha = 1;

    return canvasToBlob(c);
  }

  function writeU32BE(arr, offset, value) {
    arr[offset] = (value >>> 24) & 255;
    arr[offset + 1] = (value >>> 16) & 255;
    arr[offset + 2] = (value >>> 8) & 255;
    arr[offset + 3] = value & 255;
  }

  function crc32(bytes) {
    let crc = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) {
      crc ^= bytes[i];
      for (let k = 0; k < 8; k++) {
        crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
      }
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  async function addPngPhysicalSize(blob, ppmX = PPM_X, ppmY = PPM_Y) {
    const src = new Uint8Array(await blob.arrayBuffer());
    if (src.length < 33 || src[0] !== 137 || src[1] !== 80 || src[2] !== 78 || src[3] !== 71) {
      return blob;
    }

    // pHYs : 4 longueur + 4 type + 9 données + 4 CRC = 21 octets
    const chunk = new Uint8Array(21);
    writeU32BE(chunk, 0, 9);
    chunk.set([112, 72, 89, 115], 4); // "pHYs"
    writeU32BE(chunk, 8, ppmX);
    writeU32BE(chunk, 12, ppmY);
    chunk[16] = 1; // unité = mètre
    writeU32BE(chunk, 17, crc32(chunk.slice(4, 17)));

    // Insère pHYs juste après IHDR (signature 8 + chunk IHDR 25 = offset 33).
    const out = new Uint8Array(src.length + chunk.length);
    out.set(src.slice(0, 33), 0);
    out.set(chunk, 33);
    out.set(src.slice(33), 33 + chunk.length);
    return new Blob([out], { type: 'image/png' });
  }

  downloadBtn.addEventListener('click', async (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();

    const imgs = Array.from(framesEl.querySelectorAll('img'));
    if (imgs.length !== 9) {
      alert('Il faut d’abord générer les 9 vues.');
      return;
    }

    downloadBtn.disabled = true;

    try {
      const rawBlobs = await Promise.all(
        imgs.map(async img => {
          const r = await fetch(img.src);
          if (!r.ok) throw new Error(`Impossible de lire une vue (${r.status}).`);
          return r.blob();
        })
      );

      let blobs = await Promise.all(rawBlobs.map(normalizeBlob));

      // Passage 05 → 06 → 07 strictement régulier.
      blobs[5] = await buildMiddleBlob(blobs[4], blobs[6]);

      // Inscription de la résolution physique dans chaque PNG.
      blobs = await Promise.all(blobs.map(b => addPngPhysicalSize(b)));

      const zip = new JSZip();
      blobs.forEach((b, i) => {
        zip.file(`vue-${String(i + 1).padStart(2, '0')}.png`, b);
      });

      const angle = document.querySelector('#angle');
      const subjectDepth = document.querySelector('#subjectDepth');
      const bgDepth = document.querySelector('#bgDepth');
      const edgeProtect = document.querySelector('#edgeProtect');

      zip.file(
        'manifest.json',
        JSON.stringify({
          generator: 'HappyHolo Relief 3D V3.1.8 porte-clé vertical',
          localSegmentation: true,
          externalPaidApi: false,
          views: 9,
          widthPx: OUT_W,
          heightPx: OUT_H,
          lpi: LPI,
          widthMm: WIDTH_MM,
          heightMm: HEIGHT_MM,
          pngPixelsPerMeterX: PPM_X,
          pngPixelsPerMeterY: PPM_Y,
          resizeMode: 'center-cover-no-distortion',
          monotonicCorrection: 'view-06 midpoint of views 05 and 07',
          angle: Number(angle?.value ?? 7),
          subjectDepth: Number(subjectDepth?.value ?? 0.48),
          backgroundDepth: Number(bgDepth?.value ?? 0.10),
          edgeProtection: Number(edgeProtect?.value ?? 84)
        }, null, 2)
      );

      const out = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
      const url = URL.createObjectURL(out);
      const a = document.createElement('a');
      a.href = url;
      a.download = '9-vues-porte-cle-vertical-75lpi-v318.zip';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (e) {
      console.error(e);
      alert('Erreur export V3.1.8 : ' + (e?.message || String(e)));
    } finally {
      downloadBtn.disabled = false;
    }
  }, true);
})();
