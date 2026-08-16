import * as THREE from "https://esm.sh/three@0.169.0";

let scene;
let camera;
let renderer;
let viewer;

let backgroundMesh = null;
let subjectMesh = null;

let depthEstimator = null;

let animationFrame = 0;
let animationStart = 0;

let cameraRadius = 5.8;


/* =========================================
   CHARGEMENT IMAGES
========================================= */

function fileToImage(file) {
  return new Promise((resolve, reject) => {

    const url = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };

    image.onerror = () => {
      URL.revokeObjectURL(url);

      reject(
        new Error(
          "Impossible de lire la photo."
        )
      );
    };

    image.src = url;
  });
}


function blobToImage(blob) {
  return new Promise((resolve, reject) => {

    const url = URL.createObjectURL(blob);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };

    image.onerror = () => {
      URL.revokeObjectURL(url);

      reject(
        new Error(
          "Image générée illisible."
        )
      );
    };

    image.src = url;
  });
}


/* =========================================
   DEPTH ANYTHING
========================================= */

async function getEstimator(setStatus) {

  if (depthEstimator) {
    return depthEstimator;
  }

  setStatus(
    "Chargement du moteur de profondeur…",
    66
  );

  const {
    pipeline,
    env
  } = await import(
    "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/+esm"
  );

  env.allowLocalModels = false;

  depthEstimator = await pipeline(
    "depth-estimation",
    "onnx-community/depth-anything-v2-small",
    {
      dtype: "q4"
    }
  );

  return depthEstimator;
}


/* =========================================
   OUTILS DEPTH
========================================= */

function percentile(values, amount) {

  const sorted =
    Array.from(values)
      .sort((a, b) => a - b);

  const index =
    Math.max(
      0,
      Math.min(
        sorted.length - 1,
        Math.floor(
          (sorted.length - 1) *
          amount
        )
      )
    );

  return sorted[index];
}


function createDepthCanvas(
  rawDepth,
  width,
  height,
  softness = 2
) {

  const source =
    document.createElement("canvas");

  source.width =
    rawDepth.width;

  source.height =
    rawDepth.height;

  const sourceContext =
    source.getContext("2d");

  const sourceData =
    sourceContext.createImageData(
      rawDepth.width,
      rawDepth.height
    );

  for (
    let i = 0;
    i < rawDepth.width * rawDepth.height;
    i++
  ) {

    const value =
      rawDepth.data[i];

    sourceData.data[i * 4] =
      value;

    sourceData.data[i * 4 + 1] =
      value;

    sourceData.data[i * 4 + 2] =
      value;

    sourceData.data[i * 4 + 3] =
      255;
  }

  sourceContext.putImageData(
    sourceData,
    0,
    0
  );

  const canvas =
    document.createElement("canvas");

  canvas.width =
    width;

  canvas.height =
    height;

  const context =
    canvas.getContext("2d");

  context.filter =
    `blur(${softness}px)`;

  context.drawImage(
    source,
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

  const values =
    new Uint8Array(
      width * height
    );

  for (
    let i = 0;
    i < values.length;
    i++
  ) {

    values[i] =
      imageData.data[i * 4];
  }

  let low =
    percentile(
      values,
      0.04
    );

  let high =
    percentile(
      values,
      0.96
    );

  if (high <= low) {
    low = 0;
    high = 255;
  }

  for (
    let i = 0;
    i < values.length;
    i++
  ) {

    let depth =
      (
        values[i] -
        low
      ) /
      Math.max(
        1,
        high - low
      );

    depth =
      Math.max(
        0,
        Math.min(
          1,
          depth
        )
      );

    depth =
      Math.pow(
        depth,
        1.08
      );

    const value =
      Math.round(
        depth * 255
      );

    imageData.data[i * 4] =
      value;

    imageData.data[i * 4 + 1] =
      value;

    imageData.data[i * 4 + 2] =
      value;

    imageData.data[i * 4 + 3] =
      255;
  }

  context.putImageData(
    imageData,
    0,
    0
  );

  return canvas;
}


/* =========================================
   CALCUL DEPTH
========================================= */

async function estimateImageDepth(
  image,
  estimator
) {

  const maxSide = 720;

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
    document.createElement("canvas");

  canvas.width =
    width;

  canvas.height =
    height;

  canvas
    .getContext("2d")
    .drawImage(
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
          0.9
        )
    );

  if (!blob) {
    throw new Error(
      "Impossible de préparer l’analyse de profondeur."
    );
  }

  const url =
    URL.createObjectURL(blob);

  try {

    const result =
      await estimator(url);

    return {
      result,
      width,
      height
    };
  }

  finally {

    URL.revokeObjectURL(url);
  }
}


