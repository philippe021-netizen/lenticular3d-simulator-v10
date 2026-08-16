const imageInput =
  document.getElementById("imageInput");

const generateBtn =
  document.getElementById("generateBtn");

const exportVideoBtn =
  document.getElementById("exportVideoBtn");

const exportViewsBtn =
  document.getElementById("exportViewsBtn");

const downloadVideo =
  document.getElementById("downloadVideo");

const statusBox =
  document.getElementById("status");

const bar =
  document.getElementById("bar");

const thumb =
  document.getElementById("thumb");

const viewer =
  document.getElementById("viewer");

const placeholder =
  document.getElementById("placeholder");

const productStage =
  document.getElementById("productStage");

const productShell =
  document.getElementById("productShell");

const supportLabel =
  document.getElementById("supportLabel");

const supportButtons =
  document.querySelectorAll(
    ".support-card"
  );


let sourceFile = null;
let thumbUrl = null;
let engine = null;
let videoUrl = null;

let simulationReady = false;

let selectedSupport =
  "medallion-cat";


/* =========================================
   SUPPORTS
========================================= */

const supports = {

  "medallion-cat": {
    className:
      "support-medallion-cat",
    label:
      "Médaillon chat"
  },

  "medallion-dog": {
    className:
      "support-medallion-dog",
    label:
      "Médaillon chien"
  },

  "card": {
    className:
      "support-card-cb",
    label:
      "Carte CB"
  },

  "keychain": {
    className:
      "support-keychain",
    label:
      "Porte-clé rectangulaire"
  }
};


/* =========================================
   STATUT
========================================= */

function setStatus(
  message,
  progress = null
) {

  statusBox.textContent =
    message;

  if (progress !== null) {

    bar.style.width =
      `${progress}%`;
  }
}


/* =========================================
   ROTATION DU SUPPORT
========================================= */

let shellAnimationFrame = 0;

let shellAnimationStart = 0;


function stopProductShellRotation() {

  if (shellAnimationFrame) {

    cancelAnimationFrame(
      shellAnimationFrame
    );

    shellAnimationFrame =
      0;
  }


  if (productShell) {

    productShell.style.transform =
      "";
  }
}


function startProductShellRotation() {

  if (!productShell) {
    return;
  }


  stopProductShellRotation();


  shellAnimationStart =
    performance.now();


  const animateShell =
    currentTime => {

      const elapsed =
        (
          currentTime -
          shellAnimationStart
        )
        /
        6000;


      const position =
        Math.sin(
          elapsed *
          Math.PI *
          2
        );


      const shellAngle =
        position *
        6;


      const scaleX =
        1 -
        Math.abs(
          position
        ) *
        0.018;


      productShell.style.transform =
        `
          perspective(1200px)
          rotateY(${shellAngle}deg)
          scaleX(${scaleX})
        `;


      shellAnimationFrame =
        requestAnimationFrame(
          animateShell
        );
    };


  shellAnimationFrame =
    requestAnimationFrame(
      animateShell
    );
}


/* =========================================
   CHANGEMENT DE SUPPORT
========================================= */

async function selectSupport(
  supportName
) {

  const support =
    supports[
      supportName
    ];


  if (!support) {
    return;
  }


  selectedSupport =
    supportName;


  supportButtons.forEach(
    button => {

      const active =
        button.dataset.support ===
        supportName;


      button.classList.toggle(
        "active",
        active
      );
    }
  );


  productStage.classList.remove(
    "support-medallion-cat",
    "support-medallion-dog",
    "support-card-cb",
    "support-keychain"
  );


  productStage.classList.add(
    support.className
  );


  supportLabel.textContent =
    support.label;


  await new Promise(
    resolve =>
      requestAnimationFrame(
        resolve
      )
  );


  await new Promise(
    resolve =>
      requestAnimationFrame(
        resolve
      )
  );


  if (
    engine &&
    typeof engine.refreshSupport ===
    "function"
  ) {

    engine.refreshSupport();
  }


  window.dispatchEvent(
    new Event(
      "resize"
    )
  );


  if (simulationReady) {

    startProductShellRotation();


    setStatus(
      `${support.label} sélectionné. La simulation existante est réutilisée sans nouveau calcul IA.`,
      100
    );
  }

  else {

    setStatus(
      `${support.label} sélectionné. Ajoutez une photo puis créez l’aperçu 3D.`,
      0
    );
  }
}


