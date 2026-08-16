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
        type: "image/jpeg"
      }
    );
  }

  finally {

    URL.revokeObjectURL(
      url
    );
  }
}


async function postForm(
  endpoint,
  form
) {

  const response =
    await fetch(
      endpoint,
      {
        method: "POST",
        body: form
      }
    );


  if (!response.ok) {

    let message =
      await response.text();


    try {

      message =
        JSON.parse(message)
          .error ||
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


function blobToImage(blob) {

  return new Promise(
    (resolve, reject) => {

      const url =
        URL.createObjectURL(blob);


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
          willReadFrequently: true
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


    const radius = 2;


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

        let erase = 0;


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
                yy * width +
                xx
              ] > 32
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
          ) * 4;


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


async function getEngine() {

  if (engine) {
    return engine;
  }


  engine =
    await import(
      "./engine.js?v=20"
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
        "4/5 Analyse du relief du sujet…",
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


      placeholder.style.display =
        "none";


      setStatus(
        "5/5 Mise en mouvement de la parallaxe…",
        90
      );


      currentEngine.start();


      setStatus(
        "Aperçu V20 actif : le fond ne contient plus le sujet, donc l’angle peut être plus marqué sans double silhouette.",
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
