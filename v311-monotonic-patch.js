// LentiPrint Relief 3D — V3.1.1 monotonic export patch
(() => {
  const downloadBtn = document.querySelector('#download');
  const framesEl = document.querySelector('#frames');

  if (!downloadBtn || !framesEl) return;

  const DEFAULT_LPI = 75;

  function blobToImage(blob) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob);
      const img = new Image();

      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };

      img.onerror = e => {
        URL.revokeObjectURL(url);
        reject(e);
      };

      img.src = url;
    });
  }

  function canvasToBlob(canvas) {
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        blob => blob
          ? resolve(blob)
          : reject(new Error('Impossible de créer le PNG.')),
        'image/png'
      );
    });
  }

  async function buildMiddleBlob(leftBlob, rightBlob) {
    const [left, right] = await Promise.all([
      blobToImage(leftBlob),
      blobToImage(rightBlob)
    ]);

    const canvas = document.createElement('canvas');
    canvas.width = left.naturalWidth;
    canvas.height = left.naturalHeight;

    const ctx = canvas.getContext('2d');

    ctx.drawImage(left, 0, 0, canvas.width, canvas.height);
    ctx.globalAlpha = 0.5;
    ctx.drawImage(right, 0, 0, canvas.width, canvas.height);
    ctx.globalAlpha = 1;

    return canvasToBlob(canvas);
  }

  function readValue(selectors) {
    for (const selector of selectors) {
      const el = document.querySelector(selector);

      if (el && el.value !== undefined && el.value !== '') {
        return el.value;
      }
    }

    return null;
  }

  function detectProduct() {
    const raw = String(
      readValue([
        '#support',
        '#product',
        '#productType',
        '#presetSupport'
      ]) || ''
    ).toLowerCase();

    if (raw.includes('med') || raw.includes('rond')) {
      return 'medaillon';
    }

    if (raw.includes('card') || raw.includes('carte') || raw.includes('cr80')) {
      return 'carte-cr80';
    }

    if (raw.includes('key') || raw.includes('porte')) {
      return 'porte-cle';
    }

    return raw || 'non-defini';
  }

  function detectOrientation(width, height) {
    const raw = String(
      readValue([
        '#orientation',
        '#productOrientation'
      ]) || ''
    ).toLowerCase();

    if (raw.includes('vert') || raw.includes('portrait')) {
      return 'vertical';
    }

    if (raw.includes('horiz') || raw.includes('landscape')) {
      return 'horizontal';
    }

    if (width && height) {
      if (width > height) return 'horizontal';
      if (height > width) return 'vertical';
      return 'carre';
    }

    return 'non-definie';
  }

  function detectPhysicalSize(product, orientation) {
    let widthMm = Number(
      readValue([
        '#widthMm',
        '#productWidthMm'
      ])
    );

    let heightMm = Number(
      readValue([
        '#heightMm',
        '#productHeightMm'
      ])
    );

    if (
      Number.isFinite(widthMm) &&
      widthMm > 0 &&
      Number.isFinite(heightMm) &&
      heightMm > 0
    ) {
      return {
        widthMm,
        heightMm,
        physicalFormatSource: 'interface'
      };
    }

    if (product === 'medaillon') {
      return {
        widthMm: 30,
        heightMm: 30,
        physicalFormatSource: 'preset-medallion-30mm'
      };
    }

    if (product === 'carte-cr80') {
      if (orientation === 'vertical') {
        return {
          widthMm: 54,
          heightMm: 85.6,
          physicalFormatSource: 'preset-cr80'
        };
      }

      return {
        widthMm: 85.6,
        heightMm: 54,
        physicalFormatSource: 'preset-cr80'
      };
    }

    return {
      widthMm: null,
      heightMm: null,
      physicalFormatSource: 'not-defined'
    };
  }

  downloadBtn.addEventListener(
    'click',
    async event => {
      event.preventDefault();
      event.stopImmediatePropagation();

      const imgs = Array.from(
        framesEl.querySelectorAll('img')
      );

      if (imgs.length !== 9) {
        alert('Il faut d’abord générer les 9 vues.');
        return;
      }

      downloadBtn.disabled = true;

      try {
        const blobs = await Promise.all(
          imgs.map(img =>
            fetch(img.src).then(r => r.blob())
          )
        );

        // V3.1.1 monotonic :
        // la vue 06 est reconstruite comme milieu
        // exact entre les vues 05 et 07.
        blobs[5] = await buildMiddleBlob(
          blobs[4],
          blobs[6]
        );

        const firstImage = await blobToImage(blobs[0]);

        const pixelWidth = firstImage.naturalWidth;
        const pixelHeight = firstImage.naturalHeight;

        const product = detectProduct();

        const orientation = detectOrientation(
          pixelWidth,
          pixelHeight
        );

        const physical = detectPhysicalSize(
          product,
          orientation
        );

        const angle =
          document.querySelector('#angle');

        const subjectDepth =
          document.querySelector('#subjectDepth');

        const bgDepth =
          document.querySelector('#bgDepth');

        const edgeProtect =
          document.querySelector('#edgeProtect');

        const zip = new JSZip();

        blobs.forEach((blob, i) => {
          zip.file(
            `vue-${String(i + 1).padStart(2, '0')}.png`,
            blob
          );
        });

        const manifest = {
          generator: 'LentiPrint Relief 3D V3.1.1 monotonic',
          localSegmentation: true,
          externalPaidApi: false,

          lenticular: {
            lpi: DEFAULT_LPI,
            views: 9
          },

          product: product,
          orientation: orientation,

          physicalFormat: {
            widthMm: physical.widthMm,
            heightMm: physical.heightMm,
            source: physical.physicalFormatSource
          },

          imageFormat: {
            widthPx: pixelWidth,
            heightPx: pixelHeight,
            ratio: Number(
              (pixelWidth / pixelHeight).toFixed(6)
            )
          },

          monotonicCorrection:
            'view-06 midpoint of views 05 and 07',

          settings: {
            angle: Number(angle?.value ?? 7),
            subjectDepth: Number(
              subjectDepth?.value ?? 0.48
            ),
            backgroundDepth: Number(
              bgDepth?.value ?? 0.10
            ),
            edgeProtection: Number(
              edgeProtect?.value ?? 84
            )
          },

          productionWarning:
            physical.widthMm === null
              ? 'Physical product dimensions are not yet defined.'
              : null
        };

        zip.file(
          'manifest.json',
          JSON.stringify(manifest, null, 2)
        );

        const out = await zip.generateAsync({
          type: 'blob',
          compression: 'DEFLATE',
          compressionOptions: {
            level: 6
          }
        });

        const url = URL.createObjectURL(out);

        const a = document.createElement('a');
        a.href = url;
        a.download =
          '9-vues-relief-3d-v311-monotonic-75lpi.zip';

        document.body.appendChild(a);
        a.click();
        a.remove();

        setTimeout(() => {
          URL.revokeObjectURL(url);
        }, 3000);

      } catch (e) {
        console.error(e);

        alert(
          'Erreur V3.1.1 : ' +
          (e?.message || String(e))
        );
      } finally {
        downloadBtn.disabled = false;
      }
    },
    true
  );
})();
