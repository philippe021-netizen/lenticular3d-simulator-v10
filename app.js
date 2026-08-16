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


async function getEngine() {

  if (engine) {
    return engine;
  }


  engine =
    await import(
      "./engine.js?v=17"
    );


  await engine.init(
    viewer
  );


  return engine;
}


generateBtn.addEventListener(
  "click",
  async () => {

    if (!sourceFile) {
      return;
    }


    generateBtn.disabled =
      true;


    try {

      const currentEngine =
        await getEngine();


      await currentEngine.build(
        sourceFile,
        setStatus
      );


      placeholder.style.display =
        "none";


      currentEngine.start();

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
