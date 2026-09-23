import {
  jointBilateralUpsample,
  refineDepthEdgeAware
} from "./depthflow-v42-core.js";
import * as ort from "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.30.0/dist/ort.min.mjs";

ort.env.wasm.wasmPaths = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.30.0/dist/";
ort.env.wasm.numThreads = 1;

let sessionPromise = null;
const MODEL_W = 256;
const MODEL_H = 256;
const MODEL_URL = "./zipdepth_base_npu_256.onnx";
const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));

function postProgress(requestId, stage, percent) {
  self.postMessage({ type:"progress", requestId, stage, percent, provider:"zipdepth" });
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
      const oi = (y * width + x) * 4;
      const tl = (y0 * sourceWidth + x0) * 4;
      const tr = (y0 * sourceWidth + x1) * 4;
      const bl = (y1 * sourceWidth + x0) * 4;
      const br = (y1 * sourceWidth + x1) * 4;
      for (let c = 0; c < 4; c += 1) {
        const top = source[tl+c] * (1-mixX) + source[tr+c] * mixX;
        const bottom = source[bl+c] * (1-mixX) + source[br+c] * mixX;
        output[oi+c] = Math.round(top * (1-mixY) + bottom * mixY);
      }
    }
  }
  return output;
}

function buildLetterboxedTensor(fullGuide, sourceWidth, sourceHeight) {
  const scale = Math.min(MODEL_W/sourceWidth, MODEL_H/sourceHeight);
  const contentW = Math.max(1, Math.round(sourceWidth * scale));
  const contentH = Math.max(1, Math.round(sourceHeight * scale));
  const offsetX = Math.floor((MODEL_W-contentW)/2);
  const offsetY = Math.floor((MODEL_H-contentH)/2);
  const lowGuide = resizeGuideRgba(fullGuide,sourceWidth,sourceHeight,contentW,contentH);
  const chw = new Float32Array(3*MODEL_W*MODEL_H);
  const plane = MODEL_W*MODEL_H;
  for(let y=0;y<contentH;y++) for(let x=0;x<contentW;x++){
    const si=(y*contentW+x)*4, mi=(y+offsetY)*MODEL_W+(x+offsetX);
    chw[mi]=lowGuide[si]/255;
    chw[plane+mi]=lowGuide[si+1]/255;
    chw[2*plane+mi]=lowGuide[si+2]/255;
  }
  return {tensor:new ort.Tensor("float32",chw,[1,3,MODEL_H,MODEL_W]),lowGuide,contentW,contentH,offsetX,offsetY};
}

async function getSession(requestId){
  if(!sessionPromise){
    postProgress(requestId,"Chargement ZipDepth ONNX…",8);
    sessionPromise=ort.InferenceSession.create(MODEL_URL,{executionProviders:["wasm"],executionMode:"sequential",enableCpuMemArena:false,enableMemPattern:false,graphOptimizationLevel:"basic",intraOpNumThreads:1,interOpNumThreads:1});
  }
  try{return await sessionPromise;}catch(error){sessionPromise=null;throw error;}
}

function cropOutput(tensor, prep){
  const dims=tensor.dims||[];
  const oh=dims[dims.length-2]||MODEL_H, ow=dims[dims.length-1]||MODEL_W;
  const sx=ow/MODEL_W, sy=oh/MODEL_H;
  const x0=Math.round(prep.offsetX*sx), y0=Math.round(prep.offsetY*sy);
  const cw=Math.max(1,Math.round(prep.contentW*sx)), ch=Math.max(1,Math.round(prep.contentH*sy));
  const raw=tensor.data, crop=new Float32Array(cw*ch);
  for(let y=0;y<ch;y++) for(let x=0;x<cw;x++) crop[y*cw+x]=raw[(y+y0)*ow+(x+x0)];
  return {data:crop,width:cw,height:ch};
}

function robustNormalizeNear255(raw){
  const finite=[];
  for(let i=0;i<raw.length;i++) if(Number.isFinite(raw[i])) finite.push(raw[i]);
  if(!finite.length) throw new Error("ZipDepth a retourné une carte vide.");
  finite.sort((a,b)=>a-b);
  const q=p=>finite[Math.min(finite.length-1,Math.max(0,Math.floor((finite.length-1)*p)))];
  const lo=q(0.02), hi=q(0.98), span=Math.max(1e-9,hi-lo);
  const out=new Uint8ClampedArray(raw.length);
  for(let i=0;i<raw.length;i++) out[i]=Math.round(clamp((raw[i]-lo)/span,0,1)*255);
  return out;
}

self.addEventListener("message",async event=>{
  const {type,requestId,payload}=event.data??{};
  try{
    if(type!=="estimate-and-refine") throw new Error("Commande ZipDepth inconnue");
    const fullGuide=new Uint8ClampedArray(payload.fullGuideBuffer);
    const prep=buildLetterboxedTensor(fullGuide,payload.width,payload.height);
    const session=await getSession(requestId);
    postProgress(requestId,"Analyse ZipDepth…",38);
    const t0=performance.now();
    const results=await session.run({[session.inputNames[0]]:prep.tensor});
    const output=results[session.outputNames[0]];
    const inferenceMs=performance.now()-t0;
    const cropped=cropOutput(output,prep);
    const lowDepth=robustNormalizeNear255(cropped.data);
    const refinedLowGuide=resizeGuideRgba(fullGuide,payload.width,payload.height,cropped.width,cropped.height);
    postProgress(requestId,"Agrandissement guidé MicroPlayer…",70);
    let refined=jointBilateralUpsample(lowDepth,cropped.width,cropped.height,refinedLowGuide,fullGuide,payload.width,payload.height);
    postProgress(requestId,"Raffinement contours MicroPlayer 1/2…",84);
    refined=refineDepthEdgeAware(refined,fullGuide,payload.width,payload.height,1);
    postProgress(requestId,"Raffinement contours MicroPlayer 2/2…",94);
    refined=refineDepthEdgeAware(refined,fullGuide,payload.width,payload.height,1);
    postProgress(requestId,"ZipDepth terminé",100);
    self.postMessage({type:"result",requestId,refinedBuffer:refined.buffer,provider:"zipdepth",inferenceMs,modelInput:[MODEL_W,MODEL_H],contentInput:[prep.contentW,prep.contentH]},[refined.buffer]);
  }catch(error){
    self.postMessage({type:"error",requestId,message:error?.message??String(error),provider:"zipdepth"});
  }
});