/* =========================================
   CLIC SUPPORT
========================================= */

supportButtons.forEach(
  button => {

    button.addEventListener(
      "click",
      () => {

        selectSupport(
          button.dataset.support
        );
      }
    );
  }
);


/* =========================================
   PRÉPARATION PHOTO
========================================= */

async function compressImage(
  file,
  maxSide = 1400,
  quality = 0.9
) {

  const url =
    URL.createObjectURL(
      file
    );


  try {

    const image =
      await new Promise(
        (
          resolve,
          reject
        ) => {

          const img =
            new Image();


          img.onload =
            () =>
              resolve(
                img
              );


          img.onerror =
            () =>
              reject(
                new Error(
                  "Impossible de lire la photo."
                )
              );


          img.src =
            url;
        }
      );


    const scale =
      Math.min(
        1,

        maxSide /
        Math.max(
          image.naturalWidth,
          image.naturalHeight
        )
      );


    const width =
      Math.max(
        64,

        Math.round(
          image.naturalWidth *
          scale
        )
      );


    const height =
      Math.max(
        64,

        Math.round(
          image.naturalHeight *
          scale
        )
      );


    const canvas =
      document.createElement(
        "canvas"
      );


    canvas.width =
      width;

    canvas.height =
      height;


    const context =
      canvas.getContext(
        "2d"
      );


    context.drawImage(
      image,
      0,
      0,
      width,
      height
    );


    const blob =
      await new Promise(
        resolve =>
          canvas.toBlob(
            resolve,
            "image/jpeg",
            quality
          )
      );


    if (!blob) {

      throw new Error(
        "Compression impossible."
      );
    }


    return new File(
      [blob],
      "photo.jpg",
      {
        type:
          "image/jpeg"
      }
    );
  }

  finally {

    URL.revokeObjectURL(
      url
    );
  }
}


/* =========================================
   API
========================================= */

async function postForm(
  endpoint,
  form
) {

  const response =
    await fetch(
      endpoint,
      {
        method:
          "POST",

        body:
          form
      }
    );


  if (!response.ok) {

    let message =
      await response.text();


    try {

      const json =
        JSON.parse(
          message
        );


      message =
        json.error ||
        message;
    }

    catch {}


    throw new Error(
      message ||
      `Erreur ${response.status}`
    );
  }


  return await response.blob();
}


/* =========================================
   BLOB → IMAGE
========================================= */

function blobToImage(
  blob
) {

  return new Promise(
    (
      resolve,
      reject
    ) => {

      const url =
        URL.createObjectURL(
          blob
        );


      const image =
        new Image();


      image.onload =
        () =>
          resolve({
            image,
            url
          });


      image.onerror =
        () => {

          URL.revokeObjectURL(
            url
          );


          reject(
            new Error(
              "Image détourée illisible."
            )
          );
        };


      image.src =
        url;
    }
  );
}


/* =========================================
   MASQUE
========================================= */

async function makeEraseMask(
  subjectBlob
) {

  const {
    image,
    url
  } =
    await blobToImage(
      subjectBlob
    );


  try {

    const width =
      image.naturalWidth;


    const height =
      image.naturalHeight;


    const canvas =
      document.createElement(
        "canvas"
      );


    canvas.width =
      width;

    canvas.height =
      height;


    const context =
      canvas.getContext(
        "2d",
        {
          willReadFrequently:
            true
        }
      );


    context.drawImage(
      image,
      0,
      0,
      width,
      height
    );


    const imageData =
      context.getImageData(
        0,
        0,
        width,
        height
      );


    const alpha =
      new Uint8ClampedArray(
        width *
        height
      );


    for (
      let i = 0;
      i <
      width *
      height;
      i++
    ) {

      alpha[i] =
        imageData.data[
          i * 4 + 3
        ];
    }


    const output =
      context.createImageData(
        width,
        height
      );


    const radius =
      2;


    for (
      let y = 0;
      y < height;
      y++
    ) {

      for (
        let x = 0;
        x < width;
        x++
      ) {

        let erase =
          0;


        for (
          let yy =
            Math.max(
              0,
              y - radius
            );

          yy <=
            Math.min(
              height - 1,
              y + radius
            ) &&
          !erase;

          yy++
        ) {

          for (
            let xx =
              Math.max(
                0,
                x - radius
              );

            xx <=
              Math.min(
                width - 1,
                x + radius
              );

            xx++
          ) {

            if (
              alpha[
                yy *
                width +
                xx
              ] >
              32
            ) {

              erase =
                255;

              break;
            }
          }
        }


        const index =
          (
            y *
            width +
            x
          ) *
          4;


        output.data[
          index
        ] =
          erase;


        output.data[
          index + 1
        ] =
          erase;


        output.data[
          index + 2
        ] =
          erase;


        output.data[
          index + 3
        ] =
          255;
      }
    }


    context.putImageData(
      output,
      0,
      0
    );


    return await new Promise(
      resolve =>
        canvas.toBlob(
          resolve,
          "image/png"
        )
    );
  }

  finally {

    URL.revokeObjectURL(
      url
    );
  }
}


