export function installPixVerseZipBridge(iframe, getPayload, onStatus = () => {}) {
  const doc = iframe?.contentDocument;
  if (!doc) throw new Error('HappyHolo inaccessible.');
  const oldBtn = doc.getElementById('download');
  if (!oldBtn) throw new Error('Bouton ZIP HappyHolo introuvable.');

  // Remplace complètement le bouton afin de supprimer tous les anciens
  // écouteurs qui exportaient les 9 vues 3D de la photo d'origine.
  const btn = oldBtn.cloneNode(true);
  btn.disabled = false;
  btn.textContent = 'Télécharger ZIP PixVerse';
  btn.dataset.pixverseZipBridge = 'hard-v1';
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
      const ZipCtor = iframe.contentWindow?.JSZip || window.JSZip;
      if (!ZipCtor) throw new Error('JSZip indisponible.');

      onStatus('Création du ZIP PixVerse…');
      const zip = new ZipCtor();
      frames.forEach((frame, i) => {
        zip.file(`vue-${String(i + 1).padStart(2, '0')}.png`, frame.blob);
      });
      const distinct = payload.distinct ?? new Set(frames.map(f => f.fingerprint)).size;
      zip.file('manifest.json', JSON.stringify({
        generator: 'HappyHolo + PixVerse V6',
        source: 'pixverse-video',
        videoId: payload.videoId || null,
        views: 9,
        distinctFrames: distinct,
        width: payload.width,
        height: payload.height,
        times: frames.map(f => Number(f.time.toFixed(3)))
      }, null, 2));

      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `9-vues-pixverse-${payload.videoId || Date.now()}.zip`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2500);
      onStatus('ZIP PixVerse prêt : 9 vues vidéo incluses.', false, true);
    } catch (e) {
      onStatus(`Erreur ZIP PixVerse : ${e.message}`, true);
    }
  });

  return btn;
}
