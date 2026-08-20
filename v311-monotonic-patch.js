// LentiPrint Relief 3D — V3.1.1 monotonic export patch
(() => {
  const downloadBtn = document.querySelector('#download');
  const framesEl = document.querySelector('#frames');
  if (!downloadBtn || !framesEl) return;

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

  async function buildMiddleBlob(leftBlob, rightBlob) {
    const [left, right] = await Promise.all([
      blobToImage(leftBlob),
      blobToImage(rightBlob)
    ]);

    const c = document.createElement('canvas');
    c.width = left.naturalWidth;
    c.height = left.naturalHeight;

    const x = c.getContext('2d');
    x.drawImage(left, 0, 0, c.width, c.height);
    x.globalAlpha = 0.5;
    x.drawImage(right, 0, 0, c.width, c.height);
    x.globalAlpha = 1;

    return canvasToBlob(c);
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
      const blobs = await Promise.all(
        imgs.map(img => fetch(img.src).then(r => r.blob()))
      );

      // Correction V3.1.1 :
      // la vue 6 devient le point milieu exact entre les vues 5 et 7.
      // Le passage 5 -> 6 -> 7 est donc garanti régulier.
      blobs[5] = await buildMiddleBlob(blobs[4], blobs[6]);

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
          generator: 'LentiPrint Relief 3D V3.1.1 monotonic',
          localSegmentation: true,
          externalPaidApi: false,
          views: 9,
          monotonicCorrection: 'view-06 midpoint of views 05 and 07',
          angle: Number(angle?.value ?? 7),
          subjectDepth: Number(subjectDepth?.value ?? 0.48),
          backgroundDepth: Number(bgDepth?.value ?? 0.10),
          edgeProtection: Number(edgeProtect?.value ?? 84)
        }, null, 2)
      );

      const out = await zip.generateAsync({ type: 'blob' });

      const url = URL.createObjectURL(out);
      const a = document.createElement('a');
      a.href = url;
      a.download = '9-vues-relief-3d-v311-monotonic.zip';
      a.click();

      setTimeout(() => URL.revokeObjectURL(url), 1500);
    } catch (e) {
      console.error(e);
      alert('Erreur V3.1.1 : ' + (e?.message || String(e)));
    } finally {
      downloadBtn.disabled = false;
    }
  }, true);
})();