/* =========================================
   MOTEUR V27
========================================= */

async function getEngine() {

  if (engine) {

    return engine;
  }


  engine =
    await import(
      "./engine.js?v=27"
    );


  await engine.init(
    viewer
  );


  return engine;
}


/* =========================================
   CHOIX PHOTO
========================================= */

imageInput.addEventListener(
  "change",
  () => {

    sourceFile =
      imageInput.files?.[0] ||
      null;


    simulationReady =
      false;


    stopProductShellRotation();


    generateBtn.disabled =
      !sourceFile;


    if (exportVideoBtn) {

      exportVideoBtn.disabled =
        true;
    }


    if (exportViewsBtn) {

      exportViewsBtn.disabled =
        true;
    }


    if (downloadVideo) {

      downloadVideo.style.display =
        "none";
    }


    if (videoUrl) {

      URL.revokeObjectURL(
        videoUrl
      );


      videoUrl =
        null;
    }


    if (thumbUrl) {

      URL.revokeObjectURL(
        thumbUrl
      );
    }


    if (sourceFile) {

      thumbUrl =
        URL.createObjectURL(
          sourceFile
        );


      thumb.src =
        thumbUrl;


      thumb.style.display =
        "block";


      setStatus(
        `${supports[selectedSupport].label} sélectionné. Photo chargée : lancez l’aperçu 3D.`,
        0
      );
    }

    else {

      thumb.style.display =
        "none";


      setStatus(
        "Choisissez un support puis chargez une photo.",
        0
      );
    }
  }
);


/* =========================================
   CRÉATION SIMULATION
========================================= */

generateBtn.addEventListener(
  "click",
  async () => {

    if (!sourceFile) {

      return;
    }


    generateBtn.disabled =
      true;


    exportVideoBtn.disabled =
      true;


    exportViewsBtn.disabled =
      true;


    simulationReady =
      false;


    stopProductShellRotation();


    try {

      setStatus(
        "1/5 Préparation de la photo…",
        6
      );


      const photo =
        await compressImage(
          sourceFile
        );


      setStatus(
        "2/5 Détourage précis du sujet…",
        20
      );


      const removeForm =
        new FormData();


      removeForm.append(
        "image",
        photo,
        photo.name
      );


      removeForm.append(
        "output_format",
        "png"
      );


      const subjectBlob =
        await postForm(
          "/api/remove-background",
          removeForm
        );


      setStatus(
        "3/5 Reconstruction du fond sans le sujet…",
        43
      );


      const maskBlob =
        await makeEraseMask(
          subjectBlob
        );


      if (!maskBlob) {

        throw new Error(
          "Création du masque impossible."
        );
      }


      const eraseForm =
        new FormData();


      eraseForm.append(
        "image",
        photo,
        photo.name
      );


      eraseForm.append(
        "mask",
        maskBlob,
        "mask.png"
      );


      eraseForm.append(
        "grow_mask",
        "10"
      );


      eraseForm.append(
        "output_format",
        "png"
      );


      const cleanBackground =
        await postForm(
          "/api/erase-background",
          eraseForm
        );


      setStatus(
        "4/5 Analyse des profondeurs…",
        66
      );


      const currentEngine =
        await getEngine();


      await currentEngine.build(
        photo,
        cleanBackground,
        subjectBlob,
        setStatus
      );


      if (
        typeof currentEngine.refreshSupport ===
        "function"
      ) {

        currentEngine.refreshSupport();
      }


      placeholder.style.display =
        "none";


      setStatus(
        "5/5 Mise en mouvement…",
        90
      );


      currentEngine.start();


      startProductShellRotation();


      simulationReady =
        true;


      exportVideoBtn.disabled =
        false;


      exportViewsBtn.disabled =
        false;


      setStatus(
        `Simulation prête dans le support « ${supports[selectedSupport].label} ».`,
        100
      );
    }

    catch (error) {

      console.error(
        error
      );


      setStatus(
        `Erreur : ${
          error?.message ||
          String(error)
        }`,
        0
      );
    }

    finally {

      generateBtn.disabled =
        false;
    }
  }
);