/* =========================================
   INITIALISATION THREE
========================================= */

export async function init(
  targetViewer
) {

  if (renderer) {
    return;
  }

  viewer =
    targetViewer;

  scene =
    new THREE.Scene();

  scene.background =
    new THREE.Color(
      0x02050a
    );

  camera =
    new THREE.PerspectiveCamera(
      27,
      1,
      0.01,
      30
    );

  camera.position.set(
    0,
    0,
    cameraRadius
  );

  renderer =
    new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      preserveDrawingBuffer: true
    });

  renderer.setPixelRatio(
    Math.min(
      window.devicePixelRatio,
      2
    )
  );

  renderer.outputColorSpace =
    THREE.SRGBColorSpace;

  viewer.appendChild(
    renderer.domElement
  );

  resize();

  window.addEventListener(
    "resize",
    resize
  );
}


function resize() {

  if (
    !renderer ||
    !viewer
  ) {
    return;
  }

  const width =
    viewer.clientWidth ||
    760;

  const height =
    viewer.clientHeight ||
    500;

  renderer.setSize(
    width,
    height,
    false
  );

  camera.aspect =
    width / height;

  camera.updateProjectionMatrix();
}


/* =========================================
   CONSTRUCTION SCÈNE
========================================= */

export async function build(
  photoFile,
  cleanBackgroundBlob,
  subjectBlob,
  setStatus
) {

  const [
    photo,
    backgroundImage,
    subjectImage
  ] =
    await Promise.all([

      fileToImage(
        photoFile
      ),

      blobToImage(
        cleanBackgroundBlob
      ),

      blobToImage(
        subjectBlob
      )
    ]);

  const imageAspect =
    photo.naturalWidth /
    photo.naturalHeight;

  const planeHeight =
    2.75;

  const planeWidth =
    planeHeight *
    imageAspect;

  const estimator =
    await getEstimator(
      setStatus
    );

  setStatus(
    "Analyse du relief du décor…",
    69
  );

  const backgroundDepth =
    await estimateImageDepth(
      backgroundImage,
      estimator
    );

  setStatus(
    "Analyse du relief du premier plan…",
    75
  );

  const subjectDepth =
    await estimateImageDepth(
      photo,
      estimator
    );


  if (backgroundMesh) {

    scene.remove(
      backgroundMesh
    );

    backgroundMesh
      .geometry
      .dispose();

    backgroundMesh
      .material
      .dispose();
  }


  if (subjectMesh) {

    scene.remove(
      subjectMesh
    );

    subjectMesh
      .geometry
      .dispose();

    subjectMesh
      .material
      .dispose();
  }


  /* =====================================
     FOND
  ===================================== */

  const backgroundTexture =
    new THREE.Texture(
      backgroundImage
    );

  backgroundTexture.needsUpdate =
    true;

  backgroundTexture.colorSpace =
    THREE.SRGBColorSpace;


  const backgroundDepthTexture =
    new THREE.CanvasTexture(
      createDepthCanvas(
        backgroundDepth.result.depth,
        backgroundDepth.width,
        backgroundDepth.height,
        3
      )
    );

  backgroundDepthTexture.minFilter =
    THREE.LinearFilter;

  backgroundDepthTexture.magFilter =
    THREE.LinearFilter;


  const backgroundUniforms = {

    uImage: {
      value:
        backgroundTexture
    },

    uDepth: {
      value:
        backgroundDepthTexture
    },

    uDepthScale: {
      value:
        0.28
    }
  };


  const backgroundMaterial =
    new THREE.ShaderMaterial({

      uniforms:
        backgroundUniforms,

      side:
        THREE.DoubleSide,

      vertexShader: `

        varying vec2 vUv;

        uniform sampler2D uDepth;
        uniform float uDepthScale;


        void main() {

          vUv = uv;

          float d =
            texture2D(
              uDepth,
              uv
            ).r;

          vec3 p =
            position;

          p.z +=
            (
              d - 0.5
            )
            *
            uDepthScale;

          gl_Position =
            projectionMatrix
            *
            modelViewMatrix
            *
            vec4(
              p,
              1.0
            );
        }
      `,

      fragmentShader: `

        precision highp float;

        varying vec2 vUv;

        uniform sampler2D uImage;


        vec3 linearToSRGB(
          vec3 value
        ) {

          vec3 low =
            value * 12.92;

          vec3 high =
            1.055 *
            pow(
              value,
              vec3(
                1.0 / 2.4
              )
            )
            -
            0.055;

          return mix(
            high,
            low,
            lessThanEqual(
              value,
              vec3(
                0.0031308
              )
            )
          );
        }


        void main() {

          vec4 color =
            texture2D(
              uImage,
              vUv
            );

          color.rgb =
            linearToSRGB(
              color.rgb
            );

          gl_FragColor =
            color;
        }
      `
    });


  const backgroundGeometry =
    new THREE.PlaneGeometry(
      planeWidth,
      planeHeight,
      180,
      140
    );


  backgroundMesh =
    new THREE.Mesh(
      backgroundGeometry,
      backgroundMaterial
    );


  backgroundMesh.position.z =
    -0.42;


  scene.add(
    backgroundMesh
  );


  /* =====================================
     SUJET + PROTECTION V25
  ===================================== */

  const subjectTexture =
    new THREE.Texture(
      subjectImage
    );

  subjectTexture.needsUpdate =
    true;

  subjectTexture.colorSpace =
    THREE.SRGBColorSpace;


  const subjectDepthTexture =
    new THREE.CanvasTexture(
      createDepthCanvas(
        subjectDepth.result.depth,
        subjectDepth.width,
        subjectDepth.height,
        2
      )
    );


  subjectDepthTexture.minFilter =
    THREE.LinearFilter;

  subjectDepthTexture.magFilter =
    THREE.LinearFilter;


  const subjectUniforms = {

    uImage: {
      value:
        subjectTexture
    },

    uDepth: {
      value:
        subjectDepthTexture
    },

    uTexel: {
      value:
        new THREE.Vector2(
          1 / subjectDepth.width,
          1 / subjectDepth.height
        )
    },

    uDepthScale: {
      value:
        0.48
    }
  };


  const subjectMaterial =
    new THREE.ShaderMaterial({

      uniforms:
        subjectUniforms,

      transparent:
        true,

      depthWrite:
        true,

      side:
        THREE.DoubleSide,

      vertexShader: `

        varying vec2 vUv;

        uniform sampler2D uImage;
        uniform sampler2D uDepth;
        uniform vec2 uTexel;
        uniform float uDepthScale;


        void main() {

          vUv = uv;


          float alphaCenter =
            texture2D(
              uImage,
              uv
            ).a;


          /*
            Protection à 3 px.
          */

          float alphaL3 =
            texture2D(
              uImage,
              uv -
              vec2(
                uTexel.x * 3.0,
                0.0
              )
            ).a;


          float alphaR3 =
            texture2D(
              uImage,
              uv +
              vec2(
                uTexel.x * 3.0,
                0.0
              )
            ).a;


          float alphaU3 =
            texture2D(
              uImage,
              uv +
              vec2(
                0.0,
                uTexel.y * 3.0
              )
            ).a;


          float alphaD3 =
            texture2D(
              uImage,
              uv -
              vec2(
                0.0,
                uTexel.y * 3.0
              )
            ).a;


          /*
            Protection renforcée à 6 px.
          */

          float alphaL6 =
            texture2D(
              uImage,
              uv -
              vec2(
                uTexel.x * 6.0,
                0.0
              )
            ).a;


          float alphaR6 =
            texture2D(
              uImage,
              uv +
              vec2(
                uTexel.x * 6.0,
                0.0
              )
            ).a;


          float alphaU6 =
            texture2D(
              uImage,
              uv +
              vec2(
                0.0,
                uTexel.y * 6.0
              )
            ).a;


          float alphaD6 =
            texture2D(
              uImage,
              uv -
              vec2(
                0.0,
                uTexel.y * 6.0
              )
            ).a;


          /*
            Diagonales à 6 px.
            Important pour cheveux,
            casquettes, oreilles.
          */

          float alphaUL =
            texture2D(
              uImage,
              uv +
              vec2(
                -uTexel.x * 4.5,
                 uTexel.y * 4.5
              )
            ).a;


          float alphaUR =
            texture2D(
              uImage,
              uv +
              vec2(
                 uTexel.x * 4.5,
                 uTexel.y * 4.5
              )
            ).a;


          float alphaDL =
            texture2D(
              uImage,
              uv +
              vec2(
                -uTexel.x * 4.5,
                -uTexel.y * 4.5
              )
            ).a;


          float alphaDR =
            texture2D(
              uImage,
              uv +
              vec2(
                 uTexel.x * 4.5,
                -uTexel.y * 4.5
              )
            ).a;


          float safeNear =
            min(
              alphaCenter,
              min(
                min(
                  alphaL3,
                  alphaR3
                ),
                min(
                  alphaU3,
                  alphaD3
                )
              )
            );


          float safeFar =
            min(
              alphaCenter,
              min(
                min(
                  alphaL6,
                  alphaR6
                ),
                min(
                  alphaU6,
                  alphaD6
                )
              )
            );


          float safeDiagonal =
            min(
              min(
                alphaUL,
                alphaUR
              ),
              min(
                alphaDL,
                alphaDR
              )
            );


          /*
            Zone intérieure réellement sûre.
          */

          float safeAlpha =
            min(
              safeNear,
              min(
                safeFar,
                safeDiagonal
              )
            );


          /*
            Transition plus progressive
            que dans V24.

            0 près des bords
            → 1 bien à l'intérieur.
          */

          float safeInside =
            smoothstep(
              0.62,
              0.985,
              safeAlpha
            );


          /*
            Petit deuxième facteur
            pour éviter une cassure brutale.
          */

          float softInside =
            smoothstep(
              0.30,
              0.90,
              safeNear
            );


          /*
            Combinaison :
            les 3 premiers pixels ont
            quasiment zéro relief,
            les 3 suivants montent doucement.
          */

          float edgeProtection =
            safeInside *
            softInside;


          float depth =
            texture2D(
              uDepth,
              uv
            ).r;


          vec3 p =
            position;


          p.z +=
            (
              depth -
              0.5
            )
            *
            uDepthScale
            *
            edgeProtection;


          gl_Position =
            projectionMatrix
            *
            modelViewMatrix
            *
            vec4(
              p,
              1.0
            );
        }
      `,

      fragmentShader: `

        precision highp float;

        varying vec2 vUv;

        uniform sampler2D uImage;


        vec3 linearToSRGB(
          vec3 value
        ) {

          vec3 low =
            value *
            12.92;

          vec3 high =
            1.055 *
            pow(
              value,
              vec3(
                1.0 / 2.4
              )
            )
            -
            0.055;

          return mix(
            high,
            low,
            lessThanEqual(
              value,
              vec3(
                0.0031308
              )
            )
          );
        }


        void main() {

          vec4 color =
            texture2D(
              uImage,
              vUv
            );


          if (
            color.a <
            0.025
          ) {

            discard;
          }


          color.rgb =
            linearToSRGB(
              color.rgb
            );


          gl_FragColor =
            color;
        }
      `
    });


  const subjectGeometry =
    new THREE.PlaneGeometry(
      planeWidth,
      planeHeight,
      240,
      190
    );


  subjectMesh =
    new THREE.Mesh(
      subjectGeometry,
      subjectMaterial
    );


  subjectMesh.position.z =
    0.18;


  scene.add(
    subjectMesh
  );


  backgroundMesh.position.x =
    0;

  subjectMesh.position.x =
    0;

  backgroundMesh.rotation.y =
    0;

  subjectMesh.rotation.y =
    0;


  cameraRadius =
    5.8;


  camera.position.set(
    0,
    0,
    cameraRadius
  );


  camera.lookAt(
    0,
    0,
    0
  );


  resize();


  renderer.render(
    scene,
    camera
  );


  setStatus(
    "V25 prête : contour tête/cheveux renforcé.",
    86
  );
}


