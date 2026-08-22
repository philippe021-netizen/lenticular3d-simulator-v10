// HappyHolo Relief 3D — V3.2.0 export multi-supports
// Objectif : un seul exporteur de production pour les modèles à venir.
// - ne remplace plus artificiellement la vue 06 par un fondu 50/50
// - normalise automatiquement le format selon le support choisi
// - conserve les 9 vues générées par le moteur, sans dédoublement ajouté par le patch
// - ajoute la taille physique dans les PNG et un manifest détaillé
(() => {
  'use strict';

  const downloadBtn = document.querySelector('#download');
  const framesEl = document.querySelector('#frames');
  if (!downloadBtn || !framesEl) return;

  const VERSION = 'V3.2.0';
  const DEFAULT_LPI = 75;

  const PROFILES = {
    'keychain-vertical': {
      support: 'keychain-vertical',
      label: 'Porte-clé rectangle vertical',
      widthPx: 1024,
      heightPx: 1536,
      widthMm: 40,
      heightMm: 60,
      lpi: DEFAULT_LPI,
      resizeMode: 'center-cover-no-distortion',
      cropShape: 'rect',
      filename: '9-vues-porte-cle-vertical-75lpi-v320.zip'
    },
    'keychain-horizontal': {
      support: 'keychain-horizontal',
      label: 'Porte-clé rectangle horizontal',
      widthPx: 1536,
      heightPx: 1024,
      widthMm: 60,
      heightMm: 40,
      lpi: DEFAULT_LPI,
      resizeMode: 'center-cover-no-distortion',
      cropShape: 'rect',
      filename: '9-vues-porte-cle-horizontal-75lpi-v320.zip'
    },
    'medallion-round': {
      support: 'medallion-round',
      label: 'Médaillon rond',
      widthPx: 1024,
      heightPx: 1024,
      widthMm: 30,
      heightMm: 30,
      diameterMm: 30,
      lpi: DEFAULT_LPI,
      resizeMode: 'center-cover-no-distortion',
      cropShape: 'circle',
      filename: '9-vues-medallion-rond-75lpi-v320.zip'
    }
  };

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

  function coverRect(sw, sh, dw, dh) {
    const scale = Math.max(dw / sw, dh / sh);
    const w = sw * scale;
    const h = sh * scale;
    return {
      x: (dw - w) / 2,
      y: (dh - h) / 2,
      w,
      h
    };
  }

  function getSelectedProfile() {
    const supportType = document.querySelector('#supportType')?.value;
    if (supportType && PROFILES[supportType]) return PROFILES[supportType];

    const firstImg = framesEl.querySelector('img');
    if (firstImg) {
      const sw = firstImg.naturalWidth || firstImg.width || 1;
      const sh = firstImg.naturalHeight || firstImg.height || 1;
      return sw >= sh ? PROFILES['keychain-horizontal'] : PROFILES['keychain-vertical'];
    }
    return PROFILES['keychain-vertical'];
  }

  async function normalizeBlob(blob, profile) {
    const img = await blobToImage(blob);
    const c = document.createElement('canvas');
    c.width = profile.widthPx;
    c.height = profile.heightPx;
    const x = c.getContext('2d', { alpha: true });
    if (!x) throw new Error('Canvas 2D indisponible.');

    x.clearRect(0, 0, c.width, c.height);
    if (profile.cropShape === 'circle') {
      x.save();
      x.beginPath();
      x.arc(c.width / 2, c.height / 2, Math.min(c.width, c.height) / 2, 0, Math.PI * 2);
      x.closePath();
      x.clip();
    }

    const sw = img.naturalWidth || img.width;
    const sh = img.naturalHeight || img.height;
    const r = coverRect(sw, sh, c.width, c.height);
    x.drawImage(img, r.x, r.y, r.w, r.h);

    if (profile.cropShape === 'circle') {
      x.restore();
    }
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

  async function addPngPhysicalSize(blob, profile) {
    const ppmX = Math.round(profile.widthPx / (profile.widthMm / 1000));
    const ppmY = Math.round(profile.heightPx / (profile.heightMm / 1000));
    const src = new Uint8Array(await blob.arrayBuffer());
    if (src.length < 33 || src[0] !== 137 || src[1] !== 80 || src[2] !== 78 || src[3] !== 71) {
      return { blob, ppmX, ppmY };
    }

    const chunk = new Uint8Array(21);
    writeU32BE(chunk, 0, 9);
    chunk.set([112, 72, 89, 115], 4); // pHYs
    writeU32BE(chunk, 8, ppmX);
    writeU32BE(chunk, 12, ppmY);
    chunk[16] = 1;
    writeU32BE(chunk, 17, crc32(chunk.slice(4, 17)));

    const out = new Uint8Array(src.length + chunk.length);
    out.set(src.slice(0, 33), 0);
    out.set(chunk, 33);
    out.set(src.slice(33), 33 + chunk.length);
    return {
      blob: new Blob([out], { type: 'image/png' }),
      ppmX,
      ppmY
    };
  }

  async function collectFrameBlobs() {
    const imgs = Array.from(framesEl.querySelectorAll('img'));
    if (imgs.length !== 9) throw new Error('Il faut d’abord générer les 9 vues.');
    return Promise.all(
      imgs.map(async (img) => {
        const r = await fetch(img.src);
        if (!r.ok) throw new Error(`Impossible de lire une vue (${r.status}).`);
        return r.blob();
      })
    );
  }

  function setStatusMessage(message) {
    const status = document.querySelector('#status');
    if (status) status.textContent = message;
  }

  downloadBtn.addEventListener('click', async (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    downloadBtn.disabled = true;

    try {
      const profile = getSelectedProfile();
      setStatusMessage(`Préparation de l’export ${profile.label}…`);

      const rawBlobs = await collectFrameBlobs();
      const normalized = await Promise.all(rawBlobs.map((b) => normalizeBlob(b, profile)));

      // Correction structurelle : on conserve la vraie vue 06 générée par le moteur.
      // On ne réinjecte plus aucun fondu 50/50 entre les vues 05 et 07.
      const withPhys = await Promise.all(normalized.map((b) => addPngPhysicalSize(b, profile)));
      const blobs = withPhys.map(x => x.blob);
      const ppmX = withPhys[0]?.ppmX ?? null;
      const ppmY = withPhys[0]?.ppmY ?? null;

      const angle = document.querySelector('#angle');
      const subjectDepth = document.querySelector('#subjectDepth');
      const bgDepth = document.querySelector('#bgDepth');
      const edgeProtect = document.querySelector('#edgeProtect');
      const zip = new JSZip();

      blobs.forEach((b, i) => {
        zip.file(`vue-${String(i + 1).padStart(2, '0')}.png`, b);
      });

      zip.file('manifest.json', JSON.stringify({
        generator: `HappyHolo Relief 3D ${VERSION} export multi-supports`,
        localSegmentation: true,
        externalPaidApi: false,
        views: 9,
        support: profile.support,
        supportLabel: profile.label,
        widthPx: profile.widthPx,
        heightPx: profile.heightPx,
        widthMm: profile.widthMm,
        heightMm: profile.heightMm,
        diameterMm: profile.diameterMm ?? null,
        lpi: profile.lpi,
        pngPixelsPerMeterX: ppmX,
        pngPixelsPerMeterY: ppmY,
        resizeMode: profile.resizeMode,
        cropShape: profile.cropShape,
        monotonicCorrection: 'disabled-bad-midpoint-blend-removed',
        view06Policy: 'keep-native-rendered-view',
        angle: Number(angle?.value ?? 7),
        subjectDepth: Number(subjectDepth?.value ?? 0.48),
        backgroundDepth: Number(bgDepth?.value ?? 0.10),
        edgeProtection: Number(edgeProtect?.value ?? 84)
      }, null, 2));

      const out = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
      const url = URL.createObjectURL(out);
      const a = document.createElement('a');
      a.href = url;
      a.download = profile.filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      setStatusMessage(`Export prêt : ${profile.label}, ${profile.widthPx} × ${profile.heightPx}, ${profile.lpi} LPI.`);
    } catch (e) {
      console.error(e);
      alert('Erreur export multi-supports : ' + (e?.message || String(e)));
      setStatusMessage('Erreur export : ' + (e?.message || String(e)));
    } finally {
      downloadBtn.disabled = false;
    }
  }, true);
})();
