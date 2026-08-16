import * as THREE from "https://esm.sh/three@0.169.0";

let scene;
let camera;
let renderer;
let viewer;

let subjectMesh = null;
let backgroundMesh = null;

let depthEstimator = null;

let subjectUniforms = null;

let animationFrame = 0;
let animationStart = 0;


/* =========================
   CHARGEMENT IMAGE
========================= */

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
          "Impossible de lire le sujet détouré."
        )
      );
    };

    image.src = url;
  });
}


/* =========================
   DEPTH ANYTHING
========================= */

async function getEstimator(setStatus) {

  if (depthEstimator) {
    return depthEstimator;
  }

  setStatus(
    "Chargement du moteur de profondeur…",
    40
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


/* =========================
   DEPTH MAP
========================= */

function percentile(values, amount) {

  const sorted =
    Array.from(values).sort(
      (a, b) => a - b
    );

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
  height
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
    i <
    rawDepth.width *
    rawDepth.height;
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


  /*
    On lisse légèrement la profondeur,
    pas la photographie.
  */

  context.filter =
    "blur(2px)";


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
      imageData.data[
        i * 4
      ];
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


/* =========================
   INITIALISATION THREE.JS
========================= */

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
      28,
      1,
      0.01,
      20
    );


  camera.position.set(
    0,
    0,
    5.6
  );


  renderer =
    new THREE.WebGLRenderer({
      antialias: true,
      alpha: false
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


/* =========================
   CONSTRUCTION V19
========================= */

export async function build(
  photoFile,
  subjectBlob,
  setStatus
) {

  const image =
    await fileToImage(
      photoFile
    );


  const subjectImage =
    await blobToImage(
      subjectBlob
    );


  const imageAspect =
    image.naturalWidth /
    image.naturalHeight;


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


  setStatus(
    "Analyse de la profondeur interne…",
    52
  );


  const estimator =
    await getEstimator(
      setStatus
    );


  const tempCanvas =
    document.createElement(
      "canvas"
    );


  tempCanvas.width =
    width;

  tempCanvas.height =
    height;


  tempCanvas
    .getContext("2d")
    .drawImage(
      image,
      0,
      0,
      width,
      height
    );


  const depthBlob =
    await new Promise(
      resolve =>
        tempCanvas.toBlob(
          resolve,
          "image/jpeg",
          0.9
        )
    );


  if (!depthBlob) {

    throw new Error(
      "Impossible de préparer l'analyse de profondeur."
    );
  }


  const depthURL =
    URL.createObjectURL(
      depthBlob
    );


  let depthResult;


  try {

    depthResult =
      await estimator(
        depthURL
      );
  }

  finally {

    URL.revokeObjectURL(
      depthURL
    );
  }


  setStatus(
    "Protection de la silhouette…",
    68
  );


  /*
    Nettoyage ancienne scène
  */

  if (subjectMesh) {

    scene.remove(
      subjectMesh
    );

    subjectMesh.geometry.dispose();

    subjectMesh.material.dispose();
  }


  if (backgroundMesh) {

    scene.remove(
      backgroundMesh
    );

    backgroundMesh.geometry.dispose();

    backgroundMesh.material.dispose();
  }


  /*
    Texture photo originale
  */

  const backgroundTexture =
    new THREE.Texture(
      image
    );


  backgroundTexture.needsUpdate =
    true;


  backgroundTexture.colorSpace =
    THREE.SRGBColorSpace;


  /*
    Texture sujet détouré
  */

  const subjectTexture =
    new THREE.Texture(
      subjectImage
    );


  subjectTexture.needsUpdate =
    true;


  subjectTexture.colorSpace =
    THREE.SRGBColorSpace;


  /*
    Depth texture
  */

  const depthTexture =
    new THREE.CanvasTexture(
      createDepthCanvas(
        depthResult.depth,
        width,
        height
      )
    );


  depthTexture.minFilter =
    THREE.LinearFilter;


  depthTexture.magFilter =
    THREE.LinearFilter;


  /*
    Dimensions scène
  */

  const planeHeight =
    2.72;


  const planeWidth =
    planeHeight *
    imageAspect;


  /*
    =========================
    FOND
    =========================

    La photo originale reste derrière.

    Elle bouge extrêmement peu.
  */

  const backgroundGeometry =
    new THREE.PlaneGeometry(
      planeWidth,
      planeHeight,
      1,
      1
    );


  const backgroundMaterial =
    new THREE.MeshBasicMaterial({
      map:
        backgroundTexture,

      side:
        THREE.DoubleSide
    });


  backgroundMesh =
    new THREE.Mesh(
      backgroundGeometry,
      backgroundMaterial
    );


  backgroundMesh.position.z =
    -0.12;


  scene.add(
    backgroundMesh
  );


  /*
    =========================
    SUJET
    =========================
  */

  subjectUniforms = {

    uImage: {
      value:
        subjectTexture
    },

    uDepth: {
      value:
        depthTexture
    },

    uView: {
      value:
        0
    },

    /*
      Relief interne volontairement modéré.
    */

    uDepthScale: {
      value:
        0.24
    },

    uParallax: {
      value:
        0.055
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

        uniform float uView;
        uniform float uDepthScale;
        uniform float uParallax;


        void main() {

          vUv = uv;


          /*
            Alpha du sujet détouré.
          */

          float alpha =
            texture2D(
              uImage,
              uv
            ).a;


          /*
            Profondeur locale.
          */

          float depth =
            texture2D(
              uDepth,
              uv
            ).r;


          vec3 p =
            position;


          /*
            Le relief est appliqué
            à l'intérieur du sujet.

            Aux zones transparentes,
            aucun déplacement utile.
          */

          float inside =
            smoothstep(
              0.15,
              0.85,
              alpha
            );


          /*
            Relief Z interne.

            Beaucoup moins agressif
            que V17/V18.
          */

          p.z +=

            (
              depth -
              0.5
            )

            *

            uDepthScale

            *

            inside;


          /*
            Micro-parallaxe interne.

            Elle dépend de la profondeur,
            mais reste très courte.
          */

          p.x +=

            uView

            *

            (
              depth -
              0.5
            )

            *

            uParallax

            *

            inside;


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


        void main() {

          vec4 color =
            texture2D(
              uImage,
              vUv
            );


          /*
            Les pixels hors sujet
            disparaissent réellement.
          */

          if (
            color.a < 0.03
          ) {

            discard;
          }


          gl_FragColor =
            color;
        }
      `
    });


  const subjectGeometry =
    new THREE.PlaneGeometry(
      planeWidth,
      planeHeight,
      220,
      180
    );


  subjectMesh =
    new THREE.Mesh(
      subjectGeometry,
      subjectMaterial
    );


  subjectMesh.position.z =
    0.04;


  scene.add(
    subjectMesh
  );


  /*
    Caméra totalement fixe en Z.
  */

  camera.position.set(
    0,
    0,
    5.6
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
    "Silhouette protégée. Relief interne prêt.",
    82
  );
}


/* =========================
   ANIMATION
========================= */

function setPose(value) {

  if (!subjectUniforms) {
    return;
  }


  /*
    Relief interne du sujet.
  */

  subjectUniforms.uView.value =
    value;


  /*
    Fond :
    mouvement minuscule.
  */

  if (backgroundMesh) {

    backgroundMesh.position.x =
      value * -0.006;
  }


  /*
    Sujet :
    petit déplacement global
    + parallaxe interne.

    Très inférieur aux premières versions.
  */

  if (subjectMesh) {

    subjectMesh.position.x =
      value * 0.014;
  }


  /*
    AUCUN zoom.
  */

  camera.position.x =
    value * 0.018;


  camera.position.y =
    0;


  camera.position.z =
    5.6;


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

        5600;


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