/* =========================================
   ANGLE CAMÉRA
========================================= */

function setAngleDegrees(
  degrees
) {

  if (
    !backgroundMesh ||
    !subjectMesh
  ) {
    return;
  }


  const angle =
    THREE.MathUtils.degToRad(
      degrees
    );


  camera.position.x =
    Math.sin(
      angle
    ) *
    cameraRadius;


  camera.position.y =
    0;


  camera.position.z =
    Math.cos(
      angle
    ) *
    cameraRadius;


  camera.lookAt(
    0,
    0,
    0
  );


  renderer.render(
    scene,
    camera
  );
}


/* =========================================
   ANIMATION ±12°
========================================= */

function setPose(value) {

  const degrees =
    value *
    12;

  setAngleDegrees(
    degrees
  );
}


export function start() {

  if (animationFrame) {

    cancelAnimationFrame(
      animationFrame
    );
  }


  animationStart =
    performance.now();


  const animate =
    currentTime => {

      const elapsed =
        (
          currentTime -
          animationStart
        )
        /
        6000;


      const position =
        Math.sin(
          elapsed *
          Math.PI *
          2
        );


      setPose(
        position
      );


      animationFrame =
        requestAnimationFrame(
          animate
        );
    };


  animationFrame =
    requestAnimationFrame(
      animate
    );
}


