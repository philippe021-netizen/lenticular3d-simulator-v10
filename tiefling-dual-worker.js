import * as ort from 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/ort.all.min.mjs';

let session = null;
let backend = 'wasm';
let currentModelUrl = null;

ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/';
ort.env.wasm.numThreads = Math.max(1, Math.min(4, (self.navigator?.hardwareConcurrency || 2) - 1));

const ua = self.navigator?.userAgent || '';
const isAppleMobile = /iPad|iPhone|iPod/i.test(ua) || (/Macintosh/i.test(ua) && (self.navigator?.maxTouchPoints || 0) > 1);

function preprocessImage(imageData, size) {
  if (!imageData?.data || !Number.isFinite(size) || size < 32) throw new Error('Entrée profondeur invalide');
  const expected = size * size * 4;
  if (imageData.data.length !== expected) throw new Error(`Image profondeur invalide (${imageData.data.length}/${expected})`);
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
  if (!tensor?.dims?.length || !tensor?.data) throw new Error('Sortie profondeur invalide');
  const dims = tensor.dims;
  const h = Number(dims[dims.length - 2]);
  const w = Number(dims[dims.length - 1]);
  const src = tensor.data;
  const count = w * h;
  if (!Number.isFinite(w) || !Number.isFinite(h) || w < 1 || h < 1 || src.length < count) {
    throw new Error(`Sortie Tiefling incohérente (${w}x${h}, ${src.length} valeurs)`);
  }
  let min = Infinity, max = -Infinity;
  for (let i = 0; i < count; i++) {
    const v = Number(src[i]);
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const span = Math.max(1e-8, max - min);
  const out = new Uint8ClampedArray(count * 4);
  for (let i = 0; i < count; i++) {
    const v = Math.max(0, Math.min(255, Math.round(((Number(src[i]) - min) / span) * 255)));
    const j = i * 4;
    out[j] = out[j + 1] = out[j + 2] = v;
    out[j + 3] = 255;
  }
  return { width: w, height: h, data: out.buffer };
}

async function makeSession(modelUrl, providers) {
  const s = await ort.InferenceSession.create(modelUrl, { executionProviders: providers });
  currentModelUrl = modelUrl;
  return s;
}

async function ensureSession(modelUrl) {
  if (session && currentModelUrl === modelUrl) return;
  session = null;
  currentModelUrl = null;

  // WebGPU on iPad/Safari currently triggers intermittent ArrayBuffer range errors
  // with this dynamic quantized model. Prefer WASM there for reliability.
  if (!isAppleMobile && typeof navigator !== 'undefined' && !!navigator.gpu) {
    try {
      session = await makeSession(modelUrl, ['webgpu', 'wasm']);
      backend = 'webgpu';
      return;
    } catch (e) {
      console.warn('WebGPU unavailable for model, fallback WASM', e);
    }
  }

  session = await makeSession(modelUrl, ['wasm']);
  backend = 'wasm';
}

async function runInference(imageData, size, modelUrl) {
  await ensureSession(modelUrl);
  const input = new ort.Tensor('float32', preprocessImage(imageData, size), [1, 3, size, size]);
  const inputName = session.inputNames?.[0] || 'image';
  try {
    return await session.run({ [inputName]: input });
  } catch (err) {
    // One retry in WASM if a non-WASM backend fails at runtime.
    if (backend !== 'wasm') {
      console.warn('Tiefling WebGPU inference failed, retrying in WASM', err);
      try { await session?.release?.(); } catch {}
      session = await makeSession(modelUrl, ['wasm']);
      backend = 'wasm';
      return await session.run({ [inputName]: input });
    }
    throw err;
  }
}

self.onmessage = async (ev) => {
  const { imageData, size, modelUrl } = ev.data || {};
  try {
    const result = await runInference(imageData, Number(size), modelUrl);
    const outputName = session.outputNames?.[0] || Object.keys(result)[0];
    const processed = postprocess(result[outputName]);
    self.postMessage({ ok: true, backend, ...processed }, [processed.data]);
  } catch (err) {
    self.postMessage({ ok: false, error: String(err?.message || err) });
  }
};