/* =========================================
   CHARGEMENT JSZIP
========================================= */

async function getJSZip() {

  if (window.JSZip) {

    return window.JSZip;
  }


  await new Promise(
    (resolve, reject) => {

      const script =
        document.createElement(
          "script"
        );


      script.src =
        "https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js";


      script.onload =
        resolve;


      script.onerror =
        () =>
          reject(
            new Error(
              "Impossible de charger JSZip."
            )
          );


      document.head.appendChild(
        script
      );
    }
  );


  if (!window.JSZip) {

    throw new Error(
      "JSZip n'est pas disponible."
    );
  }


  return window.JSZip;
}


/* =========================================
   EXPORT ZIP DES 9 VUES
========================================= */

if (exportViewsBtn) {

  exportViewsBtn.addEventListener(
    "click",
    async () => {

      exportViewsBtn.disabled =
        true;


      try {

        const currentEngine =
          await getEngine();


        setStatus(
          "Création des 9 vues…",
          0
        );


        const views =
          await currentEngine
            .exportProductionViews(
              (
                current,
                total,
                angle
              ) => {

                const percent =
                  Math.round(
                    current /
                    total *
                    75
                  );


                setStatus(
                  `Vue ${current}/${total} — angle ${angle}°`,
                  percent
                );
              }
            );


        setStatus(
          "Assemblage du ZIP…",
          80
        );


        const JSZip =
          await getJSZip();


        const zip =
          new JSZip();


        const folder =
          zip.folder(
            `vues-${selectedSupport}`
          );


        for (
          let i = 0;
          i < views.length;
          i++
        ) {

          const view =
            views[i];


          folder.file(
            view.filename,
            view.blob
          );


          const percent =
            80 +
            Math.round(
              (
                (i + 1) /
                views.length
              ) *
              10
            );


          setStatus(
            `Ajout au ZIP ${i + 1}/${views.length}…`,
            percent
          );
        }


        setStatus(
          "Compression du ZIP…",
          92
        );


        const zipBlob =
          await zip.generateAsync(
            {
              type:
                "blob",

              compression:
                "DEFLATE",

              compressionOptions: {
                level: 6
              }
            },

            metadata => {

              const percent =
                92 +
                Math.round(
                  metadata.percent *
                  0.08
                );


              setStatus(
                `Compression ZIP… ${Math.round(metadata.percent)}%`,
                Math.min(
                  100,
                  percent
                )
              );
            }
          );


        const url =
          URL.createObjectURL(
            zipBlob
          );


        const link =
          document.createElement(
            "a"
          );


        link.href =
          url;


        link.download =
          `9-vues-${selectedSupport}.zip`;


        document.body.appendChild(
          link
        );


        link.click();


        link.remove();


        setTimeout(
          () =>
            URL.revokeObjectURL(
              url
            ),
          20000
        );


        setStatus(
          "ZIP prêt : les 9 vues ont été téléchargées dans un seul fichier.",
          100
        );
      }

      catch (error) {

        console.error(
          error
        );


        setStatus(
          `Erreur ZIP : ${
            error?.message ||
            String(error)
          }`,
          0
        );
      }

      finally {

        exportViewsBtn.disabled =
          false;
      }
    }
  );
}


/* =========================================
   FORMAT VIDÉO
========================================= */

