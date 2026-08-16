const imageInput = document.getElementById("imageInput");
const generateBtn = document.getElementById("generateBtn");
const statusBox = document.getElementById("status");
const bar = document.getElementById("bar");

const thumb = document.getElementById("thumb");
const placeholder = document.getElementById("placeholder");

const backgroundLayer =
  document.getElementById("backgroundLayer");

const subjectLayer =
  document.getElementById("subjectLayer");

let sourceFile = null;
let thumbUrl = null;
let backgroundUrl = null;
let subjectUrl = null;


function setStatus(message, progress = null) {

  statusBox.textContent = message;

  if (progress !== null) {
    bar.style.width = `${progress}%`;
  }
}


async function compressImage(
  file,
  maxSide = 1500,
  quality = 0.86
) {

  const url = URL.createObjectURL(file);

  try {

    const image = await new Promise(
      (resolve, reject) => {

        const img = new Image();

        img.onload = () => resolve(img);

        img.onerror = () =>
          reject(
            new Error(
              "Impossible de lire la photo."
            )
          );

        img.src = url;
      }
    );


    const scale = Math.min(
      1,
      maxSide /
      Math.max(
        image.naturalWidth,
        image.naturalHeight
      )
    );


    const width = Math.max(
      64,
      Math.round(
        image.naturalWidth * scale
      )
    );

    const height = Math.max(
      64,
      Math.round(
        image.naturalHeight * scale
      )
    );


    const canvas =
      document.createElement("canvas");

    canvas.width = width;
    canvas.height = height;


    const context =
      canvas.getContext("2d");

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
        "Compression de la photo impossible."
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

    URL.revokeObjectURL(url);
  }
}



function loadTransparentImage(blob) {

  return new Promise(
    (resolve, reject) => {

      const url =
        URL.createObjectURL(blob);

      const image =
        new Image();


      image.onload = () =>
        resolve({
          image,
          url
        });


      image.onerror = () => {

        URL.revokeObjectURL(url);

        reject(
          new Error(
            "Image détourée illisible."
          )
        );
      };


      image.src = url;
    }
  );
}



async function createEraseMask(
  subjectBlob
) {

  const result =
    await loadTransparentImage(
      subjectBlob
    );


  const image = result.image;
  const tempUrl = result.url;


  try {

    const canvas =
      document.createElement("canvas");

    canvas.width =
      image.naturalWidth;

    canvas.height =
      image.naturalHeight;


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
      0
    );


    const imageData =
      context.getImageData(
        0,
        0,
        canvas.width,
        canvas.height
      );


    const width =
      canvas.width;

    const height =
      canvas.height;


    const alpha =
      new Uint8ClampedArray(
        width * height
      );


    for (
      let i = 0;
      i < width * height;
      i++
    ) {

      alpha[i] =
        imageData.data[
          i * 4 + 3
        ];
    }


    const mask =
      context.createImageData(
        width,
        height
      );


    const radius = 3;


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
          );

          yy += 2
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

            xx += 2
          ) {

            if (
              alpha[
                yy * width + xx
              ] > 45
            ) {

              erase = 255;

              break;
            }
          }


          if (erase === 255) {
            break;
          }
        }


        const index =
          (y * width + x) * 4;


        mask.data[index] =
          erase;

        mask.data[index + 1] =
          erase;

        mask.data[index + 2] =
          erase;

        mask.data[index + 3] =
          255;
      }
    }


    context.putImageData(
      mask,
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
      tempUrl
    );
  }
}



async function sendForm(
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


    backgroundLayer.classList.remove(
      "animate",
      "ready"
    );


    subjectLayer.classList.remove(
      "animate",
      "ready"
    );


    try {

      setStatus(
        "1/4 Optimisation de la photo…",
        8
      );


      const photo =
        await compressImage(
          sourceFile
        );


      setStatus(
        "2/4 Détourage automatique du sujet…",
        22
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
        await sendForm(
          "/api/remove-background",
          removeForm
        );


      setStatus(
        "3/4 Reconstruction du décor derrière le sujet…",
        50
      );


      const maskBlob =
        await createEraseMask(
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
        "output_format",
        "png"
      );


      const cleanBackground =
        await sendForm(
          "/api/erase-background",
          eraseForm
        );


      setStatus(
        "4/4 Création de la parallaxe…",
        82
      );


      if (backgroundUrl) {

        URL.revokeObjectURL(
          backgroundUrl
        );
      }


      if (subjectUrl) {

        URL.revokeObjectURL(
          subjectUrl
        );
      }


      backgroundUrl =
        URL.createObjectURL(
          cleanBackground
        );


      subjectUrl =
        URL.createObjectURL(
          subjectBlob
        );


      backgroundLayer.src =
        backgroundUrl;


      subjectLayer.src =
        subjectUrl;


      try {

        await Promise.all([
          backgroundLayer.decode(),
          subjectLayer.decode()
        ]);

      }

      catch {}


      placeholder.style.display =
        "none";


      backgroundLayer.classList.add(
        "ready"
      );


      subjectLayer.classList.add(
        "ready"
      );


      void backgroundLayer.offsetWidth;

      void subjectLayer.offsetWidth;


      backgroundLayer.classList.add(
        "animate"
      );


      subjectLayer.classList.add(
        "animate"
      );


      setStatus(
        "Aperçu 3D actif : le sujet se déplace devant le décor sans faire pivoter la photo.",
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
