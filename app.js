/* ============================================================
   HAPPYHOLO / LENTIPRINT
   CORRECTION MANUELLE DU SUJET — MODULE V13
   ------------------------------------------------------------
   À COLLER TOUT À LA FIN DU app.js ACTUEL.

   Ce module crée automatiquement :
   - bouton "Corriger le sujet"
   - éditeur plein écran
   - Ajouter au masque
   - Gomme / retirer
   - Zoom + / -
   - Pinch zoom iPad
   - déplacement
   - loupe de précision
   - taille pinceau
   - opacité masque
   - Undo / Redo
   - réinitialisation
   - validation
   - souris / doigt / Apple Pencil

   Aucun HTML supplémentaire nécessaire.
   Aucun CSS supplémentaire nécessaire.
   ============================================================ */

(() => {
  "use strict";

  /* ============================================================
     SÉCURITÉ : NE PAS INITIALISER 2 FOIS
     ============================================================ */

  if (window.HappyHoloMaskEditorInstalled) {
    console.log("[MASK] Module déjà installé.");
    return;
  }

  window.HappyHoloMaskEditorInstalled = true;

  /* ============================================================
     ÉTAT GLOBAL DU MODULE
     ============================================================ */

  const state = {
    sourceImage: null,

    imageCanvas: null,
    imageCtx: null,

    maskCanvas: null,
    maskCtx: null,

    displayCanvas: null,
    displayCtx: null,

    loupeCanvas: null,
    loupeCtx: null,

    modal: null,

    tool: "add",

    brushSize: 35,
    hardness: 0.85,
    maskOpacity: 0.45,

    zoom: 1,
    minZoom: 0.1,
    maxZoom: 12,

    panX: 0,
    panY: 0,

    pointerX: 0,
    pointerY: 0,

    drawing: false,
    panning: false,

    lastImageX: 0,
    lastImageY: 0,

    panStartX: 0,
    panStartY: 0,

    history: [],
    redo: [],

    maxHistory: 20,

    showMask: true,
    loupeEnabled: true,
    loupeZoom: 4,

    initialMaskSnapshot: null,

    pointers: new Map(),
    pinchStartDistance: 0,
    pinchStartZoom: 1,
    pinchCenterX: 0,
    pinchCenterY: 0
  };

  /* ============================================================
     PETITS OUTILS
     ============================================================ */

  const clamp = (v, min, max) =>
    Math.max(min, Math.min(max, v));

  function create(tag, props = {}, parent = null) {
    const el = document.createElement(tag);

    Object.entries(props).forEach(([key, value]) => {
      if (key === "style") {
        Object.assign(el.style, value);
      } else if (key === "className") {
        el.className = value;
      } else if (key === "text") {
        el.textContent = value;
      } else if (key === "html") {
        el.innerHTML = value;
      } else {
        el[key] = value;
      }
    });

    if (parent) {
      parent.appendChild(el);
    }

    return el;
  }

  function button(text, parent, onClick, accent = false) {
    const b = create(
      "button",
      {
        type: "button",
        text,
        style: {
          border: accent
            ? "1px solid #42a5ff"
            : "1px solid #444",
          background: accent
            ? "#1677d2"
            : "#242424",
          color: "#fff",
          borderRadius: "10px",
          padding: "10px 14px",
          fontSize: "15px",
          fontWeight: "600",
          cursor: "pointer",
          minHeight: "42px",
          touchAction: "manipulation"
        }
      },
      parent
    );

    b.addEventListener("click", onClick);

    return b;
  }

  /* ============================================================
     TROUVER L'IMAGE ACTUELLE DU SITE
     ============================================================ */

  function findCurrentImage() {
    const preview =
      document.getElementById("preview");

    if (preview) {
      if (
        preview.tagName &&
        preview.tagName.toLowerCase() === "img" &&
        preview.src
      ) {
        return preview;
      }

      const img =
        preview.querySelector?.("img");

      if (img && img.src) {
        return img;
      }
    }

    /*
      Recherche de secours :
      première image utilisable de grande taille.
    */

    const candidates =
      [...document.images].filter(img => {
        return (
          img.src &&
          img.complete &&
          img.naturalWidth > 200 &&
          img.naturalHeight > 200
        );
      });

    return candidates[0] || null;
  }

  /* ============================================================
     OUVERTURE
     ============================================================ */

  async function openEditor() {
    const img = findCurrentImage();

    if (!img) {
      alert(
        "Charge d'abord une photo avant de corriger le sujet."
      );
      return;
    }

    if (!img.complete) {
      await new Promise(resolve => {
        img.addEventListener(
          "load",
          resolve,
          { once: true }
        );
      });
    }

    state.sourceImage = img;

    buildEditorIfNeeded();

    prepareImageAndMask();

    state.modal.style.display = "flex";

    document.body.style.overflow = "hidden";

    requestAnimationFrame(() => {
      resizeDisplayCanvas();
      fitImage();
      render();
    });
  }

  /* ============================================================
     CRÉATION DE L'INTERFACE
     ============================================================ */

  function buildEditorIfNeeded() {
    if (state.modal) return;

    /* ---------- Overlay plein écran ---------- */

    const modal = create(
      "div",
      {
        style: {
          position: "fixed",
          inset: "0",
          zIndex: "999999",
          background: "#0d0d0f",
          display: "none",
          flexDirection: "column",
          color: "#fff",
          fontFamily:
            "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"
        }
      },
      document.body
    );

    state.modal = modal;

    /* ---------- Barre supérieure ---------- */

    const topbar = create(
      "div",
      {
        style: {
          minHeight: "62px",
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "8px 12px",
          background: "#19191c",
          borderBottom: "1px solid #333",
          flexWrap: "wrap"
        }
      },
      modal
    );

    button(
      "← Retour",
      topbar,
      closeEditor
    );

    create(
      "div",
      {
        text: "Correction du sujet",
        style: {
          fontSize: "18px",
          fontWeight: "700",
          flex: "1",
          minWidth: "150px"
        }
      },
      topbar
    );

    const undoBtn =
      button("↶ Annuler", topbar, undo);

    const redoBtn =
      button("↷ Refaire", topbar, redo);

    button(
      "✓ Valider",
      topbar,
      validateMask,
      true
    );

    state.undoBtn = undoBtn;
    state.redoBtn = redoBtn;

    /* ---------- Corps ---------- */

    const body = create(
      "div",
      {
        style: {
          flex: "1",
          minHeight: "0",
          display: "flex",
          position: "relative",
          overflow: "hidden"
        }
      },
      modal
    );

    /* ---------- Outils gauche ---------- */

    const tools = create(
      "div",
      {
        style: {
          width: "150px",
          maxWidth: "32vw",
          background: "#171719",
          borderRight: "1px solid #333",
          padding: "10px",
          display: "flex",
          flexDirection: "column",
          gap: "8px",
          overflowY: "auto",
          zIndex: "4"
        }
      },
      body
    );

    const addBtn =
      button(
        "＋ Ajouter",
        tools,
        () => setTool("add"),
        true
      );

    const eraseBtn =
      button(
        "⌫ Gomme",
        tools,
        () => setTool("erase")
      );

    const panBtn =
      button(
        "✋ Déplacer",
        tools,
        () => setTool("pan")
      );

    state.addBtn = addBtn;
    state.eraseBtn = eraseBtn;
    state.panBtn = panBtn;

    create(
      "div",
      {
        text: "Zoom",
        style: {
          marginTop: "8px",
          opacity: ".7",
          fontSize: "12px",
          textTransform: "uppercase"
        }
      },
      tools
    );

    button(
      "＋ Zoom",
      tools,
      () => zoomAtCenter(1.35)
    );

    button(
      "− Zoom",
      tools,
      () => zoomAtCenter(1 / 1.35)
    );

    button(
      "Ajuster",
      tools,
      fitImage
    );

    button(
      "100 %",
      tools,
      () => setZoomAtCenter(1)
    );

    button(
      "🔍 Loupe",
      tools,
      toggleLoupe
    );

    button(
      "Réinitialiser",
      tools,
      resetMask
    );

    /* ---------- Zone centrale ---------- */

    const workArea = create(
      "div",
      {
        style: {
          flex: "1",
          minWidth: "0",
          minHeight: "0",
          position: "relative",
          overflow: "hidden",
          background:
            "repeating-conic-gradient(#222 0 25%,#191919 0 50%) 50% / 24px 24px"
        }
      },
      body
    );

    const canvas = create(
      "canvas",
      {
        style: {
          position: "absolute",
          inset: "0",
          width: "100%",
          height: "100%",
          cursor: "crosshair",
          touchAction: "none"
        }
      },
      workArea
    );

    state.displayCanvas = canvas;

    state.displayCtx =
      canvas.getContext(
        "2d",
        { alpha: true }
      );

    /* ---------- Loupe ---------- */

    const loupeWrap = create(
      "div",
      {
        style: {
          position: "absolute",
          right: "14px",
          top: "14px",
          width: "190px",
          height: "190px",
          maxWidth: "38vw",
          maxHeight: "38vw",
          background: "#000",
          border: "2px solid #fff",
          borderRadius: "50%",
          overflow: "hidden",
          boxShadow:
            "0 4px 25px rgba(0,0,0,.6)",
          zIndex: "5",
          pointerEvents: "none"
        }
      },
      workArea
    );

    const loupeCanvas =
      create(
        "canvas",
        {
          width: 380,
          height: 380,
          style: {
            width: "100%",
            height: "100%"
          }
        },
        loupeWrap
      );

    state.loupeWrap = loupeWrap;
    state.loupeCanvas = loupeCanvas;
    state.loupeCtx =
      loupeCanvas.getContext("2d");

    /* ---------- Barre basse ---------- */

    const bottom = create(
      "div",
      {
        style: {
          background: "#19191c",
          borderTop: "1px solid #333",
          padding: "9px 12px",
          display: "flex",
          alignItems: "center",
          gap: "14px",
          flexWrap: "wrap"
        }
      },
      modal
    );

    addSlider(
      bottom,
      "Pinceau",
      3,
      120,
      state.brushSize,
      value => {
        state.brushSize =
          Number(value);
        render();
      }
    );

    addSlider(
      bottom,
      "Dureté",
      10,
      100,
      Math.round(
        state.hardness * 100
      ),
      value => {
        state.hardness =
          Number(value) / 100;
      }
    );

    addSlider(
      bottom,
      "Masque",
      10,
      90,
      Math.round(
        state.maskOpacity * 100
      ),
      value => {
        state.maskOpacity =
          Number(value) / 100;
        render();
      }
    );

    const maskToggle =
      button(
        "👁 Masque",
        bottom,
        () => {
          state.showMask =
            !state.showMask;
          render();
        }
      );

    state.maskToggle = maskToggle;

    /* ---------- Canvas internes ---------- */

    state.imageCanvas =
      document.createElement("canvas");

    state.imageCtx =
      state.imageCanvas.getContext("2d");

    state.maskCanvas =
      document.createElement("canvas");

    state.maskCtx =
      state.maskCanvas.getContext(
        "2d",
        { willReadFrequently: true }
      );

    bindPointerEvents();

    window.addEventListener(
      "resize",
      () => {
        if (
          state.modal &&
          state.modal.style.display !== "none"
        ) {
          resizeDisplayCanvas();
          render();
        }
      }
    );

    updateToolButtons();
  }

  function addSlider(
    parent,
    label,
    min,
    max,
    value,
    callback
  ) {
    const wrap = create(
      "label",
      {
        style: {
          display: "flex",
          alignItems: "center",
          gap: "8px",
          fontSize: "13px"
        }
      },
      parent
    );

    create(
      "span",
      {
        text: label,
        style: {
          minWidth: "55px"
        }
      },
      wrap
    );

    const input = create(
      "input",
      {
        type: "range",
        min,
        max,
        value,
        style: {
          width: "120px",
          maxWidth: "22vw"
        }
      },
      wrap
    );

    input.addEventListener(
      "input",
      () => callback(input.value)
    );

    return input;
  }

  /* ============================================================
     IMAGE ET MASQUE
     ============================================================ */

  function prepareImageAndMask() {
    const img = state.sourceImage;

    const w =
      img.naturalWidth ||
      img.width;

    const h =
      img.naturalHeight ||
      img.height;

    state.imageCanvas.width = w;
    state.imageCanvas.height = h;

    state.maskCanvas.width = w;
    state.maskCanvas.height = h;

    state.imageCtx.clearRect(
      0,
      0,
      w,
      h
    );

    state.imageCtx.drawImage(
      img,
      0,
      0,
      w,
      h
    );

    state.maskCtx.clearRect(
      0,
      0,
      w,
      h
    );

    /*
      IMPORTANT :
      si un masque précédent a déjà été validé,
      on le recharge.
    */

    if (
      window.validatedMaskCanvas &&
      window.validatedMaskCanvas.width
    ) {
      state.maskCtx.drawImage(
        window.validatedMaskCanvas,
        0,
        0,
        w,
        h
      );
    } else {
      /*
        En attendant le raccordement exact
        au masque automatique de ton moteur 3D,
        on crée un masque plein.

        La gomme permet déjà de retirer
        les zones non souhaitées.

        Dès qu'on branche le masque auto,
        celui-ci remplacera ce masque plein.
      */

      state.maskCtx.fillStyle =
        "#fff";

      state.maskCtx.fillRect(
        0,
        0,
        w,
        h
      );
    }

    state.history = [];
    state.redo = [];

    saveHistory();

    state.initialMaskSnapshot =
      cloneImageData(
        state.history[0]
      );
  }

  /* ============================================================
     REDIMENSION DE L'AFFICHAGE
     ============================================================ */

  function resizeDisplayCanvas() {
    if (!state.displayCanvas) return;

    const rect =
      state.displayCanvas
        .getBoundingClientRect();

    const dpr =
      window.devicePixelRatio || 1;

    state.displayCanvas.width =
      Math.max(
        1,
        Math.round(
          rect.width * dpr
        )
      );

    state.displayCanvas.height =
      Math.max(
        1,
        Math.round(
          rect.height * dpr
        )
      );
  }

  /* ============================================================
     FIT / ZOOM
     ============================================================ */

  function fitImage() {
    if (
      !state.imageCanvas.width ||
      !state.displayCanvas
    ) {
      return;
    }

    const rect =
      state.displayCanvas
        .getBoundingClientRect();

    const scaleX =
      rect.width /
      state.imageCanvas.width;

    const scaleY =
      rect.height /
      state.imageCanvas.height;

    state.zoom =
      Math.min(
        scaleX,
        scaleY
      ) * 0.94;

    state.panX =
      (
        rect.width -
        state.imageCanvas.width *
          state.zoom
      ) / 2;

    state.panY =
      (
        rect.height -
        state.imageCanvas.height *
          state.zoom
      ) / 2;

    render();
  }

  function zoomAtCenter(factor) {
    const rect =
      state.displayCanvas
        .getBoundingClientRect();

    setZoom(
      state.zoom * factor,
      rect.width / 2,
      rect.height / 2
    );
  }

  function setZoomAtCenter(value) {
    const rect =
      state.displayCanvas
        .getBoundingClientRect();

    setZoom(
      value,
      rect.width / 2,
      rect.height / 2
    );
  }

  function setZoom(
    newZoom,
    screenX,
    screenY
  ) {
    const oldZoom =
      state.zoom;

    newZoom =
      clamp(
        newZoom,
        state.minZoom,
        state.maxZoom
      );

    const imageX =
      (
        screenX -
        state.panX
      ) / oldZoom;

    const imageY =
      (
        screenY -
        state.panY
      ) / oldZoom;

    state.zoom =
      newZoom;

    state.panX =
      screenX -
      imageX *
        newZoom;

    state.panY =
      screenY -
      imageY *
        newZoom;

    render();
  }

  /* ============================================================
     CONVERSION COORDONNÉES
     ============================================================ */

  function screenToImage(x, y) {
    return {
      x:
        (x - state.panX) /
        state.zoom,

      y:
        (y - state.panY) /
        state.zoom
    };
  }

  /* ============================================================
     PINCEAU
     ============================================================ */

  function paintSegment(
    screenX1,
    screenY1,
    screenX2,
    screenY2
  ) {
    if (
      state.tool !== "add" &&
      state.tool !== "erase"
    ) {
      return;
    }

    const p1 =
      screenToImage(
        screenX1,
        screenY1
      );

    const p2 =
      screenToImage(
        screenX2,
        screenY2
      );

    const distance =
      Math.hypot(
        p2.x - p1.x,
        p2.y - p1.y
      );

    const step =
      Math.max(
        1,
        state.brushSize * 0.18
      );

    const count =
      Math.max(
        1,
        Math.ceil(
          distance / step
        )
      );

    for (
      let i = 0;
      i <= count;
      i++
    ) {
      const t = i / count;

      paintDot(
        p1.x +
          (p2.x - p1.x) * t,

        p1.y +
          (p2.y - p1.y) * t
      );
    }

    render();
  }

  function paintDot(x, y) {
    const radius =
      state.brushSize / 2;

    const ctx =
      state.maskCtx;

    ctx.save();

    if (
      state.tool === "erase"
    ) {
      ctx.globalCompositeOperation =
        "destination-out";
    } else {
      ctx.globalCompositeOperation =
        "source-over";
    }

    const innerRadius =
      radius *
      clamp(
        state.hardness,
        0.05,
        1
      );

    const g =
      ctx.createRadialGradient(
        x,
        y,
        innerRadius,
        x,
        y,
        radius
      );

    if (
      state.tool === "erase"
    ) {
      g.addColorStop(
        0,
        "rgba(0,0,0,1)"
      );

      g.addColorStop(
        Math.min(
          0.99,
          state.hardness
        ),
        "rgba(0,0,0,1)"
      );

      g.addColorStop(
        1,
        "rgba(0,0,0,0)"
      );
    } else {
      g.addColorStop(
        0,
        "rgba(255,255,255,1)"
      );

      g.addColorStop(
        Math.min(
          0.99,
          state.hardness
        ),
        "rgba(255,255,255,1)"
      );

      g.addColorStop(
        1,
        "rgba(255,255,255,0)"
      );
    }

    ctx.fillStyle = g;

    ctx.beginPath();

    ctx.arc(
      x,
      y,
      radius,
      0,
      Math.PI * 2
    );

    ctx.fill();

    ctx.restore();
  }

  /* ============================================================
     RENDER PRINCIPAL
     ============================================================ */

  function render() {
    if (
      !state.displayCanvas ||
      !state.imageCanvas
    ) {
      return;
    }

    const ctx =
      state.displayCtx;

    const canvas =
      state.displayCanvas;

    const dpr =
      window.devicePixelRatio || 1;

    /*
      Tout le dessin est effectué
      dans les coordonnées CSS.
    */

    ctx.setTransform(
      dpr,
      0,
      0,
      dpr,
      0,
      0
    );

    const rect =
      canvas.getBoundingClientRect();

    ctx.clearRect(
      0,
      0,
      rect.width,
      rect.height
    );

    ctx.save();

    ctx.translate(
      state.panX,
      state.panY
    );

    ctx.scale(
      state.zoom,
      state.zoom
    );

    ctx.drawImage(
      state.imageCanvas,
      0,
      0
    );

    if (state.showMask) {
      drawMaskOverlay(ctx);
    }

    ctx.restore();

    drawBrushCursor(ctx);

    if (
      state.loupeEnabled
    ) {
      renderLoupe();
    }

    updateHistoryButtons();
  }

  function drawMaskOverlay(ctx) {
    const temp =
      document.createElement(
        "canvas"
      );

    temp.width =
      state.maskCanvas.width;

    temp.height =
      state.maskCanvas.height;

    const t =
      temp.getContext("2d");

    t.fillStyle =
      `rgba(0,170,255,${state.maskOpacity})`;

    t.fillRect(
      0,
      0,
      temp.width,
      temp.height
    );

    t.globalCompositeOperation =
      "destination-in";

    t.drawImage(
      state.maskCanvas,
      0,
      0
    );

    ctx.drawImage(
      temp,
      0,
      0
    );
  }

  function drawBrushCursor(ctx) {
    if (
      state.tool !== "add" &&
      state.tool !== "erase"
    ) {
      return;
    }

    ctx.save();

    ctx.beginPath();

    /*
      La taille du pinceau représente
      une taille IMAGE, donc elle grossit
      avec le zoom.
    */

    const radius =
      state.brushSize *
      state.zoom /
      2;

    ctx.arc(
      state.pointerX,
      state.pointerY,
      radius,
      0,
      Math.PI * 2
    );

    ctx.lineWidth = 2;

    ctx.strokeStyle =
      state.tool === "erase"
        ? "#ff5252"
        : "#22e67b";

    ctx.stroke();

    ctx.restore();
  }

  /* ============================================================
     LOUPE
     ============================================================ */

  function renderLoupe() {
    if (
      !state.loupeCtx ||
      !state.loupeCanvas
    ) {
      return;
    }

    const ctx =
      state.loupeCtx;

    const canvas =
      state.loupeCanvas;

    const p =
      screenToImage(
        state.pointerX,
        state.pointerY
      );

    const visibleImageSize =
      canvas.width /
      state.loupeZoom;

    const sx =
      p.x -
      visibleImageSize / 2;

    const sy =
      p.y -
      visibleImageSize / 2;

    ctx.clearRect(
      0,
      0,
      canvas.width,
      canvas.height
    );

    ctx.drawImage(
      state.imageCanvas,
      sx,
      sy,
      visibleImageSize,
      visibleImageSize,
      0,
      0,
      canvas.width,
      canvas.height
    );

    if (state.showMask) {
      const temp =
        document.createElement(
          "canvas"
        );

      temp.width =
        canvas.width;

      temp.height =
        canvas.height;

      const t =
        temp.getContext("2d");

      t.drawImage(
        state.maskCanvas,
        sx,
        sy,
        visibleImageSize,
        visibleImageSize,
        0,
        0,
        canvas.width,
        canvas.height
      );

      t.globalCompositeOperation =
        "source-in";

      t.fillStyle =
        `rgba(0,170,255,${state.maskOpacity})`;

      t.fillRect(
        0,
        0,
        temp.width,
        temp.height
      );

      ctx.drawImage(
        temp,
        0,
        0
      );
    }

    const centerX =
      canvas.width / 2;

    const centerY =
      canvas.height / 2;

    /*
      Réticule
    */

    ctx.beginPath();

    ctx.moveTo(
      centerX - 28,
      centerY
    );

    ctx.lineTo(
      centerX + 28,
      centerY
    );

    ctx.moveTo(
      centerX,
      centerY - 28
    );

    ctx.lineTo(
      centerX,
      centerY + 28
    );

    ctx.strokeStyle =
      "rgba(255,255,255,.95)";

    ctx.lineWidth = 2;

    ctx.stroke();

    /*
      Cercle pinceau dans la loupe
    */

    if (
      state.tool === "add" ||
      state.tool === "erase"
    ) {
      const radius =
        state.brushSize *
        state.loupeZoom /
        2;

      ctx.beginPath();

      ctx.arc(
        centerX,
        centerY,
        radius,
        0,
        Math.PI * 2
      );

      ctx.strokeStyle =
        state.tool === "erase"
          ? "#ff5252"
          : "#22e67b";

      ctx.lineWidth = 3;

      ctx.stroke();
    }
  }

  function toggleLoupe() {
    state.loupeEnabled =
      !state.loupeEnabled;

    if (state.loupeWrap) {
      state.loupeWrap.style.display =
        state.loupeEnabled
          ? "block"
          : "none";
    }

    render();
  }

  /* ============================================================
     OUTILS
     ============================================================ */

  function setTool(tool) {
    state.tool = tool;

    if (
      state.displayCanvas
    ) {
      state.displayCanvas.style.cursor =
        tool === "pan"
          ? "grab"
          : "crosshair";
    }

    updateToolButtons();
    render();
  }

  function updateToolButtons() {
    const entries = [
      ["add", state.addBtn],
      ["erase", state.eraseBtn],
      ["pan", state.panBtn]
    ];

    entries.forEach(
      ([tool, btn]) => {
        if (!btn) return;

        const active =
          state.tool === tool;

        btn.style.background =
          active
            ? "#1677d2"
            : "#242424";

        btn.style.borderColor =
          active
            ? "#42a5ff"
            : "#444";
      }
    );
  }

  /* ============================================================
     HISTORIQUE
     ============================================================ */

  function cloneImageData(data) {
    return new ImageData(
      new Uint8ClampedArray(
        data.data
      ),
      data.width,
      data.height
    );
  }

  function saveHistory() {
    const w =
      state.maskCanvas.width;

    const h =
      state.maskCanvas.height;

    if (!w || !h) return;

    const snapshot =
      state.maskCtx.getImageData(
        0,
        0,
        w,
        h
      );

    state.history.push(
      snapshot
    );

    if (
      state.history.length >
      state.maxHistory
    ) {
      state.history.shift();
    }

    state.redo = [];

    updateHistoryButtons();
  }

  function undo() {
    if (
      state.history.length <= 1
    ) {
      return;
    }

    const current =
      state.history.pop();

    state.redo.push(current);

    const previous =
      state.history[
        state.history.length - 1
      ];

    state.maskCtx.putImageData(
      previous,
      0,
      0
    );

    render();
  }

  function redo() {
    if (!state.redo.length) {
      return;
    }

    const snapshot =
      state.redo.pop();

    state.history.push(
      snapshot
    );

    state.maskCtx.putImageData(
      snapshot,
      0,
      0
    );

    render();
  }

  function updateHistoryButtons() {
    if (state.undoBtn) {
      state.undoBtn.disabled =
        state.history.length <= 1;

      state.undoBtn.style.opacity =
        state.undoBtn.disabled
          ? ".4"
          : "1";
    }

    if (state.redoBtn) {
      state.redoBtn.disabled =
        state.redo.length === 0;

      state.redoBtn.style.opacity =
        state.redoBtn.disabled
          ? ".4"
          : "1";
    }
  }

  function resetMask() {
    if (
      !confirm(
        "Revenir au masque d'origine ?"
      )
    ) {
      return;
    }

    if (
      !state.initialMaskSnapshot
    ) {
      return;
    }

    state.maskCtx.putImageData(
      state.initialMaskSnapshot,
      0,
      0
    );

    state.history = [];
    state.redo = [];

    saveHistory();
    render();
  }

  /* ============================================================
     POINTER / SOURIS / PENCIL / TOUCH
     ============================================================ */

  function bindPointerEvents() {
    const canvas =
      state.displayCanvas;

    canvas.addEventListener(
      "pointerdown",
      e => {
        e.preventDefault();

        canvas.setPointerCapture?.(
          e.pointerId
        );

        const pos =
          pointerPosition(e);

        state.pointerX = pos.x;
        state.pointerY = pos.y;

        state.pointers.set(
          e.pointerId,
          pos
        );

        /*
          2 doigts = pinch / déplacement
        */

        if (
          state.pointers.size >= 2
        ) {
          startPinch();
          state.drawing = false;
          return;
        }

        if (
          state.tool === "pan"
        ) {
          state.panning = true;

          state.panStartX =
            pos.x -
            state.panX;

          state.panStartY =
            pos.y -
            state.panY;

          return;
        }

        state.drawing = true;

        state.lastImageX =
          pos.x;

        state.lastImageY =
          pos.y;

        paintSegment(
          pos.x,
          pos.y,
          pos.x,
          pos.y
        );
      }
    );

    canvas.addEventListener(
      "pointermove",
      e => {
        const pos =
          pointerPosition(e);

        state.pointerX = pos.x;
        state.pointerY = pos.y;

        if (
          state.pointers.has(
            e.pointerId
          )
        ) {
          state.pointers.set(
            e.pointerId,
            pos
          );
        }

        if (
          state.pointers.size >= 2
        ) {
          handlePinch();
          return;
        }

        if (
          state.panning
        ) {
          state.panX =
            pos.x -
            state.panStartX;

          state.panY =
            pos.y -
            state.panStartY;

          render();
          return;
        }

        if (
          state.drawing
        ) {
          paintSegment(
            state.lastImageX,
            state.lastImageY,
            pos.x,
            pos.y
          );

          state.lastImageX =
            pos.x;

          state.lastImageY =
            pos.y;

          return;
        }

        render();
      }
    );

    const finish =
      e => {
        const wasDrawing =
          state.drawing;

        state.pointers.delete(
          e.pointerId
        );

        state.drawing = false;
        state.panning = false;

        if (wasDrawing) {
          saveHistory();
        }

        render();
      };

    canvas.addEventListener(
      "pointerup",
      finish
    );

    canvas.addEventListener(
      "pointercancel",
      finish
    );

    /*
      Zoom molette Mac / PC
    */

    canvas.addEventListener(
      "wheel",
      e => {
        e.preventDefault();

        const pos =
          pointerPosition(e);

        const factor =
          e.deltaY < 0
            ? 1.15
            : 1 / 1.15;

        setZoom(
          state.zoom * factor,
          pos.x,
          pos.y
        );
      },
      { passive: false }
    );
  }

  function pointerPosition(e) {
    const rect =
      state.displayCanvas
        .getBoundingClientRect();

    return {
      x:
        e.clientX -
        rect.left,

      y:
        e.clientY -
        rect.top
    };
  }

  /* ============================================================
     PINCH IPAD
     ============================================================ */

  function startPinch() {
    const pts =
      [...state.pointers.values()];

    if (pts.length < 2) return;

    const a = pts[0];
    const b = pts[1];

    state.pinchStartDistance =
      Math.hypot(
        b.x - a.x,
        b.y - a.y
      );

    state.pinchStartZoom =
      state.zoom;

    state.pinchCenterX =
      (a.x + b.x) / 2;

    state.pinchCenterY =
      (a.y + b.y) / 2;
  }

  function handlePinch() {
    const pts =
      [...state.pointers.values()];

    if (pts.length < 2) return;

    const a = pts[0];
    const b = pts[1];

    const distance =
      Math.hypot(
        b.x - a.x,
        b.y - a.y
      );

    if (
      !state.pinchStartDistance
    ) {
      startPinch();
      return;
    }

    const factor =
      distance /
      state.pinchStartDistance;

    const centerX =
      (a.x + b.x) / 2;

    const centerY =
      (a.y + b.y) / 2;

    setZoom(
      state.pinchStartZoom *
        factor,
      centerX,
      centerY
    );
  }

  /* ============================================================
     VALIDATION
     ============================================================ */

  function validateMask() {
    const result =
      document.createElement(
        "canvas"
      );

    result.width =
      state.maskCanvas.width;

    result.height =
      state.maskCanvas.height;

    result
      .getContext("2d")
      .drawImage(
        state.maskCanvas,
        0,
        0
      );

    /*
      C'est CE canvas que le moteur 3D
      utilisera ensuite.
    */

    window.validatedMaskCanvas =
      result;

    /*
      Événement permettant au moteur 3D
      ou à une future version de réagir.
    */

    window.dispatchEvent(
      new CustomEvent(
        "happyholo-mask-validated",
        {
          detail: {
            maskCanvas: result
          }
        }
      )
    );

    console.log(
      "[MASK] Masque validé :",
      result.width,
      "x",
      result.height
    );

    closeEditor();

    /*
      Petit retour visible
    */

    showTemporaryMessage(
      "✓ Correction du sujet enregistrée"
    );
  }

  function closeEditor() {
    if (!state.modal) return;

    state.modal.style.display =
      "none";

    document.body.style.overflow =
      "";
  }

  /* ============================================================
     MESSAGE DE CONFIRMATION
     ============================================================ */

  function showTemporaryMessage(text) {
    const toast =
      create(
        "div",
        {
          text,
          style: {
            position: "fixed",
            left: "50%",
            bottom: "30px",
            transform:
              "translateX(-50%)",
            zIndex: "1000000",
            padding: "12px 18px",
            borderRadius: "12px",
            background: "#1677d2",
            color: "#fff",
            fontWeight: "700",
            boxShadow:
              "0 5px 25px rgba(0,0,0,.4)"
          }
        },
        document.body
      );

    setTimeout(
      () => toast.remove(),
      1800
    );
  }

  /* ============================================================
     BOUTON DANS LE SITE EXISTANT
     ============================================================ */

  function installMainButton() {
    if (
      document.getElementById(
        "happyholoMaskEditButton"
      )
    ) {
      return;
    }

    const btn =
      create(
        "button",
        {
          id:
            "happyholoMaskEditButton",

          type: "button",

          text:
            "✏️ Corriger le sujet",

          style: {
            width: "100%",
            marginTop: "10px",
            padding: "12px 14px",
            border: "1px solid #4b8ccc",
            borderRadius: "10px",
            background:
              "linear-gradient(180deg,#207bc5,#155d9b)",
            color: "#fff",
            fontWeight: "700",
            fontSize: "15px",
            cursor: "pointer"
          }
        }
      );

    btn.addEventListener(
      "click",
      openEditor
    );

    /*
      On essaie d'insérer le bouton
      au meilleur endroit du panneau 3D.
    */

    const candidates = [
      document.getElementById(
        "generateBtn"
      ),
      document.getElementById(
        "exportViewsBtn"
      ),
      document.getElementById(
        "preview"
      )
    ].filter(Boolean);

    if (candidates.length) {
      const target =
        candidates[0];

      if (
        target.parentElement
      ) {
        target.parentElement
          .insertBefore(
            btn,
            target.nextSibling
          );

        return;
      }
    }

    /*
      Secours :
      bouton flottant.
    */

    btn.style.position =
      "fixed";

    btn.style.right =
      "15px";

    btn.style.bottom =
      "15px";

    btn.style.width =
      "auto";

    btn.style.zIndex =
      "9999";

    document.body.appendChild(
      btn
    );
  }

  /* ============================================================
     API PUBLIQUE
     ============================================================ */

  window.HappyHoloMaskEditor = {
    open: openEditor,

    getMask() {
      return (
        window.validatedMaskCanvas ||
        null
      );
    },

    clear() {
      window.validatedMaskCanvas =
        null;
    }
  };

  /* ============================================================
     INITIALISATION
     ============================================================ */

  function init() {
    installMainButton();

    console.log(
      "[MASK] HappyHolo Mask Editor V13 prêt."
    );
  }

  if (
    document.readyState ===
    "loading"
  ) {
    document.addEventListener(
      "DOMContentLoaded",
      init
    );
  } else {
    init();
  }

})();