/* =========================================
   ARRÊT ANIMATION
========================================= */

function stopAnimation() {

  if (animationFrame) {

    cancelAnimationFrame(
      animationFrame
    );

    animationFrame =
      0;
  }
}


/* =========================================
   CANVAS → PNG
========================================= */

function canvasToBlob() {

  return new Promise(
    (resolve, reject) => {

      renderer.domElement.toBlob(
        blob => {

          if (blob) {

            resolve(blob);

          } else {

            reject(
              new Error(
                "Impossible de créer l’image PNG."
              )
            );
          }
        },
        "image/png"
      );
    }
  );
}


/* =========================================
   EXPORT 9 VUES
========================================= */

export async function exportProductionViews(
  onProgress = null
) {

  if (
    !renderer ||
    !backgroundMesh ||
    !subjectMesh
  ) {

    throw new Error(
      "Créez d’abord la simulation 3D."
    );
  }


  const angles = [
    -12,
    -9,
    -6,
    -3,
    0,
    3,
    6,
    9,
    12
  ];


  stopAnimation();


  const views =
    [];


  for (
    let i = 0;
    i < angles.length;
    i++
  ) {

    const angle =
      angles[i];


    setAngleDegrees(
      angle
    );


    await new Promise(
      resolve =>
        requestAnimationFrame(
          () =>
            requestAnimationFrame(
              resolve
            )
        )
    );


    renderer.render(
      scene,
      camera
    );


    const blob =
      await canvasToBlob();


    const number =
      String(
        i + 1
      ).padStart(
        2,
        "0"
      );


    const angleName =
      angle < 0
        ? `moins-${Math.abs(angle)}`
        : angle > 0
          ? `plus-${angle}`
          : "centre";


    views.push({

      index:
        i + 1,

      angle,

      filename:
        `vue-${number}-${angleName}.png`,

      blob
    });


    if (onProgress) {

      onProgress(
        i + 1,
        angles.length,
        angle
      );
    }
  }


  setAngleDegrees(
    0
  );


  start();


  return views;
}


/* =========================================
   CAPTURE ANGLE MANUEL
========================================= */

export async function captureAngle(
  degrees
) {

  stopAnimation();


  setAngleDegrees(
    degrees
  );


  await new Promise(
    resolve =>
      requestAnimationFrame(
        () =>
          requestAnimationFrame(
            resolve
          )
      )
  );


  renderer.render(
    scene,
    camera
  );


  const blob =
    await canvasToBlob();


  setAngleDegrees(
    0
  );


  start();


  return blob;
}