function chooseVideoMimeType() {

  if (
    typeof MediaRecorder ===
    "undefined"
  ) {

    return null;
  }


  const types = [

    "video/mp4;codecs=avc1.42E01E",

    "video/mp4",

    "video/webm;codecs=vp9",

    "video/webm;codecs=vp8",

    "video/webm"
  ];


  for (
    const type of types
  ) {

    try {

      if (
        MediaRecorder
          .isTypeSupported(
            type
          )
      ) {

        return type;
      }
    }

    catch {}
  }


  return "";
}


/* =========================================
   ENREGISTREMENT VIDÉO
========================================= */

async function recordSimulation() {

  const canvas =
    viewer.querySelector(
      "canvas"
    );


  if (!canvas) {

    throw new Error(
      "Canvas 3D introuvable."
    );
  }


  if (
    typeof canvas.captureStream !==
    "function"
  ) {

    throw new Error(
      "L’enregistrement du canvas n’est pas pris en charge."
    );
  }


  if (
    typeof MediaRecorder ===
    "undefined"
  ) {

    throw new Error(
      "MediaRecorder n’est pas disponible."
    );
  }


  const stream =
    canvas.captureStream(
      30
    );


  const mimeType =
    chooseVideoMimeType();


  let recorder;


  try {

    recorder =
      new MediaRecorder(
        stream,

        mimeType
          ? {
              mimeType,

              videoBitsPerSecond:
                6000000
            }
          : {
              videoBitsPerSecond:
                6000000
            }
      );
  }

  catch {

    recorder =
      new MediaRecorder(
        stream
      );
  }


  const chunks =
    [];


  recorder.ondataavailable =
    event => {

      if (
        event.data &&
        event.data.size >
        0
      ) {

        chunks.push(
          event.data
        );
      }
    };


  const completed =
    new Promise(
      (
        resolve,
        reject
      ) => {

        recorder.onstop =
          resolve;


        recorder.onerror =
          event =>
            reject(
              event.error ||
              new Error(
                "Erreur vidéo."
              )
            );
      }
    );


  recorder.start();


  const duration =
    6000;


  const startTime =
    performance.now();


  await new Promise(
    resolve => {

      const update =
        () => {

          const elapsed =
            performance.now() -
            startTime;


          const percent =
            Math.min(
              100,
              Math.round(
                elapsed /
                duration *
                100
              )
            );


          setStatus(
            `Enregistrement vidéo… ${percent}%`,
            percent
          );


          if (
            elapsed <
            duration
          ) {

            requestAnimationFrame(
              update
            );
          }

          else {

            resolve();
          }
        };


      requestAnimationFrame(
        update
      );
    }
  );


  recorder.stop();


  await completed;


  stream
    .getTracks()
    .forEach(
      track =>
        track.stop()
    );


  const actualType =
    recorder.mimeType ||
    mimeType ||
    "video/webm";


  return new Blob(
    chunks,
    {
      type:
        actualType
    }
  );
}


/* =========================================
   EXPORT VIDÉO
========================================= */

if (exportVideoBtn) {

  exportVideoBtn.addEventListener(
    "click",
    async () => {

      exportVideoBtn.disabled =
        true;


      try {

        setStatus(
          "Préparation de l’enregistrement…",
          0
        );


        const videoBlob =
          await recordSimulation();


        if (videoUrl) {

          URL.revokeObjectURL(
            videoUrl
          );
        }


        videoUrl =
          URL.createObjectURL(
            videoBlob
          );


        const isMp4 =
          videoBlob.type.includes(
            "mp4"
          );


        const extension =
          isMp4
            ? "mp4"
            : "webm";


        downloadVideo.href =
          videoUrl;


        downloadVideo.download =
          `simulation-${selectedSupport}.${extension}`;


        downloadVideo.textContent =
          isMp4
            ? "Télécharger la simulation MP4"
            : "Télécharger la simulation vidéo";


        downloadVideo.style.display =
          "block";


        setStatus(
          isMp4
            ? "Simulation MP4 prête."
            : "Simulation vidéo prête.",
          100
        );
      }

      catch (error) {

        console.error(
          error
        );


        setStatus(
          `Erreur vidéo : ${
            error?.message ||
            String(error)
          }`,
          0
        );
      }

      finally {

        exportVideoBtn.disabled =
          false;
      }
    }
  );
}


/* =========================================
   INITIALISATION
========================================= */

selectSupport(
  selectedSupport
);
