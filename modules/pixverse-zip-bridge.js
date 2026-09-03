function supportSpec(doc) {
  const support = doc?.getElementById('supportType')?.value || 'keychain-vertical';
  const map = {
    'keychain-vertical': { id:'keychain-vertical', label:'porte-cle-vertical', width:1024, height:1536 },
    'keychain-horizontal': { id:'keychain-horizontal', label:'porte-cle-horizontal', width:1536, height:1024 },
    'medallion-round-25': { id:'medallion-round-25', label:'medaillon-rond-25mm', width:1024, height:1024, diameterMm:25 },
    'medallion-round': { id:'medallion-round', label:'medaillon-rond-30mm', width:1024, height:1024, diameterMm:30 },
    'business-card': { id:'business-card', label:'carte-85x54', width:1536, height:969 },
    'business-card-88': { id:'business-card-88', label:'carte-88x56', width:1536, height:978 }
  };
  return map[support] || map['keychain-vertical'];
}

function blobToImage(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Impossible de lire une vue PixVerse.')); };
    img.src = url;
  });
}

function canvasToPng(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Impossible de créer une vue PNG.')), 'image/png');
  });
}

async function fitFrameToSupport(frameBlob, spec) {
  const img = await blobToImage(frameBlob);
  const canvas = document.createElement('canvas');
  canvas.width = spec.width;
  canvas.height = spec.height;
  const ctx = canvas.getContext('2d', { alpha:false });
  if (!ctx) throw new Error('Canvas de recadrage indisponible.');

  // Recadrage plein cadre : conserve les proportions et remplit exactement le support.
  const scale = Math.max(spec.width / img.naturalWidth, spec.height / img.naturalHeight);
  const drawW = img.naturalWidth * scale;
  const drawH = img.naturalHeight * scale;
  const x = (spec.width - drawW) / 2;
  const y = (spec.height - drawH) / 2;
  ctx.drawImage(img, x, y, drawW, drawH);
  return canvasToPng(canvas);
}

export function installPixVerseZipBridge(iframe, getPayload, onStatus = () => {}) {
  const doc = iframe?.contentDocument;
  if (!doc) throw new Error('HappyHolo inaccessible.');
  const oldBtn = doc.getElementById('download');
  if (!oldBtn) throw new Error('Bouton ZIP HappyHolo introuvable.');

  const btn = oldBtn.cloneNode(true);
  btn.disabled = false;
  btn.textContent = 'Télécharger ZIP PixVerse';
  btn.dataset.pixverseZipBridge = 'hard-v2';
  oldBtn.replaceWith(btn);

  btn.addEventListener('click', async (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    try {
      const payload = getPayload?.();
      const frames = payload?.frames;
      if (!Array.isArray(frames) || frames.length !== 9) {
        throw new Error('Les 9 vues PixVerse ne sont pas prêtes.');
      }
      if (!payload?.qualityGate?.passed) {
        throw new Error('Export bloqué : doublon, retour en arrière ou mouvement utile insuffisant.');
      }
      const ZipCtor = iframe.contentWindow?.JSZip || window.JSZip;
      if (!ZipCtor) throw new Error('JSZip indisponible.');

      const spec = supportSpec(doc);
      onStatus(`Création ZIP PixVerse au format ${spec.width}×${spec.height}…`);
      const zip = new ZipCtor();
      for (let i = 0; i < frames.length; i++) {
        onStatus(`Recadrage PixVerse ${i + 1}/9 — ${spec.width}×${spec.height}…`);
        const fitted = await fitFrameToSupport(frames[i].blob, spec);
        zip.file(`vue-${String(i + 1).padStart(2, '0')}.png`, fitted);
      }

      const distinct = payload.distinct ?? new Set(frames.map(f => f.fingerprint)).size;
      zip.file('manifest.json', JSON.stringify({
        generator: 'HappyHolo + PixVerse V6',
        source: 'pixverse-video',
        videoId: payload.videoId || null,
        actionId: payload.actionId || null,
        actionLabel: payload.actionLabel || null,
        variantId: payload.variantId || null,
        customRequest: payload.customRequest || null,
        promptProvider: payload.promptProvider || null,
        promptPolicy: payload.promptPolicy || 'lenticular-one-way-v1',
        prompt: payload.promptUsed || payload.prompt || null,
        negativePrompt: payload.negativePromptUsed || payload.negativePrompt || null,
        views: 9,
        distinctFrames: distinct,
        qualityGate: payload.qualityGate,
        sourceWidth: payload.width,
        sourceHeight: payload.height,
        support: spec.id,
        diameterMm: spec.diameterMm || null,
        outputWidth: spec.width,
        outputHeight: spec.height,
        fit: 'cover-center',
        extractionWindow: payload.extractionWindow || null,
        times: frames.map(f => Number(f.time.toFixed(3)))
      }, null, 2));

      const blob = await zip.generateAsync({ type:'blob' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `9-vues-pixverse-${spec.label}-${payload.videoId || Date.now()}.zip`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2500);
      onStatus(`ZIP PixVerse prêt : 9 vues au format ${spec.width}×${spec.height}.`, false, true);
    } catch (e) {
      onStatus(`Erreur ZIP PixVerse : ${e.message}`, true);
    }
  });

  return btn;
}
