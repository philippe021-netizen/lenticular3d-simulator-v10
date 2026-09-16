import {
  jointBilateralUpsample,
  normalizeDepthTensor,
  refineDepthEdgeAware
} from "./depthflow-v42-core.js";

let estimatorPromise = null;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function postProgress(requestId, stage, percent) {
  self.postMessage({ type: "progress", requestId, stage, percent });
}

function resizeGuideRgba(source, sourceWidth, sourceHeight, width, height) {
  const output = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const sourceY = (y + 0.5) * sourceHeight / height - 0.5;
    const y0 = clamp(Math.floor(sourceY), 0, sourceHeight - 1);
    const y1 = clamp(y0 + 1, 0, sourceHeight - 1);
    const mixY = clamp(sourceY - Math.floor(sourceY), 0, 1);
    for (let x = 0; x < width; x += 1) {
      const sourceX = (x + 0.5) * sourceWidth / width - 0.5;
      const x0 = clamp(Math.floor(sourceX), 0, sourceWidth - 1);
      const x1 = clamp(x0 + 1, 0, sourceWidth - 1);
      const mixX = clamp(sourceX - Math.floor(sourceX), 0, 1);
      const outputIndex = (y * width + x) * 4;
      const topLeft = (y0 * sourceWidth + x0) * 4;
      const topRight = (y0 * sourceWidth + x1) * 4;
      const bottomLeft = (y1 * sourceWidth + x0) * 4;
      const bottomRight = (y1 * sourceWidth + x1) * 4;
      for (let channel = 0; channel < 4; channel += 1) {
        const top = source[topLeft + channel] * (1 - mixX) + source[topRight + channel] * mixX;
        const bottom = source[bottomLeft + channel] * (1 - mixX) + source[bottomRight + channel] * mixX;
        output[outputIndex + channel] = Math.round(top * (1 - mixY) + bottom * mixY);
      }
    }
  }
  return output;
}

async function getEstimator(requestId) {
  if (!estimatorPromise) {
    postProgress(requestId, "Chargement de Depth Anything V2 dans le Worker…", 8);
    estimatorPromise = (async () => {
      const transformers = await import("https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0");
      transformers.env.allowLocalModels = false;
      return transformers.pipeline(
        "depth-estimation",
        "onnx-community/depth-anything-v2-small",
        {
          device: "wasm",
          dtype: "q8",
          progress_callback: progress => {
            const value = Number(progress?.progress);
            if (Number.isFinite(value)) {
              postProgress(requestId, "Chargement du modèle de profondeur…", Math.round(8 + value * 0.22));
            }
          }
        }
      );
    })();
  }
  try {
    return await estimatorPromise;
  } catch (error) {
    estimatorPromise = null;
    throw error;
  }
}

function refine(requestId, lowDepth, lowWidth, lowHeight, lowGuide, fullGuide, width, height) {
  postProgress(requestId, "Agrandissement guidé des contours…", 68);
  let refined = jointBilateralUpsample(
    lowDepth,
    lowWidth,
    lowHeight,
    lowGuide,
    fullGuide,
    width,
    height
  );
  postProgress(requestId, "Raffinement des visages et objets fins 1/2…", 82);
  refined = refineDepthEdgeAware(refined, fullGuide, width, height, 1);
  postProgress(requestId, "Raffinement des visages et objets fins 2/2…", 92);
  refined = refineDepthEdgeAware(refined, fullGuide, width, height, 1);
  return refined;
}

self.addEventListener("message", async event => {
  const { type, requestId, payload } = event.data ?? {};
  try {
    let refined;
    if (type === "estimate-and-refine") {
      const fullGuide = new Uint8ClampedArray(payload.fullGuideBuffer);
      const estimator = await getEstimator(requestId);
      postProgress(requestId, "Analyse de la profondeur générale…", 42);
      const result = await estimator(payload.imageUrl);
      const normalized = normalizeDepthTensor(result.predicted_depth ?? result.depth);
      postProgress(requestId, "Préparation du guide couleur…", 61);
      const lowGuide = resizeGuideRgba(
        fullGuide,
        payload.width,
        payload.height,
        normalized.width,
        normalized.height
      );
      refined = refine(
        requestId,
        normalized.data,
        normalized.width,
        normalized.height,
        lowGuide,
        fullGuide,
        payload.width,
        payload.height
      );
    } else if (type === "refine-only") {
      refined = refine(
        requestId,
        new Uint8ClampedArray(payload.lowDepthBuffer),
        payload.lowWidth,
        payload.lowHeight,
        new Uint8ClampedArray(payload.lowGuideBuffer),
        new Uint8ClampedArray(payload.fullGuideBuffer),
        payload.width,
        payload.height
      );
    } else {
      throw new Error("Commande Worker inconnue");
    }
    postProgress(requestId, "Finalisation de la carte 0–255…", 98);
    self.postMessage(
      { type: "result", requestId, refinedBuffer: refined.buffer },
      [refined.buffer]
    );
  } catch (error) {
    self.postMessage({
      type: "error",
      requestId,
      message: error?.message ?? String(error)
    });
  }
});
