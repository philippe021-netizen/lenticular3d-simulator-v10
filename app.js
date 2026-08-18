const $ = (id) => document.getElementById(id);

const imageInput = $('imageInput');
const videoInput = $('videoInput');

const mode3d = $('mode3d');
const modeAnim = $('modeAnim');

const animControls = $('animationControls');

const generateBtn = $('generateBtn');
const exportVideoBtn = $('exportVideoBtn');
const exportViewsBtn = $('exportViewsBtn');

const downloadVideo = $('downloadVideo');

const animGenerate = $('animGenerate');
const animExtract = $('animExtract');
const animDownloadZip = $('animDownloadZip');

const MAX_SELECTION_DURATION = 5;
const NUMBER_OF_VIEWS = 9;

/*
====================================================
ÉTAT
====================================================
*/

let loadedVideo = null;
let loadedVideoURL = null;

let selectionStart = 0;
let selectionEnd = 0;

let extractedViews = [];
let bestSequenceInfo = null;

/*
====================================================
UTILITAIRES
====================================================
*/

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return '0.00';
  return seconds.toFixed(2);
}

/*
====================================================
CRÉATION DES CONTRÔLES VIDÉO
====================================================
*/

function ensureAnimationUI() {
  if (!animControls) return;

  let panel = $('videoSelectionPanel');

  if (panel) return;

  panel = document.createElement('div');
  panel.id = 'videoSelectionPanel';

  panel.innerHTML = `
    <div class="video-selection-block">

      <video
        id="animationPreviewVideo"
        controls
        playsinline
        preload="metadata"
        style="
          width:100%;
          max-width:600px;
          border-radius:12px;
          background:#111;
          margin-bottom:16px;
        "
      ></video>

      <div style="margin-bottom:14px;">
        <strong>Sélection vidéo</strong>
        <div style="font-size:13px;opacity:.7;margin-top:4px;">
          Sélection maximale : 5 secondes
        </div>
      </div>

      <div style="margin-bottom:14px;">
        <label>
          Début :
          <span id="selectionStartLabel">0.00 s</span>
        </label>

        <input
          id="selectionStartRange"
          type="range"
          min="0"
          max="1"
          step="0.05"
          value="0"
          style="width:100%;"
        />
      </div>

      <div style="margin-bottom:14px;">
        <label>
          Fin :
          <span id="selectionEndLabel">0.00 s</span>
        </label>

        <input
          id="selectionEndRange"
          type="range"
          min="0"
          max="1"
          step="0.05"
          value="0"
          style="width:100%;"
        />
      </div>

      <div
        id="selectionDurationInfo"
        style="
          margin:12px 0;
          padding:10px 12px;
          border-radius:8px;
          background:rgba(255,255,255,.06);
        "
      >
        Durée sélectionnée : 0.00 s
      </div>

      <button
        id="previewSelectionBtn"
        type="button"
        style="margin-right:8px;"
      >
        Lire la sélection
      </button>

      <button
        id="autoFindSequenceBtn"
        type="button"
      >
        Trouver le meilleur passage
      </button>

      <div
        id="analysisStatus"
        style="
          margin-top:14px;
          font-size:14px;
          line-height:1.4;
        "
      ></div>

      <div
        id="viewsPreview"
        style="
          display:grid;
          grid-template-columns:repeat(3,1fr);
          gap:8px;
          margin-top:18px;
        "
      ></div>

    </div>
  `;

  animControls.appendChild(panel);

  bindAnimationUI();
}

/*
====================================================
CONTRÔLES
====================================================
*/

