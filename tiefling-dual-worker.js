import * as ort from 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/ort.all.min.mjs';

let session = null;
let backend = 'wasm';

ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/';
ort.env.wasm.numThreads = Math.max(1, Math.min(4, (self.navigator?.hardwareConcurrency || 2) - 1));

function preprocessImage(imageData, size) {
  const out = new Float32Array(size * size * 3);
  const d = imageData.data;
  const plane = size * size;
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    out[p] = d[i] / 255;
    out[plane + p] = d[i + 1] / 255;
    out[plane * 2 + p] = d[i + 2] / 255;
  }
  return out;
}

function postprocess(tensor) {
  const dims = tensor.dims;
  const h = dims[dims.length - 2];
  const w = dims[dims.length - 1];
  const src = tensor.data;
  let min = Infinity, max = -Infinity;
  for (let i = 0; i < src.length; i++) {
    const v = Number(src[i]);
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const span = Math.max(1e-8, max - min);
  const out = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const v = Math.max(0, Math.min(255, Math.round(((Number(src[i]) - min) / span) * 255)));
    const j = i * 4;
    out[j] = out[j + 1] = out[j + 2] = v;
    out[j + 3] = 255;
  }
  return { width: w, height: h, data: out.buffer };
}

async function ensureSession(modelUrl) {
  if (session) return;
  const webgpu = typeof navigator !== 'undefined' && !!navigator.gpu;
  if (webgpu) {
    try {
      session = await ort.InferenceSession.create(modelUrl, { executionProviders: ['webgpu', 'wasm'] });
      backend = 'webgpu';
      return;
    } catch (e) {
      console.warn('WebGPU unavailable for model, fallback WASM', e);
    }
  }
  session = await ort.InferenceSession.create(modelUrl, { executionProviders: ['wasm'] });
  backend = 'wasm';
}

self.onmessage = async (ev) => {
  const { imageData, size, modelUrl } = ev.data || {};
  try {
    await ensureSession(modelUrl);
    const input = new ort.Tensor('float32', preprocessImage(imageData, size), [1, 3, size, size]);
    const inputName = session.inputNames?.[0] || 'image';
    const result = await session.run({ [inputName]: input });
    const outputName = session.outputNames?.[0] || Object.keys(result)[0];
    const processed = postprocess(result[outputName]);
    self.postMessage({ ok: true, backend, ...processed }, [processed.data]);
  } catch (err) {
    self.postMessage({ ok: false, error: String(err?.message || err) });
  }
};
