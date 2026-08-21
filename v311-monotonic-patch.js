// HappyHolo / LentiPrint — V3.1.1
// Export support-aware + 75 LPI + correction monotonic.
// Ce patch est chargé APRES relief-engine-v31.js.

(() => {
  const exportBtn = document.querySelector('#export');
  const downloadBtn = document.querySelector('#download');
  const framesEl = document.querySelector('#frames');
  const controlsSection = document.querySelector('.card.grid > section:first-child');

  if (!exportBtn || !downloadBtn || !framesEl) return;

  const PRINT_LPI = 75;

  const PRESETS = {
    medallion30: {
      label: 'Médaillon rond Ø30 mm',
      product: 'medaillon',
      orientation: 'carre',
      widthPx: 1024,
      heightPx: 1024,
      widthMm: 30,
      heightMm: 30
    },

    keychainVertical: {
      label: 'Porte-clé rectangle vertical — 2:3',
      product: 'porte-cle',
      orientation: 'vertical',
      widthPx: 1024,
      heightPx: 1536,
      widthMm: null,
      heightMm: null
    },

    keychainHorizontal: {
      label: 'Porte-clé rectangle horizontal — 3:2',
      product: 'porte-cle',
      orientation: 'horizontal',
      widthPx: 1536,
      heightPx: 1024,
      widthMm: null,
      heightMm: null
    },

    cardHorizontal: {
      label: 'Carte CR80 horizontale — 85,6 × 54 mm',
      product: 'carte-cr80',
      orientation: 'horizontal',
      widthPx: 1536,
      heightPx: 969,
      widthMm: 85.6,
      heightMm: 54
    },

    cardVertical: {
      label: 'Carte CR80 verticale — 54 × 85,6 mm',
      product: 'carte-cr80',
      orientation: 'vertical',
      widthPx: 969,
      heightPx: 1536,
      widthMm: 54,
      heightMm: 85.6
    }
  };

  let selectedPresetKey = 'keychainVertical';

  // =========================================================
  // 1 — CHOIX DU SUPPORT
  // =========================================================

  function installSupportSelector() {
    if (document.querySelector('#outputSupport')) return;

    const wrap = document.createElement('div');

    wrap.id = 'outputSupportWrap';

    wrap.innerHTML = `
      <label for="outputSupport">
        Support / format de sortie
      </label>

      <select
        id="outputSupport"
        style="
          width:100%;
          font:inherit;
          padding:11px;
          border:1px solid #ccc;
          border-radius:11px;
          background:#fff;
        "
      >
        <option value="keychainVertical">
          Porte-clé rectangle vertical — 2:3
        </option>

        <option value="keychainHorizontal">
          Porte-clé rectangle horizontal — 3:2
        </option>

        <option value="medallion30">
          Médaillon rond Ø30 mm — 1:1
        </option>

        <option value="cardHorizontal">
          Carte CR80 horizontale — 85,6 × 54 mm
        </option>

        <option value="cardVertical">
          Carte CR80 verticale — 54 × 85,6 mm
        </option>
      </select>

      <div
        id="outputSupportInfo"
        class="small"
        style="margin-top:6px"
      ></div>
    `;

    if (controlsSection) {
      const firstButton = controlsSection.querySelector('button');

      if (firstButton) {
        controlsSection.insertBefore(wrap, firstButton);
      } else {
        controlsSection.appendChild(wrap);
      }
    }

    const select = document.querySelector('#outputSupport');
    const info = document.querySelector('#outputSupportInfo');

    function refresh() {
      selectedPresetKey = select.value;

      const p = PRESETS[selectedPresetKey];

      const physicalText =
        p.widthMm && p.heightMm
          ? ` · ${p.widthMm} × ${p.heightMm} mm`
          : ' · dimensions physiques porte-clé à confirmer';

      info.textContent =
        `${p.widthPx} × ${p.heightPx} px · ` +
        `${PRINT_LPI} LPI · 9 vues${physicalText}`;
    }

    select.addEventListener('change', refresh);

    refresh();
  }

  installSupportSelector();

  // =========================================================
  // 2 — OUTILS
  // =========================================================

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function canvasToBlob(canvas) {
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        blob => {
          if (blob) {
            resolve(blob);
          } else {
            reject(
              new Error('Impossible de créer le PNG.')
            );
          }
        },
        'image/png'
      );
    });
  }

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

  async function buildMiddleBlob(leftBlob, rightBlob) {
    const [left, right] = await Promise.all([
      blobToImage(leftBlob),
      blobToImage(rightBlob)
    ]);

    if (
      left.naturalWidth !== right.naturalWidth ||
      left.naturalHeight !== right.naturalHeight
    ) {
      throw new Error(
        'Les vues 05 et 07 n’ont pas le même format.'
      );
    }

    const canvas = document.createElement('canvas');

    canvas.width = left.naturalWidth;
    canvas.height = left.naturalHeight;

    const ctx = canvas.getContext('2d');

    ctx.drawImage(
      left,
      0,
      0,
      canvas.width,
      canvas.height
    );

    ctx.globalAlpha = 0.5;

    ctx.drawImage(
      right,
      0,
      0,
      canvas.width,
      canvas.height
    );

    ctx.globalAlpha = 1;

    return canvasToBlob(canvas);
  }

  function setLocalStatus(text) {
    const status = document.querySelector('#status');

    if (status) {
      status.textContent = text;
    }
  }

  function currentPreset() {
    return (
      PRESETS[selectedPresetKey] ||
      PRESETS.keychainVertical
    );
  }

  // =========================================================
  // 3 — EXPORT 9 VUES AU FORMAT DU SUPPORT
  // =========================================================

  exportBtn.addEventListener(
    'click',
    async event => {
      event.preventDefault();
      event.stopImmediatePropagation();

      if (typeof window.renderAt !== 'function') {
        setLocalStatus(
          'Erreur : fonction de rendu V3.1 introuvable.'
        );

        return;
      }

      const p = currentPreset();

      const poses = [
        -1,
        -0.75,
        -0.5,
        -0.25,
        0,
        0.25,
        0.5,
        0.75,
        1
      ];

      exportBtn.disabled = true;
      downloadBtn.disabled = true;

      framesEl.innerHTML = '';

      const blobs = [];

      try {
        if (
          typeof window.cancelAnimationFrame === 'function' &&
          window.anim
        ) {
          cancelAnimationFrame(window.anim);
        }

        for (let i = 0; i < 9; i++) {
          setLocalStatus(
            `Export ${i + 1}/9 — ` +
            `${p.label} — ` +
            `${p.widthPx} × ${p.heightPx} px`
          );

          const canvas =
            document.createElement('canvas');

          canvas.width = p.widthPx;
          canvas.height = p.heightPx;

          window.renderAt(
            poses[i],
            canvas
          );

          const blob =
            await canvasToBlob(canvas);

          blobs.push(blob);

          const img = new Image();

          img.src =
            URL.createObjectURL(blob);

          img.alt =
            `Vue ${i + 1}`;

          img.dataset.exportWidth =
            String(p.widthPx);

          img.dataset.exportHeight =
            String(p.heightPx);

          framesEl.appendChild(img);

          await sleep(20);
        }

        // -----------------------------------------------------
        // Correction monotonic V3.1.1
        //
        // Vue 06 = interpolation exacte 50 %
        // entre vues 05 et 07.
        // -----------------------------------------------------

        blobs[5] =
          await buildMiddleBlob(
            blobs[4],
            blobs[6]
          );

        const previewImages =
          framesEl.querySelectorAll('img');

        const view6 =
          previewImages[5];

        if (view6) {
          try {
            URL.revokeObjectURL(
              view6.src
            );
          } catch (_) {}

          view6.src =
            URL.createObjectURL(
              blobs[5]
            );
        }

        // Stockage du véritable export.
        window.__LENTIPRINT_V311_EXPORT__ = {
          blobs,
          presetKey: selectedPresetKey
        };

        downloadBtn.disabled = false;

        setLocalStatus(
          `9 vues prêtes — ` +
          `${p.label} — ` +
          `${p.widthPx} × ${p.heightPx} px — ` +
          `${PRINT_LPI} LPI.`
        );

        if (
          typeof window.startPreview === 'function'
        ) {
          try {
            window.startPreview();
          } catch (_) {}
        }

      } catch (e) {
        console.error(e);

        setLocalStatus(
          'Erreur export : ' +
          (e?.message || String(e))
        );
      } finally {
        exportBtn.disabled = false;
      }
    },
    true
  );

  // =========================================================
  // 4 — CRÉATION DU ZIP FINAL
  // =========================================================

  downloadBtn.addEventListener(
    'click',
    async event => {
      event.preventDefault();
      event.stopImmediatePropagation();

      const data =
        window.__LENTIPRINT_V311_EXPORT__;

      if (
        !data ||
        !Array.isArray(data.blobs) ||
        data.blobs.length !== 9
      ) {
        alert(
          'Il faut d’abord exporter les 9 vues.'
        );

        return;
      }

      if (
        typeof JSZip === 'undefined'
      ) {
        alert(
          'JSZip est indisponible.'
        );

        return;
      }

      const p =
        PRESETS[data.presetKey] ||
        currentPreset();

      const blobs =
        [...data.blobs];

      downloadBtn.disabled = true;

      try {
        const zip =
          new JSZip();

        blobs.forEach(
          (blob, i) => {
            zip.file(
              `vue-${String(i + 1)
                .padStart(2, '0')}.png`,
              blob
            );
          }
        );

        const angle =
          document.querySelector('#angle');

        const subjectDepth =
          document.querySelector(
            '#subjectDepth'
          );

        const bgDepth =
          document.querySelector(
            '#bgDepth'
          );

        const edgeProtect =
          document.querySelector(
            '#edgeProtect'
          );

        const manifest = {
          generator:
            'HappyHolo Relief 3D V3.1.1 support-aware monotonic',

          localSegmentation: true,

          externalPaidApi: false,

          lenticular: {
            lpi: PRINT_LPI,
            views: 9
          },

          product: p.product,

          productLabel: p.label,

          orientation:
            p.orientation,

          physicalFormat: {
            widthMm:
              p.widthMm,

            heightMm:
              p.heightMm,

            source:
              p.widthMm &&
              p.heightMm
                ? 'validated-preset'
                : 'physical-size-not-yet-locked'
          },

          imageFormat: {
            widthPx:
              p.widthPx,

            heightPx:
              p.heightPx,

            ratio:
              Number(
                (
                  p.widthPx /
                  p.heightPx
                ).toFixed(6)
              )
          },

          monotonicCorrection:
            'view-06 midpoint of views 05 and 07',

          settings: {
            angle:
              Number(
                angle?.value ?? 7
              ),

            subjectDepth:
              Number(
                subjectDepth?.value ??
                0.48
              ),

            backgroundDepth:
              Number(
                bgDepth?.value ??
                0.10
              ),

            edgeProtection:
              Number(
                edgeProtect?.value ??
                84
              )
          }
        };

        zip.file(
          'manifest.json',
          JSON.stringify(
            manifest,
            null,
            2
          )
        );

        const out =
          await zip.generateAsync({
            type: 'blob',
            compression:
              'DEFLATE',

            compressionOptions: {
              level: 6
            }
          });

        const url =
          URL.createObjectURL(out);

        const a =
          document.createElement('a');

        a.href = url;

        a.download =
          `9-vues-` +
          `${p.product}-` +
          `${p.orientation}-` +
          `75lpi-v311.zip`;

        document.body.appendChild(a);

        a.click();

        a.remove();

        setTimeout(
          () =>
            URL.revokeObjectURL(
              url
            ),
          4000
        );

        setLocalStatus(
          `ZIP prêt — ` +
          `${p.label} — ` +
          `${PRINT_LPI} LPI — ` +
          `9 vues.`
        );

      } catch (e) {
        console.error(e);

        alert(
          'Erreur ZIP : ' +
          (e?.message || String(e))
        );
      } finally {
        downloadBtn.disabled = false;
      }
    },
    true
  );
})();