function bindAnimationUI() {
  const previewVideo = $('animationPreviewVideo');
  const startRange = $('selectionStartRange');
  const endRange = $('selectionEndRange');

  const previewBtn = $('previewSelectionBtn');
  const autoBtn = $('autoFindSequenceBtn');

  if (startRange) {
    startRange.addEventListener('input', () => {
      selectionStart = Number(startRange.value);

      if (selectionEnd - selectionStart > MAX_SELECTION_DURATION) {
        selectionEnd = selectionStart + MAX_SELECTION_DURATION;
      }

      if (selectionEnd <= selectionStart) {
        selectionEnd = Math.min(
          selectionStart + 0.5,
          loadedVideo?.duration || selectionStart + 0.5
        );
      }

      updateSelectionUI();
    });
  }

  if (endRange) {
    endRange.addEventListener('input', () => {
      selectionEnd = Number(endRange.value);

      if (selectionEnd - selectionStart > MAX_SELECTION_DURATION) {
        selectionStart = selectionEnd - MAX_SELECTION_DURATION;
      }

      if (selectionEnd <= selectionStart) {
        selectionStart = Math.max(0, selectionEnd - 0.5);
      }

      updateSelectionUI();
    });
  }

  if (previewBtn) {
    previewBtn.addEventListener('click', previewSelectedSection);
  }

  if (autoBtn) {
    autoBtn.addEventListener('click', async () => {
      try {
        await findAndExtractBestSequence();
      } catch (error) {
        console.error(error);
        setStatus(`Erreur : ${error.message}`);
      }
    });
  }

  if (previewVideo) {
    previewVideo.addEventListener('timeupdate', () => {
      if (
        previewVideo.currentTime >= selectionEnd &&
        !previewVideo.paused
      ) {
        previewVideo.pause();
      }
    });
  }
}

/*
====================================================
CHARGEMENT VIDÉO
====================================================
*/

if (videoInput) {
  videoInput.addEventListener('change', async (event) => {
    const file = event.target.files?.[0];

    if (!file) return;

    await loadVideoFile(file);
  });
}

async function loadVideoFile(file) {
  ensureAnimationUI();

  const previewVideo = $('animationPreviewVideo');

  if (!previewVideo) {
    throw new Error('Lecteur vidéo introuvable.');
  }

  if (loadedVideoURL) {
    URL.revokeObjectURL(loadedVideoURL);
  }

  loadedVideoURL = URL.createObjectURL(file);

  previewVideo.src = loadedVideoURL;

  loadedVideo = previewVideo;

  await new Promise((resolve, reject) => {
    previewVideo.onloadedmetadata = resolve;
    previewVideo.onerror = reject;
  });

  const duration = previewVideo.duration;

  const startRange = $('selectionStartRange');
  const endRange = $('selectionEndRange');

  startRange.max = duration;
  endRange.max = duration;

  selectionStart = 0;
  selectionEnd = Math.min(MAX_SELECTION_DURATION, duration);

  startRange.value = selectionStart;
  endRange.value = selectionEnd;

  updateSelectionUI();

  extractedViews = [];
  bestSequenceInfo = null;

  renderViewsPreview();

  setStatus(
    `Vidéo chargée : ${formatTime(duration)} s. ` +
    `Choisis une zone de maximum ${MAX_SELECTION_DURATION} secondes.`
  );
}

/*
====================================================
MISE À JOUR SÉLECTION
====================================================
*/

function updateSelectionUI() {
  if (!loadedVideo) return;

  const duration = loadedVideo.duration;

  selectionStart = clamp(selectionStart, 0, duration);
  selectionEnd = clamp(selectionEnd, 0, duration);

  if (selectionEnd <= selectionStart) {
    selectionEnd = Math.min(duration, selectionStart + 0.5);
  }

  if (selectionEnd - selectionStart > MAX_SELECTION_DURATION) {
    selectionEnd = Math.min(
      duration,
      selectionStart + MAX_SELECTION_DURATION
    );
  }

  $('selectionStartRange').value = selectionStart;
  $('selectionEndRange').value = selectionEnd;

  $('selectionStartLabel').textContent =
    `${formatTime(selectionStart)} s`;

  $('selectionEndLabel').textContent =
    `${formatTime(selectionEnd)} s`;

  $('selectionDurationInfo').textContent =
    `Durée sélectionnée : ${
      formatTime(selectionEnd - selectionStart)
    } s`;
}

/*
====================================================
LECTURE DE LA SÉLECTION
====================================================
*/

async function previewSelectedSection() {
  if (!loadedVideo) return;

  loadedVideo.pause();

  loadedVideo.currentTime = selectionStart;

  await waitForSeek(loadedVideo);

  await loadedVideo.play();
}

/*
====================================================
POSITIONNEMENT VIDÉO
====================================================
*/

