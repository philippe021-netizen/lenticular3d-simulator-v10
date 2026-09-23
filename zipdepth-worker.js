import { jointBilateralUpsample, refineDepthEdgeAware } from "./depthflow-v42-core.js";

let sessionPromise=null;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function progress(requestId,stage,percent){self.postMessage({type:"progress",requestId,stage,percent});}
async function session(requestId){
 if(!sessionPromise){progress(requestId,"Chargement ZipDepth ONNX…",8);sessionPromise=ort.InferenceSession.create("./zipdepth_base_npu_384.onnx",{executionProviders:["wasm"]});}
 try{return await sessionPromise;}catch(e){sessionPromise=null;throw e;}
}
function resizeRGBA(src,sw,sh,w,h){
 const out=new Uint8ClampedArray(w*h*4);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const sx=clamp(Math.round((x+.5)*sw/w-.5),0,sw-1),sy=clamp(Math.round((y+.5)*sh/h-.5),0,sh-1),si=(sy*sw+sx)*4,di=(y*w+x)*4;out[di]=src[si];out[di+1]=src[si+1];out[di+2]=src[si+2];out[di+3]=255;} return out;
}
function tensorFromRGBA(rgba,w,h){
 const d=new Float32Array(3*w*h),mean=[0.485,0.456,0.406],std=[0.229,0.224,0.225];
 for(let i=0;i<w*h;i++)for(let c=0;c<3;c++)d[c*w*h+i]=(rgba[i*4+c]/255-mean[c])/std[c];
 return new ort.Tensor("float32",d,[1,3,h,w]);
}
function normalize(raw){
 let lo=Infinity,hi=-Infinity;for(const v of raw){if(Number.isFinite(v)){lo=Math.min(lo,v);hi=Math.max(hi,v);}}
 const out=new Uint8ClampedArray(raw.length),span=Math.max(1e-9,hi-lo);for(let i=0;i<raw.length;i++)out[i]=Math.round(clamp((raw[i]-lo)/span,0,1)*255);return out;
}
self.addEventListener("message",async e=>{const {type,requestId,payload}=e.data??{};try{
 if(type!=="estimate-and-refine")throw new Error("Commande ZipDepth inconnue");
 if(typeof ort==="undefined")importScripts("https://cdn.jsdelivr.net/npm/onnxruntime-web@1.16.3/dist/ort.min.js");
 const full=new Uint8ClampedArray(payload.fullGuideBuffer), iw=384,ih=384, lowGuide=resizeRGBA(full,payload.width,payload.height,iw,ih);
 const s=await session(requestId);progress(requestId,"Analyse ZipDepth…",40);
 const input=tensorFromRGBA(lowGuide,iw,ih),name=s.inputNames[0],res=await s.run({[name]:input}),out=res[s.outputNames[0]];
 let low=normalize(out.data);progress(requestId,"Raffinement MicroPlayer…",70);
 let refined=jointBilateralUpsample(low,iw,ih,lowGuide,full,payload.width,payload.height);
 refined=refineDepthEdgeAware(refined,full,payload.width,payload.height,1);refined=refineDepthEdgeAware(refined,full,payload.width,payload.height,1);
 progress(requestId,"ZipDepth terminé",100);self.postMessage({type:"result",requestId,refinedBuffer:refined.buffer,provider:"zipdepth"},[refined.buffer]);
 }catch(error){self.postMessage({type:"error",requestId,message:error?.message??String(error),provider:"zipdepth"});}});
