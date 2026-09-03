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

  const VERSION = 'V3.25';
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
    'medallion-round-25': {
      support: 'medallion-round-25',
      label: 'Médaillon rond Ø25 mm',
      widthPx: 1024,
      heightPx: 1024,
      widthMm: 25,
      heightMm: 25,
      diameterMm: 25,
      lpi: DEFAULT_LPI,
      resizeMode: 'center-cover-no-distortion',
      cropShape: 'circle',
      filename: '9-vues-medallion-rond-25mm-75lpi-v320.zip'
    },
    'medallion-round': {
      support: 'medallion-round',
      label: 'Médaillon rond Ø30 mm',
      widthPx: 1024,
      heightPx: 1024,
      widthMm: 30,
      heightMm: 30,
      diameterMm: 30,
      lpi: DEFAULT_LPI,
      resizeMode: 'center-cover-no-distortion',
      cropShape: 'circle',
      filename: '9-vues-medallion-rond-30mm-75lpi-v320.zip'
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
    let profile = supportType && PROFILES[supportType] ? PROFILES[supportType] : null;

    const firstImg = framesEl.querySelector('img');
    if (!profile && firstImg) {
      const sw = firstImg.naturalWidth || firstImg.width || 1;
      const sh = firstImg.naturalHeight || firstImg.height || 1;
      profile = sw >= sh ? PROFILES['keychain-horizontal'] : PROFILES['keychain-vertical'];
    }
    profile ||= PROFILES['keychain-vertical'];
    const explode = window.HappyHoloExplodeView?.serialize?.();
    if (!explode) return profile;
    return {
      ...profile,
      lpi: 60,
      filename: profile.filename.replace('75lpi-v320','60lpi-v325-explodeview')
    };
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
        edgeProtection: Number(edgeProtect?.value ?? 84),
        textLayer: window.HappyHoloTextLayer?.serialize?.() || null,
        customBackground: window.HappyHoloCustomBackground?.serialize?.() || null,
        explodeView: window.HappyHoloExplodeView?.serialize?.() || null
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
/* HappyHolo — clin d'oeil sans changement du site
   À AJOUTER à la fin de v311-monotonic-patch.js
   - aucun changement visuel de l'interface
   - aucune nouvelle sélection ni nouvel outil
   - utilise la sélection déjà dessinée au stylet
   - agit uniquement sur les sélections action==='person_wink' ou 'cat_blink'
   - post-traite les 9 vues générées dans #frames
*/
(() => {
  'use strict';

  const SUPPORTED = new Set(['person_wink', 'cat_blink']);
  const WINK_SEQ = [0, 0.22, 0.45, 0.72, 1, 0.72, 0.45, 0.22, 0];
  const $ = s => document.querySelector(s);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function getPlan() {
    return Array.isArray(window.happyHoloSelectionPlan) ? window.happyHoloSelectionPlan : [];
  }

  function maskToCanvas(mask) {
    if (!mask?.width || !mask?.height || !mask?.data) return null;
    const c = document.createElement('canvas');
    c.width = mask.width;
    c.height = mask.height;
    c.getContext('2d').putImageData(mask, 0, 0);
    return c;
  }

  function maskBBox(mask) {
    const d = mask?.data, w = mask?.width, h = mask?.height;
    if (!d || !w || !h) return null;
    let minX = w, minY = h, maxX = -1, maxY = -1, count = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (d[(y * w + x) * 4 + 3] > 12) {
          count++;
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (!count) return null;
    return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1, maskW: w, maskH: h };
  }

  function phaseForFrame(i, timing) {
    const seq = WINK_SEQ;
    if (timing === '1-3') {
      const local = [0, 0.55, 1];
      return i >= 0 && i <= 2 ? local[i] : 0;
    }
    if (timing === '4-6') {
      const local = [0, 0.55, 1];
      return i >= 3 && i <= 5 ? local[i - 3] : 0;
    }
    if (timing === '7-9') {
      const local = [0, 0.55, 1];
      return i >= 6 && i <= 8 ? local[i - 6] : 0;
    }
    return seq[i] ?? 0;
  }

  function frameImgToCanvas(img) {
    const c = document.createElement('canvas');
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    c.width = w;
    c.height = h;
    c.getContext('2d').drawImage(img, 0, 0, w, h);
    return c;
  }

  function scaledMaskCanvas(sel, outW, outH) {
    const mc = maskToCanvas(sel.mask);
    if (!mc) return null;
    const c = document.createElement('canvas');
    c.width = outW;
    c.height = outH;
    c.getContext('2d').drawImage(mc, 0, 0, outW, outH);
    return c;
  }

  function scaledBBox(sel, outW, outH) {
    const b = maskBBox(sel.mask);
    if (!b) return null;
    return {
      x: Math.round((b.x / b.maskW) * outW),
      y: Math.round((b.y / b.maskH) * outH),
      w: Math.max(1, Math.round((b.w / b.maskW) * outW)),
      h: Math.max(1, Math.round((b.h / b.maskH) * outH))
    };
  }

  function cropMasked(canvas, sel, box, scaledMask) {
    const c = document.createElement('canvas');
    c.width = box.w;
    c.height = box.h;
    const x = c.getContext('2d');
    x.drawImage(canvas, box.x, box.y, box.w, box.h, 0, 0, box.w, box.h);
    x.globalCompositeOperation = 'destination-in';
    x.drawImage(scaledMask, box.x, box.y, box.w, box.h, 0, 0, box.w, box.h);
    x.globalCompositeOperation = 'source-over';
    return c;
  }

  function makeClosedEyePatch(srcCrop, closeAmount) {
    const w = srcCrop.width, h = srcCrop.height;
    const out = document.createElement('canvas');
    out.width = w;
    out.height = h;
    const ox = out.getContext('2d');

    const center = h / 2;
    const topKeep = Math.max(1, Math.round(center * (1 - closeAmount * 0.92)));
    const bottomKeep = Math.max(1, Math.round((h - center) * (1 - closeAmount * 0.92)));
    const topSrcH = Math.max(1, Math.round(center));
    const bottomSrcY = Math.round(center);
    const bottomSrcH = Math.max(1, h - bottomSrcY);

    // Paupière haute descend
    ox.drawImage(srcCrop,
      0, 0, w, topSrcH,
      0, 0, w, topKeep
    );

    // Paupière basse monte
    ox.drawImage(srcCrop,
      0, bottomSrcY, w, bottomSrcH,
      0, h - bottomKeep, w, bottomKeep
    );

    // Comble la fente centrale avec un mélange de tons voisins pour éviter le "rectangle écrasé"
    const gapTop = topKeep;
    const gapBottom = h - bottomKeep;
    if (gapBottom > gapTop) {
      const bandH = gapBottom - gapTop;
      const skinBand = document.createElement('canvas');
      skinBand.width = w;
      skinBand.height = Math.max(1, bandH);
      const sx = skinBand.getContext('2d');

      const sampleH = Math.max(1, Math.round(h * 0.12));
      sx.globalAlpha = 0.62;
      sx.drawImage(srcCrop, 0, Math.max(0, topSrcH - sampleH), w, sampleH, 0, 0, w, bandH);
      sx.globalAlpha = 0.38;
      sx.drawImage(srcCrop, 0, bottomSrcY, w, sampleH, 0, 0, w, bandH);
      sx.globalAlpha = 1;

      ox.drawImage(skinBand, 0, gapTop);
    }

    // Trait de fermeture plus net quand l'oeil est presque fermé
    if (closeAmount > 0.25) {
      const lineY = Math.round(center);
      const alpha = clamp((closeAmount - 0.25) / 0.75, 0, 1) * 0.7;
      ox.fillStyle = `rgba(35,28,26,${alpha})`;
      ox.fillRect(0, lineY, w, Math.max(1, Math.round(h * 0.04)));
    }

    return out;
  }

  function applyWinkToSelection(baseCanvas, sel, phase) {
    const out = document.createElement('canvas');
    out.width = baseCanvas.width;
    out.height = baseCanvas.height;
    const x = out.getContext('2d');
    x.drawImage(baseCanvas, 0, 0);

    const amount = clamp((Number(sel.intensity ?? 50) / 100) * phase, 0, 1);
    if (amount <= 0) return out;

    const box = scaledBBox(sel, out.width, out.height);
    const scaledMask = scaledMaskCanvas(sel, out.width, out.height);
    if (!box || !scaledMask) return out;

    const srcCrop = cropMasked(baseCanvas, sel, box, scaledMask);
    const winkPatch = makeClosedEyePatch(srcCrop, amount);

    // Retire uniquement la zone masquée, puis repose le patch modifié.
    x.save();
    x.globalCompositeOperation = 'destination-out';
    x.drawImage(scaledMask, 0, 0);
    x.restore();

    x.drawImage(winkPatch, box.x, box.y, box.w, box.h);
    return out;
  }

  async function replaceImgWithCanvas(img, canvas) {
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(b => b ? resolve(b) : reject(new Error('Conversion PNG impossible')), 'image/png');
    });
    const old = img.src;
    img.src = URL.createObjectURL(blob);
    if (typeof old === 'string' && old.startsWith('blob:')) {
      setTimeout(() => URL.revokeObjectURL(old), 1500);
    }
  }

  let processing = false;
  const seen = new WeakSet();

  async function processFrames() {
    if (processing) return;
    const selections = getPlan().filter(sel => SUPPORTED.has(sel?.action) && sel?.mask);
    if (!selections.length) return;

    const host = $('#frames');
    if (!host) return;
    const imgs = [...host.querySelectorAll('img')];
    if (imgs.length !== 9) return;

    processing = true;
    try {
      for (let i = 0; i < imgs.length; i++) {
        const img = imgs[i];
        if (seen.has(img)) continue;
        if (!img.complete) {
          await new Promise(resolve => img.addEventListener('load', resolve, { once: true }));
        }
        let current = frameImgToCanvas(img);
        for (const sel of selections) {
          const phase = phaseForFrame(i, sel.timing);
          if (phase <= 0) continue;
          current = applyWinkToSelection(current, sel, phase);
        }
        await replaceImgWithCanvas(img, current);
        seen.add(img);
      }
      window.dispatchEvent(new CustomEvent('happyholo:wink-applied', {
        detail: { count: selections.length, views: 9 }
      }));
      console.log('[HAPPYHOLO] clin d\'oeil appliqué sur les 9 vues');
    } catch (err) {
      console.error('[HAPPYHOLO wink patch]', err);
    } finally {
      processing = false;
    }
  }

  function watchFrames() {
    const host = $('#frames');
    if (!host) return false;
    const observer = new MutationObserver(() => {
      const imgs = [...host.querySelectorAll('img')];
      if (imgs.length === 9) {
        setTimeout(processFrames, 120);
      }
    });
    observer.observe(host, { childList: true, subtree: true });
    setTimeout(processFrames, 150);
    return true;
  }

  function boot() {
    if (watchFrames()) return;
    const mo = new MutationObserver(() => {
      if (watchFrames()) mo.disconnect();
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