function waitForSeek(video) {
  return new Promise((resolve) => {
    if (!video.seeking) {
      resolve();
      return;
    }

    const done = () => {
      video.removeEventListener('seeked', done);
      resolve();
    };

    video.addEventListener('seeked', done);
  });
}

/*
====================================================
CAPTURE IMAGE
====================================================
*/

async function captureFrame(video, time, analysisSize = null) {
  video.pause();

  video.currentTime = clamp(
    time,
    0,
    Math.max(0, video.duration - 0.001)
  );

  await waitForSeek(video);

  const canvas = document.createElement('canvas');

  let width = video.videoWidth;
  let height = video.videoHeight;

  if (analysisSize) {
    const ratio = width / height;

    if (width >= height) {
      width = analysisSize;
      height = Math.round(analysisSize / ratio);
    } else {
      height = analysisSize;
      width = Math.round(analysisSize * ratio);
    }
  }

  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d', {
    willReadFrequently: true
  });

  ctx.drawImage(video, 0, 0, width, height);

  return canvas;
}

/*
====================================================
MESURE DE DIFFÉRENCE ENTRE DEUX IMAGES
====================================================
*/

function calculateFrameDifference(canvasA, canvasB) {
  const ctxA = canvasA.getContext('2d', {
    willReadFrequently: true
  });

  const ctxB = canvasB.getContext('2d', {
    willReadFrequently: true
  });

  const width = Math.min(canvasA.width, canvasB.width);
  const height = Math.min(canvasA.height, canvasB.height);

  const dataA = ctxA.getImageData(
    0,
    0,
    width,
    height
  ).data;

  const dataB = ctxB.getImageData(
    0,
    0,
    width,
    height
  ).data;

  let totalDifference = 0;

  const pixelCount = width * height;

  /*
   * On saute quelques pixels pour accélérer l'analyse.
   */

  const step = 4 * 4;

  let samples = 0;

  for (let i = 0; i < dataA.length; i += step) {
    const dr = Math.abs(dataA[i] - dataB[i]);
    const dg = Math.abs(dataA[i + 1] - dataB[i + 1]);
    const db = Math.abs(dataA[i + 2] - dataB[i + 2]);

    const diff = (dr + dg + db) / 3;

    totalDifference += diff;

    samples++;
  }

  return totalDifference / Math.max(samples, 1);
}

/*
====================================================
ÉVALUATION D'UNE SÉQUENCE DE 9 VUES
====================================================
*/

async function evaluateSequence(start, end) {
  const interval = (end - start) / (NUMBER_OF_VIEWS - 1);

  const frames = [];
  const times = [];

  for (let i = 0; i < NUMBER_OF_VIEWS; i++) {
    const time = start + interval * i;

    times.push(time);

    const frame = await captureFrame(
      loadedVideo,
      time,
      160
    );

    frames.push(frame);
  }

  const differences = [];

  for (let i = 1; i < frames.length; i++) {
    const difference = calculateFrameDifference(
      frames[i - 1],
      frames[i]
    );

    differences.push(difference);
  }

  /*
   * Objectif :
   *
   * - mouvement présent
   * - mais pas de gros saut
   * - variations régulières
   */

  const average =
    differences.reduce((sum, value) => sum + value, 0) /
    differences.length;

  const maximum = Math.max(...differences);
  const minimum = Math.min(...differences);

  const variance =
    differences.reduce(
      (sum, value) =>
        sum + Math.pow(value - average, 2),
      0
    ) / differences.length;

  const standardDeviation = Math.sqrt(variance);

  /*
   * Très peu de différence = vidéo presque immobile.
   */

  const noMovementPenalty =
    average < 2.5
      ? (2.5 - average) * 15
      : 0;

  /*
   * Trop de mouvement = risque de saut.
   */

  const excessiveMovementPenalty =
    average > 22
      ? (average - 22) * 4
      : 0;

  /*
   * Un seul très gros changement est mauvais.
   */

  const jumpPenalty =
    maximum > average * 1.8
      ? (maximum - average * 1.8) * 6
      : 0;

  /*
   * Variation irrégulière entre les vues.
   */

  const irregularityPenalty =
    standardDeviation * 4;

  /*
   * On récompense un petit mouvement continu.
   */

  const movementReward =
    average >= 3 && average <= 18
      ? average * 0.7
      : 0;

  const score =
    100
    - noMovementPenalty
    - excessiveMovementPenalty
    - jumpPenalty
    - irregularityPenalty
    + movementReward;

  return {
    start,
    end,
    duration: end - start,
    times,
    differences,
    averageDifference: average,
    maxDifference: maximum,
    minDifference: minimum,
    standardDeviation,
    score
  };
}

