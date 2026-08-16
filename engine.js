import * as THREE from "https://esm.sh/three@0.169.0";

let scene;
let camera;
let renderer;
let viewer;
let mesh;

let depthEstimator = null;
let uniforms = null;

let imageAspect = 1.5;

let animationFrame = 0;
let animationStart = 0;


function fileToImage(file) {

  return new Promise(
    (resolve, reject) => {

      const url =
        URL.createObjectURL(file);

      const image =
        new Image();


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
    }
  );
}



async function getEstimator(
  setStatus
) {

  if (depthEstimator) {
    return depthEstimator;
  }


  setStatus(
    "Chargement du moteur de profondeur…",
    10
  );


  const {
    pipeline,
    env
  } =
    await import(
      "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/+esm"
    );


  env.allowLocalModels =
    false;


  depthEstimator =
    await pipeline(
      "depth-estimation",
      "onnx-community/depth-anything-v2-small",
      {
        dtype: "q4"
      }
    );


  return depthEstimator;
}



function percentile(
  values,
  amount
) {

  const sorted =
    Array.from(values)
      .sort(
        (a, b) =>
          a - b
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
    document.createElement(
      "canvas"
    );


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


    sourceData.data[
      i * 4
    ] = value;


    sourceData.data[
      i * 4 + 1
    ] = value;


    sourceData.data[
      i * 4 + 2
    ] = value;


    sourceData.data[
      i * 4 + 3
    ] = 255;
  }


  sourceContext.putImageData(
    sourceData,
    0,
    0
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


  context.filter =
    "blur(2.5px)";


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
      width *
      height
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



  function average(
    x0,
    y0,
    x1,
    y1
  ) {

    let sum = 0;
    let count = 0;


    for (
      let y =
        Math.floor(y0);

      y <
      Math.floor(y1);

      y += 7
    ) {

      for (
        let x =
          Math.floor(x0);

        x <
        Math.floor(x1);

        x += 7
      ) {

        sum +=
          values[
            y *
            width +
            x
          ];


        count++;
      }
    }


    return (
      sum /
      Math.max(
        1,
        count
      )
    );
  }



  const center =
    average(
      width * 0.25,
      height * 0.12,
      width * 0.75,
      height * 0.90
    );


  const border =
    (
      average(
        0,
        0,
        width,
        height * 0.12
      ) +

      average(
        0,
        height * 0.88,
        width,
        height
      ) +

      average(
        0,
        0,
        width * 0.12,
        height
      ) +

      average(
        width * 0.88,
        0,
        width,
        height
      )
    ) / 4;


  const invert =
    center < border;



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


    if (invert) {

      depth =
        1 - depth;
    }


    depth =
      Math.pow(
        depth,
        1.1
      );


    const value =
      Math.round(
        depth * 255
      );


    imageData.data[
      i * 4
    ] = value;


    imageData.data[
      i * 4 + 1
    ] = value;


    imageData.data[
      i * 4 + 2
    ] = value;


    imageData.data[
      i * 4 + 3
    ] = 255;
  }


  context.putImageData(
    imageData,
    0,
    0
  );


  return canvas;
}



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
    4.8
  );


  renderer =
    new THREE.WebGLRenderer({
      antialias: true,
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
    width /
    height;


  camera.updateProjectionMatrix();
}



export async function build(
  file,
  setStatus
) {

  setStatus(
    "1/3 Lecture de la photo…",
    8
  );


  const image =
    await fileToImage(
      file
    );


  imageAspect =
    image.naturalWidth /
    image.naturalHeight;



  setStatus(
    "2/3 Estimation de profondeur…",
    25
  );


  const estimator =
    await getEstimator(
      setStatus
    );


  const maxSide =
    720;


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


  const temporaryCanvas =
    document.createElement(
      "canvas"
    );


  temporaryCanvas.width =
    width;

  temporaryCanvas.height =
    height;


  temporaryCanvas
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
        temporaryCanvas.toBlob(
          resolve,
          "image/jpeg",
          0.9
        )
    );


  const url =
    URL.createObjectURL(
      blob
    );


  let result;


  try {

    result =
      await estimator(
        url
      );
  }

  finally {

    URL.revokeObjectURL(
      url
    );
  }



  setStatus(
    "3/3 Construction de la scène 2.5D…",
    72
  );


  if (mesh) {

    scene.remove(mesh);

    mesh.geometry.dispose();

    mesh.material.dispose();
  }



  const imageTexture =
    new THREE.Texture(
      image
    );


  imageTexture.needsUpdate =
    true;


  imageTexture.colorSpace =
    THREE.SRGBColorSpace;



  const depthTexture =
    new THREE.CanvasTexture(
      createDepthCanvas(
        result.depth,
        width,
        height
      )
    );


  depthTexture.minFilter =
    THREE.LinearFilter;


  depthTexture.magFilter =
    THREE.LinearFilter;



  uniforms = {

    uImage: {
      value:
        imageTexture
    },

    uDepth: {
      value:
        depthTexture
    },

    uView: {
      value:
        0
    },

    uDepthScale: {
      value:
        0.55
    },

    uRelief: {
      value:
        0.12
    }
  };



  const material =
    new THREE.ShaderMaterial({

      uniforms,

      vertexShader: `

        varying vec2 vUv;

        uniform sampler2D uDepth;
        uniform float uView;
        uniform float uDepthScale;
        uniform float uRelief;


        void main() {

          vUv = uv;


          float depth =
            texture2D(
              uDepth,
              uv
            ).r;


          vec3 position3D =
            position;


          position3D.z +=
            (
              depth -
              0.5
            ) *
            uDepthScale;


          position3D.x +=
            uView *
            (
              depth -
              0.45
            ) *
            uRelief;


          gl_Position =
            projectionMatrix *
            modelViewMatrix *
            vec4(
              position3D,
              1.0
            );
        }
      `,

      fragmentShader: `

        precision highp float;

        varying vec2 vUv;

        uniform sampler2D uImage;


        void main() {

          gl_FragColor =
            texture2D(
              uImage,
              vUv
            );
        }
      `,

      side:
        THREE.DoubleSide
    });



  const planeHeight =
    2.6;


  const planeWidth =
    planeHeight *
    imageAspect;



  const geometry =
    new THREE.PlaneGeometry(
      planeWidth,
      planeHeight,
      220,
      180
    );



  mesh =
    new THREE.Mesh(
      geometry,
      material
    );


  scene.add(
    mesh
  );



  const verticalFov =
    THREE.MathUtils.degToRad(
      camera.fov
    );


  const cameraDistance =
    (
      planeHeight / 2
    ) /
    Math.tan(
      verticalFov / 2
    );


  camera.position.set(
    0,
    0,
    cameraDistance *
    1.15
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
    "Aperçu 2.5D prêt : le changement de point de vue dépend maintenant de la profondeur.",
    100
  );
}



function setPose(
  value
) {

  if (!uniforms) {
    return;
  }


  uniforms.uView.value =
    value;


  const distance =
    camera.position.length();


  const angle =
    value *
    0.045;


  camera.position.x =
    Math.sin(
      angle
    ) *
    distance *
    0.35;


  camera.position.z =
    Math.cos(
      angle
    ) *
    distance;


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
        ) /
        5200;


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
