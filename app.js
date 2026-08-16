const imageInput =
  document.getElementById("imageInput");

const generateBtn =
  document.getElementById("generateBtn");

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


let sourceFile = null;
let thumbUrl = null;
let engine = null;


function setStatus(message, progress = null) {

  statusBox.textContent = message;

  if (progress !== null) {
    bar.style.width = `${progress}%`;
  }
}


async function compressImage(
  file,
  maxSide = 1400,
  quality = 0.9
) {

  const url =
    URL.createObjectURL(file);

  try {

    const image =
      await new Promise(
        (resolve, reject) => {

          const img =
            new Image();

          img.onload =
            () => resolve(img);

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

    URL.revokeObjectURL(url);
  }
}


async function removeBackground(file) {

  const form =
    new FormData();


  form.append(
    "image",
    file,
    file.name
  );


  form.append(
    "output_format",
    "png"
  );


  const response =
    await fetch(
      "/api/remove-background",
      {
        method: "POST",
        body: form
      }
    );


  if (!response.ok) {

    let message =
      await response.text();


    try {

      const json =
        JSON.parse(message);

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


async function getEngine() {

  if (engine) {
    return engine;
  }


  engine =
    await import(
      "./engine.js?v=19"
    );


  await engine.init(
    viewer
  );


  return engine;
}


imageInput.addEventListener(
  "change",
  () => {

    sourceFile =
      imageInput.files?.[0] ||
      null;


    generateBtn.disabled =
      !sourceFile;


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
        "Photo chargée. Touchez « Créer l’aperçu 3D ».",
        0
      );
    }

    else {

      thumb.style.display =
        "none";


      setStatus(
        "Chargez une photo pour commencer.",
        0
      );
    }
  }
);


generateBtn.addEventListener(
  "click",
  async () => {

    if (!sourceFile) {
      return;
    }


    generateBtn.disabled =
      true;


    try {

      setStatus(
        "1/4 Préparation de la photo…",
        8
      );


      const preparedPhoto =
        await compressImage(
          sourceFile
        );


      setStatus(
        "2/4 Détourage précis du sujet…",
        24
      );


      const subjectBlob =
        await removeBackground(
          preparedPhoto
        );


      setStatus(
        "3/4 Analyse de profondeur interne…",
        48
      );


      const currentEngine =
        await getEngine();


      await currentEngine.build(
        preparedPhoto,
        subjectBlob,
        setStatus
      );


      placeholder.style.display =
        "none";


      setStatus(
        "4/4 Mise en mouvement de la profondeur…",
        90
      );


      currentEngine.start();


      setStatus(
        "Aperçu V19 actif : silhouette protégée, relief conservé à l’intérieur du sujet.",
        100
      );
    }

    catch (error) {

      console.error(error);


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
