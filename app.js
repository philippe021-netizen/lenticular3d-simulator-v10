/* =========================================================
   HAPPYHOLO / LENTICULAR LAB
   app.js — VERSION 12
   ---------------------------------------------------------
   - Mode photo / 3D
   - Mode animation / vidéo
   - Vidéo source jusqu'à la durée disponible
   - Zone de travail limitée à 5 secondes maximum
   - Recherche automatique de la meilleure micro-séquence
   - 9 vues exactement
   - Analyse du mouvement lenticulaire utile
   - Direction dominante
   - Régularité des déplacements
   - Pénalisation des retours / à-coups
   - Pénalisation des changements de scène
   - Extraction PNG
   - Téléchargement ZIP
   ========================================================= */

(() => {
  "use strict";

  /* =========================================================
     OUTILS DOM
     ========================================================= */

  const $ = id => document.getElementById(id);

  const imageInput = $("imageInput");

  const mode3d = $("mode3d");
  const modeAnim = $("modeAnim");

  const animControls = $("animationControls");

  const generateBtn = $("generateBtn");
  const exportVideoBtn = $("exportVideoBtn");
  const exportViewsBtn = $("exportViewsBtn");

  const downloadVideo = $("downloadVideo");

  const animGenerate = $("animGenerate");
  const animExtract = $("animExtract");
  const animDownloadZip = $("animDownloadZip");

  /*
    Ces éléments sont facultatifs.

    Le JavaScript fonctionne même si certains n'existent
    pas encore dans le HTML.
  */

  const preview = $("preview");
  const videoPreview = $("videoPreview");

  const animStatus =
    $("animStatus") ||
    $("status") ||
    $("animationStatus");

  const animProgress =
    $("animProgress") ||
    $("progress");

  const animStart =
    $("animStart") ||
    $("clipStart") ||
    $("videoStart");

  const animEnd =
    $("animEnd") ||
    $("clipEnd") ||
    $("videoEnd");

  const animDuration =
    $("animDuration") ||
    $("clipDuration");

  const animStartLabel =
    $("animStartLabel") ||
    $("startLabel");

  const animEndLabel =
    $("animEndLabel") ||
    $("endLabel");

  const animDurationLabel =
    $("animDurationLabel") ||
    $("durationLabel");

  const viewsContainer =
    $("viewsContainer") ||
    $("animationViews") ||
    $("viewsPreview");

  /* =========================================================
     CONSTANTES
     ========================================================= */

  const VIEW_COUNT = 9;

  /*
    L'utilisateur peut sélectionner au maximum
    5 secondes dans une vidéo longue.
  */

  const MAX_WORKING_CLIP = 5.0;

  /*
    Durées testées pour trouver la meilleure micro-animation.

    On cherche une séquence assez courte pour produire
    un lenticulaire propre.

    0,40 → 1,00 seconde.
  */

  const ANALYSIS_DURATIONS = [
    0.40,
    0.50,
    0.60,
    0.70,
    0.80,
    0.90,
    1.00
  ];

  /*
    Résolution basse utilisée uniquement pour analyser
    les mouvements.

    L'extraction finale conserve la résolution vidéo.
  */

  const ANALYSIS_WIDTH = 96;
  const ANALYSIS_HEIGHT = 96;

  /*
    Déplacement maximum recherché entre deux images
    de l'analyse basse résolution.
  */

  const MAX_SHIFT_X = 12;
  const MAX_SHIFT_Y = 8;

  /*
    Nombre maximal de positions candidates analysées.

    Permet d'éviter une analyse inutilement longue.
  */

  const MAX_CANDIDATES = 34;

  /* =========================================================
     ÉTAT
     ========================================================= */

  let currentFile = null;
  let currentObjectURL = null;

  let sourceVideo = null;

  let sourceDuration = 0;

  let workingStart = 0;
  let workingEnd = 0;

  let bestSequence = null;

  let extractedViews = [];

  let analysisRunning = false;

  /* =========================================================
     CANVAS D'ANALYSE
     ========================================================= */

  const analysisCanvas = document.createElement("canvas");

  analysisCanvas.width = ANALYSIS_WIDTH;
  analysisCanvas.height = ANALYSIS_HEIGHT;

  const analysisCtx = analysisCanvas.getContext("2d", {
    willReadFrequently: true
  });

  /* =========================================================
     AFFICHAGE
     ========================================================= */

  function setStatus(message) {
    if (animStatus) {
      animStatus.textContent = message;
    }

    console.log("[LENTI]", message);
  }

  function setProgress(value) {
    const v = Math.max(0, Math.min(100, value));

    if (!animProgress) return;

    if (
      animProgress.tagName &&
      animProgress.tagName.toLowerCase() === "progress"
    ) {
      animProgress.value = v;
      animProgress.max = 100;
    } else {
      animProgress.style.width = `${v}%`;
      animProgress.textContent = `${Math.round(v)}%`;
    }
  }

  function formatTime(seconds) {
    if (!Number.isFinite(seconds)) return "0.00 s";

    return `${seconds.toFixed(2)} s`;
  }

  function updateTimeLabels() {
    if (animStartLabel) {
      animStartLabel.textContent = formatTime(workingStart);
    }

    if (animEndLabel) {
      animEndLabel.textContent = formatTime(workingEnd);
    }

    if (animDurationLabel) {
      animDurationLabel.textContent =
        formatTime(workingEnd - workingStart);
    }

    if (animDuration) {
      if ("value" in animDuration) {
        animDuration.value =
          (workingEnd - workingStart).toFixed(2);
      }
    }
  }

  /* =========================================================
     MODE PHOTO / ANIMATION
     ========================================================= */

  function updateModeUI() {
    const animationMode =
      modeAnim &&
      (
        modeAnim.checked ||
        modeAnim.classList.contains("active")
      );

    if (animControls) {
      animControls.style.display =
        animationMode ? "" : "none";
    }
  }

  if (mode3d) {
    mode3d.addEventListener("change", updateModeUI);
    mode3d.addEventListener("click", updateModeUI);
  }

  if (modeAnim) {
    modeAnim.addEventListener("change", updateModeUI);
    modeAnim.addEventListener("click", updateModeUI);
  }

  updateModeUI();

  /* =========================================================
     NETTOYAGE
     ========================================================= */

  function resetAnimationState() {
    bestSequence = null;

    extractedViews.forEach(view => {
      if (view.url) {
        URL.revokeObjectURL(view.url);
      }
    });

    extractedViews = [];

    if (viewsContainer) {
      viewsContainer.innerHTML = "";
    }

    setProgress(0);

    if (animDownloadZip) {
      animDownloadZip.disabled = true;
    }

    if (animExtract) {
      animExtract.disabled = true;
    }
  }

  /* =========================================================
     CHARGEMENT FICHIER
     ========================================================= */

  if (imageInput) {
    imageInput.addEventListener("change", async event => {
      const file = event.target.files?.[0];

      if (!file) return;

      currentFile = file;

      resetAnimationState();

      if (currentObjectURL) {
        URL.revokeObjectURL(currentObjectURL);
        currentObjectURL = null;
      }

      currentObjectURL = URL.createObjectURL(file);

      if (file.type.startsWith("video/")) {
        await loadVideo(file);
      } else if (file.type.startsWith("image/")) {
        loadImage(file);
      } else {
        setStatus("Format de fichier non reconnu.");
      }
    });
  }

  /* =========================================================
     IMAGE
     ========================================================= */

  function loadImage(file) {
    setStatus("Image chargée.");

    if (!preview) return;

    if (preview.tagName.toLowerCase() === "img") {
      preview.src = currentObjectURL;
    } else {
      preview.innerHTML = "";

      const img = document.createElement("img");
      img.src = currentObjectURL;
      img.alt = "Image source";
      img.style.maxWidth = "100%";

      preview.appendChild(img);
    }
  }

  /* =========================================================
     VIDÉO
     ========================================================= */

  async function loadVideo(file) {
    setStatus("Chargement de la vidéo…");

    sourceVideo =
      videoPreview ||
      document.createElement("video");

    sourceVideo.preload = "auto";
    sourceVideo.muted = true;
    sourceVideo.playsInline = true;

    sourceVideo.src = currentObjectURL;

    await waitForVideoMetadata(sourceVideo);

    sourceDuration = sourceVideo.duration || 0;

    /*
      Par défaut :
      on prend les 5 premières secondes maximum.

      L'utilisateur peut ensuite déplacer la plage.
    */

    workingStart = 0;

    workingEnd = Math.min(
      sourceDuration,
      MAX_WORKING_CLIP
    );

    configureTimelineInputs();

    updateTimeLabels();

    setStatus(
      `Vidéo chargée — ${formatTime(sourceDuration)}. ` +
      `Zone de travail : ${formatTime(workingEnd - workingStart)} maximum.`
    );

    if (animGenerate) {
      animGenerate.disabled = false;
    }
  }

  function waitForVideoMetadata(video) {
    return new Promise((resolve, reject) => {
      if (
        video.readyState >= 1 &&
        Number.isFinite(video.duration)
      ) {
        resolve();
        return;
      }

      const onLoaded = () => {
        cleanup();
        resolve();
      };

      const onError = () => {
        cleanup();
        reject(
          new Error("Impossible de lire la vidéo.")
        );
      };

      const cleanup = () => {
        video.removeEventListener(
          "loadedmetadata",
          onLoaded
        );

        video.removeEventListener(
          "error",
          onError
        );
      };

      video.addEventListener(
        "loadedmetadata",
        onLoaded
      );

      video.addEventListener(
        "error",
        onError
      );
    });
  }

  /* =========================================================
     PLAGE VIDÉO
     ========================================================= */

  function configureTimelineInputs() {
    if (animStart) {
      animStart.min = 0;
      animStart.max = sourceDuration;
      animStart.step = 0.01;
      animStart.value = workingStart;
    }

    if (animEnd) {
      animEnd.min = 0;
      animEnd.max = sourceDuration;
      animEnd.step = 0.01;
      animEnd.value = workingEnd;
    }
  }

  function normalizeWorkingRange(changed) {
    if (!sourceVideo) return;

    let start = animStart
      ? Number(animStart.value)
      : workingStart;

    let end = animEnd
      ? Number(animEnd.value)
      : workingEnd;

    start = Math.max(
      0,
      Math.min(start, sourceDuration)
    );

    end = Math.max(
      0,
      Math.min(end, sourceDuration)
    );

    /*
      Minimum raisonnable.
    */

    const minimumDuration = 0.40;

    if (changed === "start") {
      if (end - start > MAX_WORKING_CLIP) {
        end = start + MAX_WORKING_CLIP;
      }

      if (end - start < minimumDuration) {
        end = Math.min(
          sourceDuration,
          start + minimumDuration
        );
      }
    }

    if (changed === "end") {
      if (end - start > MAX_WORKING_CLIP) {
        start = end - MAX_WORKING_CLIP;
      }

      if (end - start < minimumDuration) {
        start = Math.max(
          0,
          end - minimumDuration
        );
      }
    }

    /*
      Sécurité absolue :
      jamais plus de 5 secondes.
    */

    if (end - start > MAX_WORKING_CLIP) {
      end = start + MAX_WORKING_CLIP;
    }

    workingStart = start;
    workingEnd = end;

    if (animStart) {
      animStart.value = workingStart;
    }

    if (animEnd) {
      animEnd.value = workingEnd;
    }

    updateTimeLabels();

    resetAnimationState();

    if (animGenerate) {
      animGenerate.disabled = false;
    }
  }

  if (animStart) {
    animStart.addEventListener("input", () => {
      normalizeWorkingRange("start");
    });
  }

  if (animEnd) {
    animEnd.addEventListener("input", () => {
      normalizeWorkingRange("end");
    });
  }

  /* =========================================================
     POSITIONNEMENT VIDÉO
     ========================================================= */

  function seekVideo(video, time) {
    return new Promise((resolve, reject) => {
      const target = Math.max(
        0,
        Math.min(
          time,
          Math.max(0, video.duration - 0.001)
        )
      );

      if (
        Math.abs(video.currentTime - target) < 0.002
      ) {
        resolve();
        return;
      }

      const onSeeked = () => {
        cleanup();
        resolve();
      };

      const onError = () => {
        cleanup();
        reject(
          new Error("Erreur pendant le déplacement vidéo.")
        );
      };

      const cleanup = () => {
        video.removeEventListener(
          "seeked",
          onSeeked
        );

        video.removeEventListener(
          "error",
          onError
        );
      };

      video.addEventListener(
        "seeked",
        onSeeked,
        { once: true }
      );

      video.addEventListener(
        "error",
        onError,
        { once: true }
      );

      video.currentTime = target;
    });
  }

  /* =========================================================
     CAPTURE D'UNE IMAGE BASSE RÉSOLUTION
     POUR ANALYSE
     ========================================================= */

  async function captureAnalysisFrame(time) {
    await seekVideo(sourceVideo, time);

    analysisCtx.drawImage(
      sourceVideo,
      0,
      0,
      ANALYSIS_WIDTH,
      ANALYSIS_HEIGHT
    );

    const imageData = analysisCtx.getImageData(
      0,
      0,
      ANALYSIS_WIDTH,
      ANALYSIS_HEIGHT
    );

    const data = imageData.data;

    const gray = new Uint8Array(
      ANALYSIS_WIDTH * ANALYSIS_HEIGHT
    );

    /*
      Conversion luminance.
    */

    for (
      let i = 0, j = 0;
      i < data.length;
      i += 4, j++
    ) {
      gray[j] =
        0.299 * data[i] +
        0.587 * data[i + 1] +
        0.114 * data[i + 2];
    }

    return gray;
  }

  /* =========================================================
     ESTIMATION DU DÉPLACEMENT ENTRE DEUX IMAGES
     ========================================================= */

  function estimateShift(frameA, frameB) {
    let bestScore = Infinity;
    let bestDx = 0;
    let bestDy = 0;

    /*
      On ignore un peu les bords pour éviter que
      les changements extérieurs dominent le résultat.
    */

    const marginX = MAX_SHIFT_X + 6;
    const marginY = MAX_SHIFT_Y + 6;

    /*
      Pas de 2 pixels pour accélérer l'analyse.
    */

    const sampleStep = 2;

    for (
      let dy = -MAX_SHIFT_Y;
      dy <= MAX_SHIFT_Y;
      dy++
    ) {
      for (
        let dx = -MAX_SHIFT_X;
        dx <= MAX_SHIFT_X;
        dx++
      ) {
        let difference = 0;
        let count = 0;

        for (
          let y = marginY;
          y < ANALYSIS_HEIGHT - marginY;
          y += sampleStep
        ) {
          const shiftedY = y + dy;

          for (
            let x = marginX;
            x < ANALYSIS_WIDTH - marginX;
            x += sampleStep
          ) {
            const shiftedX = x + dx;

            const a =
              frameA[
                y * ANALYSIS_WIDTH + x
              ];

            const b =
              frameB[
                shiftedY * ANALYSIS_WIDTH +
                shiftedX
              ];

            difference += Math.abs(a - b);
            count++;
          }
        }

        if (!count) continue;

        const score = difference / count;

        if (score < bestScore) {
          bestScore = score;
          bestDx = dx;
          bestDy = dy;
        }
      }
    }

    return {
      dx: bestDx,
      dy: bestDy,
      error: bestScore
    };
  }

  /* =========================================================
     DIFFÉRENCE VISUELLE BRUTE
     ========================================================= */

  function frameDifference(frameA, frameB) {
    let total = 0;

    const step = 4;

    for (
      let i = 0;
      i < frameA.length;
      i += step
    ) {
      total += Math.abs(
        frameA[i] - frameB[i]
      );
    }

    return (
      total /
      Math.ceil(frameA.length / step)
    );
  }

  /* =========================================================
     MATHS
     ========================================================= */

  function mean(values) {
    if (!values.length) return 0;

    return (
      values.reduce(
        (sum, value) => sum + value,
        0
      ) / values.length
    );
  }

  function standardDeviation(values) {
    if (!values.length) return 0;

    const avg = mean(values);

    const variance =
      mean(
        values.map(value => {
          const d = value - avg;
          return d * d;
        })
      );

    return Math.sqrt(variance);
  }

  function vectorLength(x, y) {
    return Math.sqrt(x * x + y * y);
  }

  function clamp(value, min, max) {
    return Math.max(
      min,
      Math.min(max, value)
    );
  }

  /* =========================================================
     ANALYSE D'UNE SÉQUENCE DE 9 VUES
     ========================================================= */

  async function analyseSequence(start, duration) {
    const interval =
      duration / (VIEW_COUNT - 1);

    const times = [];

    for (let i = 0; i < VIEW_COUNT; i++) {
      times.push(
        start + interval * i
      );
    }

    const frames = [];

    for (let i = 0; i < VIEW_COUNT; i++) {
      frames.push(
        await captureAnalysisFrame(times[i])
      );
    }

    const shifts = [];
    const differences = [];

    /*
      Analyse chaque transition.
    */

    for (
      let i = 0;
      i < VIEW_COUNT - 1;
      i++
    ) {
      const shift = estimateShift(
        frames[i],
        frames[i + 1]
      );

      shifts.push(shift);

      differences.push(
        frameDifference(
          frames[i],
          frames[i + 1]
        )
      );
    }

    /* =====================================================
       1 — DÉPLACEMENT DE CHAQUE PAS
       ===================================================== */

    const stepLengths = shifts.map(s =>
      vectorLength(s.dx, s.dy)
    );

    const averageStep = mean(stepLengths);

    const stepDeviation =
      standardDeviation(stepLengths);

    /*
      Plus cette valeur est proche de 1,
      plus la vitesse est régulière.
    */

    const regularity =
      averageStep > 0
        ? clamp(
            1 -
            stepDeviation /
              (averageStep + 0.001),
            0,
            1
          )
        : 0;

    /* =====================================================
       2 — DÉPLACEMENT TOTAL
       ===================================================== */

    let totalDx = 0;
    let totalDy = 0;

    for (const shift of shifts) {
      totalDx += shift.dx;
      totalDy += shift.dy;
    }

    const netTravel = vectorLength(
      totalDx,
      totalDy
    );

    const travelledDistance =
      stepLengths.reduce(
        (sum, v) => sum + v,
        0
      );

    /*
      Ratio fondamental.

      1.0 =
      mouvement parfaitement progressif.

      0 =
      beaucoup de mouvement mais on revient
      presque au point de départ.
    */

    const travelRatio =
      travelledDistance > 0
        ? netTravel /
          travelledDistance
        : 0;

    /* =====================================================
       3 — DIRECTION DOMINANTE
       ===================================================== */

    let dominantX =
      Math.abs(totalDx) >=
      Math.abs(totalDy);

    let directionReversals = 0;

    let previousSign = 0;

    for (const shift of shifts) {
      const component =
        dominantX
          ? shift.dx
          : shift.dy;

      const sign =
        Math.abs(component) < 0.5
          ? 0
          : Math.sign(component);

      if (
        sign !== 0 &&
        previousSign !== 0 &&
        sign !== previousSign
      ) {
        directionReversals++;
      }

      if (sign !== 0) {
        previousSign = sign;
      }
    }

    /*
      Score directionnel.

      1 = jamais de retour.
    */

    const directionScore =
      clamp(
        1 -
          directionReversals /
            (VIEW_COUNT - 2),
        0,
        1
      );

    /* =====================================================
       4 — HORIZONTALITÉ
       ===================================================== */

    /*
      Pour un lenticulaire à lentilles verticales,
      le mouvement horizontal est généralement
      le plus intéressant.

      On ne supprime pas complètement un mouvement
      vertical, mais on privilégie clairement X.
    */

    const horizontalRatio =
      netTravel > 0
        ? Math.abs(totalDx) /
          (
            Math.abs(totalDx) +
            Math.abs(totalDy) +
            0.001
          )
        : 0;

    /* =====================================================
       5 — CHANGEMENT DE SCÈNE / MOUVEMENT PARASITE
       ===================================================== */

    const avgDifference =
      mean(differences);

    const differenceDeviation =
      standardDeviation(differences);

    /*
      Une variation brutale de différence visuelle
      indique souvent :
      - changement de scène,
      - gros mouvement caméra,
      - flash,
      - objet qui traverse l'image.
    */

    const visualInstability =
      avgDifference > 0
        ? differenceDeviation /
          avgDifference
        : 0;

    const visualStability =
      clamp(
        1 - visualInstability,
        0,
        1
      );

    /* =====================================================
       6 — ERREUR DE CORRÉLATION
       ===================================================== */

    const correlationErrors =
      shifts.map(s => s.error);

    const averageCorrelationError =
      mean(correlationErrors);

    /*
      Plus l'erreur est élevée,
      moins les images se ressemblent après compensation
      du déplacement.

      Donc moins le mouvement ressemble à une
      progression lenticulaire propre.
    */

    const correlationScore =
      clamp(
        1 -
          averageCorrelationError /
            70,
        0,
        1
      );

    /* =====================================================
       7 — AMPLITUDE UTILE
       ===================================================== */

    /*
      Un mouvement trop faible ne donnera quasiment
      aucun effet.

      Un mouvement gigantesque donnera des sauts.

      Zone cible dans notre analyse 96 px :
      environ 6 à 35 px de déplacement net.
    */

    let amplitudeScore = 0;

    if (netTravel < 2) {
      amplitudeScore =
        netTravel / 2 * 0.2;
    } else if (netTravel < 6) {
      amplitudeScore =
        0.2 +
        ((netTravel - 2) / 4) * 0.5;
    } else if (netTravel <= 30) {
      amplitudeScore = 1;
    } else if (netTravel <= 50) {
      amplitudeScore =
        1 -
        ((netTravel - 30) / 20) *
          0.6;
    } else {
      amplitudeScore = 0.25;
    }

    amplitudeScore =
      clamp(amplitudeScore, 0, 1);

    /* =====================================================
       8 — VITESSE ENTRE LES IMAGES
       ===================================================== */

    /*
      On cherche des pas ni trop petits
      ni trop importants.
    */

    let stepSizeScore;

    if (averageStep < 0.5) {
      stepSizeScore = 0;
    } else if (averageStep < 1.5) {
      stepSizeScore =
        (averageStep - 0.5) / 1;
    } else if (averageStep <= 5.5) {
      stepSizeScore = 1;
    } else if (averageStep <= 9) {
      stepSizeScore =
        1 -
        ((averageStep - 5.5) / 3.5) *
          0.7;
    } else {
      stepSizeScore = 0.2;
    }

    stepSizeScore =
      clamp(stepSizeScore, 0, 1);

    /* =====================================================
       9 — SCORE GLOBAL LENTICULAIRE
       ===================================================== */

    /*
      Pondérations V12.

      Le critère n°1 n'est plus :
      "il y a beaucoup de mouvement".

      C'est :
      "le mouvement est progressif et exploitable".
    */

    let score = 0;

    score += travelRatio * 30;
    score += regularity * 20;
    score += directionScore * 14;
    score += horizontalRatio * 10;
    score += amplitudeScore * 10;
    score += stepSizeScore * 7;
    score += visualStability * 5;
    score += correlationScore * 4;

    /* =====================================================
       PÉNALITÉS FORTES
       ===================================================== */

    /*
      Retour arrière important.
    */

    if (travelRatio < 0.35) {
      score -= 20;
    } else if (travelRatio < 0.50) {
      score -= 10;
    }

    /*
      Trop de changements de direction.
    */

    score -= directionReversals * 5;

    /*
      Animation presque immobile.
    */

    if (netTravel < 2) {
      score -= 20;
    }

    /*
      Image complètement instable.
    */

    if (visualInstability > 1.25) {
      score -= 12;
    }

    /*
      Mouvement extrêmement irrégulier.
    */

    if (
      averageStep > 0 &&
      stepDeviation >
        averageStep * 0.85
    ) {
      score -= 12;
    }

    return {
      start,
      end: start + duration,
      duration,
      times,

      score,

      shifts,

      averageStep,
      stepDeviation,

      regularity,

      totalDx,
      totalDy,

      netTravel,
      travelledDistance,
      travelRatio,

      dominantAxis:
        dominantX ? "horizontal" : "vertical",

      directionReversals,
      directionScore,

      horizontalRatio,

      avgDifference,
      visualStability,

      averageCorrelationError,
      correlationScore,

      amplitudeScore,
      stepSizeScore
    };
  }

  /* =========================================================
     CRÉATION DES POSITIONS CANDIDATES
     ========================================================= */

  function createCandidateStarts(
    rangeStart,
    rangeEnd,
    duration
  ) {
    const available =
      rangeEnd -
      rangeStart -
      duration;

    if (available <= 0) {
      return [rangeStart];
    }

    /*
      Plus la zone est longue, plus on teste
      de positions.
    */

    let count = Math.ceil(
      available / 0.10
    ) + 1;

    count = Math.min(
      MAX_CANDIDATES,
      Math.max(2, count)
    );

    const starts = [];

    for (let i = 0; i < count; i++) {
      const ratio =
        count === 1
          ? 0
          : i / (count - 1);

      starts.push(
        rangeStart +
        available * ratio
      );
    }

    return starts;
  }

  /* =========================================================
     RECHERCHE AUTOMATIQUE
     ========================================================= */

  async function findBestSequence() {
    if (!sourceVideo) {
      throw new Error(
        "Aucune vidéo chargée."
      );
    }

    if (analysisRunning) {
      return bestSequence;
    }

    analysisRunning = true;

    resetAnimationState();

    setStatus(
      "Recherche de la meilleure séquence lenticulaire…"
    );

    setProgress(1);

    try {
      const rangeDuration =
        workingEnd - workingStart;

      let candidateDefinitions = [];

      for (
        const duration of ANALYSIS_DURATIONS
      ) {
        if (
          duration >
          rangeDuration + 0.001
        ) {
          continue;
        }

        const starts =
          createCandidateStarts(
            workingStart,
            workingEnd,
            duration
          );

        for (const start of starts) {
          candidateDefinitions.push({
            start,
            duration
          });
        }
      }

      /*
        On limite le nombre global de candidats
        pour garder l'application fluide.
      */

      if (
        candidateDefinitions.length >
        MAX_CANDIDATES
      ) {
        const reduced = [];

        const last =
          candidateDefinitions.length - 1;

        for (
          let i = 0;
          i < MAX_CANDIDATES;
          i++
        ) {
          const index =
            Math.round(
              (i /
                (MAX_CANDIDATES - 1)) *
                last
            );

          reduced.push(
            candidateDefinitions[index]
          );
        }

        candidateDefinitions = reduced;
      }

      let best = null;

      for (
        let i = 0;
        i < candidateDefinitions.length;
        i++
      ) {
        const candidate =
          candidateDefinitions[i];

        const result =
          await analyseSequence(
            candidate.start,
            candidate.duration
          );

        if (
          !best ||
          result.score > best.score
        ) {
          best = result;
        }

        const progress =
          5 +
          ((i + 1) /
            candidateDefinitions.length) *
            85;

        setProgress(progress);
      }

      if (!best) {
        throw new Error(
          "Aucune séquence exploitable trouvée."
        );
      }

      bestSequence = best;

      setProgress(100);

      printAnalysis(best);

      if (animExtract) {
        animExtract.disabled = false;
      }

      return best;
    } finally {
      analysisRunning = false;
    }
  }

  /* =========================================================
     RÉSULTAT ANALYSE
     ========================================================= */

  function printAnalysis(result) {
    const quality =
      getQualityLabel(result);

    const message =
      `${quality} — ` +
      `séquence ${result.start.toFixed(3)} s → ` +
      `${result.end.toFixed(3)} s ` +
      `(${result.duration.toFixed(2)} s). ` +
      `Score ${result.score.toFixed(1)} / 100 — ` +
      `progression ${(result.travelRatio * 100).toFixed(0)} % — ` +
      `régularité ${(result.regularity * 100).toFixed(0)} %.`;

    setStatus(message);

    console.table({
      debut: result.start.toFixed(3),
      fin: result.end.toFixed(3),
      duree: result.duration.toFixed(3),

      score: result.score.toFixed(2),

      pasMoyen:
        result.averageStep.toFixed(2),

      deviation:
        result.stepDeviation.toFixed(2),

      regularite:
        result.regularity.toFixed(3),

      deplacementX:
        result.totalDx.toFixed(2),

      deplacementY:
        result.totalDy.toFixed(2),

      deplacementNet:
        result.netTravel.toFixed(2),

      distanceTotale:
        result.travelledDistance.toFixed(2),

      travelRatio:
        result.travelRatio.toFixed(3),

      axe:
        result.dominantAxis,

      retours:
        result.directionReversals,

      horizontal:
        result.horizontalRatio.toFixed(3),

      stabiliteVisuelle:
        result.visualStability.toFixed(3)
    });

    console.table(
      result.shifts.map(
        (shift, index) => ({
          transition:
            `${index + 1} → ${index + 2}`,

          dx: shift.dx,
          dy: shift.dy,

          distance:
            vectorLength(
              shift.dx,
              shift.dy
            ).toFixed(2),

          erreur:
            shift.error.toFixed(2)
        })
      )
    );
  }

  function getQualityLabel(result) {
    /*
      On ne se contente pas du score global.

      Certaines conditions sont obligatoires.
    */

    if (
      result.travelRatio >= 0.72 &&
      result.regularity >= 0.65 &&
      result.directionReversals <= 1 &&
      result.score >= 65
    ) {
      return "Excellent mouvement lenticulaire";
    }

    if (
      result.travelRatio >= 0.55 &&
      result.regularity >= 0.48 &&
      result.score >= 52
    ) {
      return "Bon mouvement lenticulaire";
    }

    if (
      result.travelRatio >= 0.40 &&
      result.score >= 40
    ) {
      return "Mouvement lenticulaire acceptable";
    }

    return "Mouvement lenticulaire faible";
  }

  /* =========================================================
     BOUTON ANALYSER / GÉNÉRER
     ========================================================= */

  if (animGenerate) {
    animGenerate.addEventListener(
      "click",
      async () => {
        try {
          animGenerate.disabled = true;

          await findBestSequence();
        } catch (error) {
          console.error(error);

          setStatus(
            error.message ||
            "Erreur pendant l'analyse."
          );
        } finally {
          animGenerate.disabled = false;
        }
      }
    );
  }

  /* =========================================================
     EXTRACTION PLEINE RÉSOLUTION
     ========================================================= */

  async function captureFullResolutionFrame(time) {
    await seekVideo(
      sourceVideo,
      time
    );

    const width =
      sourceVideo.videoWidth;

    const height =
      sourceVideo.videoHeight;

    if (!width || !height) {
      throw new Error(
        "Résolution vidéo indisponible."
      );
    }

    /*
      Sortie carrée.

      On conserve le principe utilisé pour
      nos 772 × 772 précédents.

      Ici on utilise la plus petite dimension
      de la vidéo pour obtenir un carré sans
      déformation.
    */

    const sourceSize =
      Math.min(width, height);

    const sx =
      (width - sourceSize) / 2;

    const sy =
      (height - sourceSize) / 2;

    /*
      772 × 772 :
      format déjà utilisé dans nos ZIP.
    */

    const outputSize = 772;

    const canvas =
      document.createElement("canvas");

    canvas.width = outputSize;
    canvas.height = outputSize;

    const ctx =
      canvas.getContext("2d");

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    ctx.drawImage(
      sourceVideo,

      sx,
      sy,
      sourceSize,
      sourceSize,

      0,
      0,
      outputSize,
      outputSize
    );

    const blob =
      await canvasToBlob(
        canvas,
        "image/png",
        1
      );

    return {
      canvas,
      blob
    };
  }

  function canvasToBlob(
    canvas,
    type = "image/png",
    quality = 1
  ) {
    return new Promise(
      (resolve, reject) => {
        canvas.toBlob(
          blob => {
            if (!blob) {
              reject(
                new Error(
                  "Impossible de créer l'image."
                )
              );

              return;
            }

            resolve(blob);
          },
          type,
          quality
        );
      }
    );
  }

  /* =========================================================
     EXTRACTION DES 9 VUES
     ========================================================= */

  async function extractNineViews() {
    if (!sourceVideo) {
      throw new Error(
        "Aucune vidéo chargée."
      );
    }

    if (!bestSequence) {
      await findBestSequence();
    }

    extractedViews.forEach(view => {
      if (view.url) {
        URL.revokeObjectURL(view.url);
      }
    });

    extractedViews = [];

    if (viewsContainer) {
      viewsContainer.innerHTML = "";
    }

    setStatus(
      "Extraction des 9 vues haute qualité…"
    );

    setProgress(0);

    for (
      let i = 0;
      i < VIEW_COUNT;
      i++
    ) {
      const time =
        bestSequence.times[i];

      const captured =
        await captureFullResolutionFrame(
          time
        );

      const filename =
        `vue-${String(i + 1).padStart(2, "0")}.png`;

      const url =
        URL.createObjectURL(
          captured.blob
        );

      const view = {
        index: i + 1,
        time,
        filename,
        blob: captured.blob,
        url,
        canvas: captured.canvas
      };

      extractedViews.push(view);

      addViewPreview(view);

      setProgress(
        ((i + 1) / VIEW_COUNT) * 100
      );
    }

    if (animDownloadZip) {
      animDownloadZip.disabled = false;
    }

    setStatus(
      `9 vues extraites — ` +
      `${bestSequence.start.toFixed(3)} s → ` +
      `${bestSequence.end.toFixed(3)} s.`
    );

    return extractedViews;
  }

  /* =========================================================
     PRÉVISUALISATION DES 9 VUES
     ========================================================= */

  function addViewPreview(view) {
    if (!viewsContainer) return;

    const item =
      document.createElement("div");

    item.className = "view-item";

    const img =
      document.createElement("img");

    img.src = view.url;
    img.alt = `Vue ${view.index}`;

    img.style.width = "100%";
    img.style.display = "block";

    const caption =
      document.createElement("div");

    caption.className =
      "view-caption";

    caption.textContent =
      `Vue ${view.index} — ${view.time.toFixed(3)} s`;

    item.appendChild(img);
    item.appendChild(caption);

    viewsContainer.appendChild(item);
  }

  if (animExtract) {
    animExtract.addEventListener(
      "click",
      async () => {
        try {
          animExtract.disabled = true;

          await extractNineViews();
        } catch (error) {
          console.error(error);

          setStatus(
            error.message ||
            "Erreur pendant l'extraction."
          );
        } finally {
          animExtract.disabled = false;
        }
      }
    );
  }

  /* =========================================================
     ZIP
     ========================================================= */

  async function downloadViewsZip() {
    if (
      extractedViews.length !==
      VIEW_COUNT
    ) {
      await extractNineViews();
    }

    if (
      typeof JSZip === "undefined"
    ) {
      /*
        Si JSZip n'est pas chargé,
        on télécharge les images séparément.
      */

      setStatus(
        "JSZip absent — téléchargement des 9 PNG séparément."
      );

      for (
        const view of extractedViews
      ) {
        downloadBlob(
          view.blob,
          view.filename
        );

        await sleep(120);
      }

      return;
    }

    setStatus(
      "Création du ZIP…"
    );

    const zip =
      new JSZip();

    for (
      const view of extractedViews
    ) {
      zip.file(
        view.filename,
        view.blob
      );
    }

    /*
      Fichier texte avec les paramètres
      de l'extraction.
    */

    const info = createExtractionInfo();

    zip.file(
      "analyse-lenticulaire.txt",
      info
    );

    const blob =
      await zip.generateAsync({
        type: "blob",
        compression: "DEFLATE",
        compressionOptions: {
          level: 6
        }
      });

    downloadBlob(
      blob,
      "9-vues-animation-lenticulaire.zip"
    );

    setStatus(
      "ZIP des 9 vues téléchargé."
    );
  }

  function createExtractionInfo() {
    if (!bestSequence) {
      return "";
    }

    const lines = [
      "HAPPYHOLO / LENTICULAR LAB",
      "VERSION ALGORITHME : 12",
      "",
      `Nombre de vues : ${VIEW_COUNT}`,
      `Résolution : 772 × 772 px`,
      "",
      `Début : ${bestSequence.start.toFixed(3)} s`,
      `Fin : ${bestSequence.end.toFixed(3)} s`,
      `Durée : ${bestSequence.duration.toFixed(3)} s`,
      "",
      `Score : ${bestSequence.score.toFixed(2)}`,
      `Déplacement moyen : ${bestSequence.averageStep.toFixed(2)}`,
      `Régularité : ${bestSequence.regularity.toFixed(3)}`,
      `Déplacement X : ${bestSequence.totalDx.toFixed(2)}`,
      `Déplacement Y : ${bestSequence.totalDy.toFixed(2)}`,
      `Déplacement net : ${bestSequence.netTravel.toFixed(2)}`,
      `Distance parcourue : ${bestSequence.travelledDistance.toFixed(2)}`,
      `Travel ratio : ${bestSequence.travelRatio.toFixed(3)}`,
      `Axe dominant : ${bestSequence.dominantAxis}`,
      `Retours direction : ${bestSequence.directionReversals}`,
      `Horizontal ratio : ${bestSequence.horizontalRatio.toFixed(3)}`,
      `Stabilité visuelle : ${bestSequence.visualStability.toFixed(3)}`,
      "",
      "TIMINGS DES 9 VUES"
    ];

    bestSequence.times.forEach(
      (time, index) => {
        lines.push(
          `Vue ${String(index + 1).padStart(2, "0")} : ${time.toFixed(3)} s`
        );
      }
    );

    lines.push(
      "",
      "DÉPLACEMENTS ENTRE VUES"
    );

    bestSequence.shifts.forEach(
      (shift, index) => {
        lines.push(
          `${index + 1} → ${index + 2} : ` +
          `dx=${shift.dx}, ` +
          `dy=${shift.dy}, ` +
          `distance=${vectorLength(
            shift.dx,
            shift.dy
          ).toFixed(2)}`
        );
      }
    );

    return lines.join("\n");
  }

  if (animDownloadZip) {
    animDownloadZip.addEventListener(
      "click",
      async () => {
        try {
          animDownloadZip.disabled = true;

          await downloadViewsZip();
        } catch (error) {
          console.error(error);

          setStatus(
            error.message ||
            "Erreur pendant la création du ZIP."
          );
        } finally {
          animDownloadZip.disabled = false;
        }
      }
    );
  }

  /* =========================================================
     TÉLÉCHARGEMENT
     ========================================================= */

  function downloadBlob(blob, filename) {
    const url =
      URL.createObjectURL(blob);

    const a =
      document.createElement("a");

    a.href = url;
    a.download = filename;

    document.body.appendChild(a);

    a.click();

    a.remove();

    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 2000);
  }

  function sleep(ms) {
    return new Promise(resolve => {
      setTimeout(resolve, ms);
    });
  }

  /* =========================================================
     EXPORT DES VUES
     Compatibilité avec ancien bouton
     ========================================================= */

  if (
    exportViewsBtn &&
    exportViewsBtn !== animDownloadZip
  ) {
    exportViewsBtn.addEventListener(
      "click",
      async () => {
        try {
          await downloadViewsZip();
        } catch (error) {
          console.error(error);

          setStatus(
            error.message ||
            "Erreur export vues."
          );
        }
      }
    );
  }

  /* =========================================================
     BOUTON PRINCIPAL
     ========================================================= */

  if (generateBtn) {
    generateBtn.addEventListener(
      "click",
      async () => {
        /*
          En mode animation,
          le bouton principal lance maintenant
          la recherche automatique.
        */

        const animationMode =
          modeAnim &&
          (
            modeAnim.checked ||
            modeAnim.classList.contains("active")
          );

        if (
          animationMode &&
          sourceVideo
        ) {
          try {
            generateBtn.disabled = true;

            await findBestSequence();

            await extractNineViews();
          } catch (error) {
            console.error(error);

            setStatus(
              error.message ||
              "Erreur de génération."
            );
          } finally {
            generateBtn.disabled = false;
          }
        }
      }
    );
  }

  /* =========================================================
     EXPORT VIDÉO
     ---------------------------------------------------------
     On ne modifie pas ici l'ancien système vidéo
     si le HTML possède déjà son propre lien / endpoint.
     ========================================================= */

  if (exportVideoBtn) {
    exportVideoBtn.addEventListener(
      "click",
      () => {
        if (
          downloadVideo &&
          downloadVideo.href
        ) {
          downloadVideo.click();
        }
      }
    );
  }

  /* =========================================================
     API PUBLIQUE POUR DEBUG
     ========================================================= */

  window.LentiApp = {
    version: 12,

    getBestSequence() {
      return bestSequence;
    },

    getExtractedViews() {
      return extractedViews;
    },

    getWorkingRange() {
      return {
        start: workingStart,
        end: workingEnd,
        duration:
          workingEnd - workingStart
      };
    },

    analyse: findBestSequence,

    extract: extractNineViews,

    downloadZip: downloadViewsZip
  };

  /* =========================================================
     INITIALISATION
     ========================================================= */

  if (animDownloadZip) {
    animDownloadZip.disabled = true;
  }

  if (animExtract) {
    animExtract.disabled = true;
  }

  setStatus("Prêt.");

})();