/*
====================================================
RECHERCHE DU MEILLEUR PASSAGE
====================================================
*/

async function findBestSequence() {
  if (!loadedVideo) {
    throw new Error('Charge d’abord une vidéo.');
  }

  const selectedDuration =
    selectionEnd - selectionStart;

  if (selectedDuration < 0.7) {
    throw new Error(
      'La sélection est trop courte.'
    );
  }

  /*
   * Durées candidates.
   *
   * Pour 9 vues lenticulaires,
   * environ 1 à 2 secondes donne généralement
   * un mouvement beaucoup plus contrôlable
   * qu'utiliser directement les 5 secondes.
   */

  const candidateDurations = [
    1.0,
    1.25,
    1.5,
    1.75,
    2.0
  ].filter(
    (duration) =>
      duration <= selectedDuration
  );

  /*
   * Si la sélection utilisateur est très courte,
   * on l'utilise directement.
   */

  if (!candidateDurations.length) {
    candidateDurations.push(selectedDuration);
  }

  let best = null;

  let tested = 0;

  for (const duration of candidateDurations) {
    const available =
      selectedDuration - duration;

    /*
     * On analyse environ 12 positions
     * par durée.
     */

    const positionCount =
      available <= 0
        ? 1
        : 12;

    for (
      let index = 0;
      index < positionCount;
      index++
    ) {
      const ratio =
        positionCount === 1
          ? 0
          : index / (positionCount - 1);

      const start =
        selectionStart +
        available * ratio;

      const end =
        start + duration;

      setStatus(
        `Analyse du mouvement… ${tested + 1}`
      );

      const result =
        await evaluateSequence(start, end);

      tested++;

      if (
        !best ||
        result.score > best.score
      ) {
        best = result;
      }

      /*
       * Laisse respirer l'interface.
       */

      await sleep(5);
    }
  }

  return best;
}

/*
====================================================
EXTRACTION DES 9 VUES HD
====================================================
*/

async function extractFinalViews(sequence) {
  const results = [];

  for (
    let i = 0;
    i < NUMBER_OF_VIEWS;
    i++
  ) {
    setStatus(
      `Extraction HD : vue ${i + 1}/${NUMBER_OF_VIEWS}`
    );

    const canvas =
      await captureFrame(
        loadedVideo,
        sequence.times[i]
      );

    const blob = await new Promise(
      (resolve) =>
        canvas.toBlob(
          resolve,
          'image/png',
          1
        )
    );

    results.push({
      index: i + 1,
      time: sequence.times[i],
      canvas,
      blob
    });
  }

  return results;
}

/*
====================================================
ANALYSE + EXTRACTION
====================================================
*/

async function findAndExtractBestSequence() {
  if (!loadedVideo) {
    throw new Error(
      'Aucune vidéo chargée.'
    );
  }

  extractedViews = [];

  renderViewsPreview();

  setStatus(
    'Recherche automatique du passage le plus fluide…'
  );

  const best =
    await findBestSequence();

  if (!best) {
    throw new Error(
      'Impossible de trouver un passage utilisable.'
    );
  }

  bestSequenceInfo = best;

  setStatus(
    `Meilleur passage trouvé : ` +
    `${formatTime(best.start)} s → ` +
    `${formatTime(best.end)} s ` +
    `(${formatTime(best.duration)} s). ` +
    `Extraction des 9 vues…`
  );

  extractedViews =
    await extractFinalViews(best);

  renderViewsPreview();

  setStatus(
    `✓ 9 vues extraites\n` +
    `Passage retenu : ` +
    `${formatTime(best.start)} → ` +
    `${formatTime(best.end)} s\n` +
    `Durée : ${formatTime(best.duration)} s\n` +
    `Score de fluidité : ${best.score.toFixed(1)}`
  );

  return extractedViews;
}

/*
====================================================
APERÇU DES 9 VUES
====================================================
*/

function renderViewsPreview() {
  const container = $('viewsPreview');

  if (!container) return;

  container.innerHTML = '';

  extractedViews.forEach((view) => {
    const wrapper =
      document.createElement('div');

    wrapper.style.position = 'relative';

    const img =
      document.createElement('img');

    img.src =
      view.canvas.toDataURL('image/jpeg', 0.8);

    img.style.width = '100%';
    img.style.display = 'block';
    img.style.borderRadius = '6px';

    const label =
      document.createElement('div');

    label.textContent =
      `${view.index} — ${formatTime(view.time)}s`;

    label.style.fontSize = '11px';
    label.style.textAlign = 'center';
    label.style.marginTop = '3px';

    wrapper.appendChild(img);
    wrapper.appendChild(label);

    container.appendChild(wrapper);
  });
}

/*
====================================================
ZIP DES 9 VUES
====================================================
*/

async function downloadViewsZip() {
  if (!extractedViews.length) {
    await findAndExtractBestSequence();
  }

  if (typeof JSZip === 'undefined') {
    throw new Error(
      'JSZip n’est pas chargé.'
    );
  }

  const zip = new JSZip();

  extractedViews.forEach((view) => {
    const number =
      String(view.index).padStart(2, '0');

    zip.file(
      `vue-${number}.png`,
      view.blob
    );
  });

  const manifest = {
    version: 2,

    type: 'animation-lenticulaire',

    views: NUMBER_OF_VIEWS,

    sourceSelection: {
      start: selectionStart,
      end: selectionEnd,
      duration:
        selectionEnd - selectionStart
    },

    automaticSequence: bestSequenceInfo
      ? {
          start: bestSequenceInfo.start,
          end: bestSequenceInfo.end,
          duration:
            bestSequenceInfo.duration,

          score:
            bestSequenceInfo.score,

          averageDifference:
            bestSequenceInfo.averageDifference,

          maxDifference:
            bestSequenceInfo.maxDifference,

          standardDeviation:
            bestSequenceInfo.standardDeviation,

          frameTimes:
            bestSequenceInfo.times
        }
      : null,

    generatedAt:
      new Date().toISOString()
  };

  zip.file(
    'manifest.json',
    JSON.stringify(
      manifest,
      null,
      2
    )
  );

  const blob =
    await zip.generateAsync({
      type: 'blob'
    });

  const url =
    URL.createObjectURL(blob);

  const link =
    document.createElement('a');

  link.href = url;

  link.download =
    '9-vues-animation-lenticulaire.zip';

  document.body.appendChild(link);

  link.click();

  link.remove();

  setTimeout(
    () => URL.revokeObjectURL(url),
    5000
  );
}

/*
====================================================
BOUTONS EXISTANTS
====================================================
*/

if (animExtract) {
  animExtract.addEventListener(
    'click',
    async () => {
      try {
        await findAndExtractBestSequence();
      } catch (error) {
        console.error(error);
        setStatus(
          `Erreur : ${error.message}`
        );
      }
    }
  );
}

if (animDownloadZip) {
  animDownloadZip.addEventListener(
    'click',
    async () => {
      try {
        await downloadViewsZip();
      } catch (error) {
        console.error(error);
        setStatus(
          `Erreur : ${error.message}`
        );
      }
    }
  );
}

/*
====================================================
STATUT
====================================================
*/

function setStatus(message) {
  const status =
    $('analysisStatus');

  if (status) {
    status.innerText = message;
  }

  console.log(message);
}

/*
====================================================
AFFICHAGE MODE
====================================================
*/

function updateModeDisplay() {
  if (!animControls) return;

  const animationEnabled =
    modeAnim?.checked ||
    modeAnim?.value === 'animation';

  animControls.style.display =
    animationEnabled
      ? ''
      : 'none';

  if (animationEnabled) {
    ensureAnimationUI();
  }
}

if (modeAnim) {
  modeAnim.addEventListener(
    'change',
    updateModeDisplay
  );
}

if (mode3d) {
  mode3d.addEventListener(
    'change',
    updateModeDisplay
  );
}

ensureAnimationUI();
updateModeDisplay();
