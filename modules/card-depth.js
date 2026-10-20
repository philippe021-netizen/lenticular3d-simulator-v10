const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

// Detections adjust an estimated surface; they never copy RGB rectangles.
// Smaller detections win over encompassing scene detections.
export function composeCardDepth(base,width,height,layers){
  if(base.length!==width*height)throw new Error('Dimensions de profondeur incohérentes');
  const output=new Uint8ClampedArray(base);
  const sorted=layers.filter(l=>l.enabled!==false).slice().sort((a,b)=>(Number(a.type==='text')-Number(b.type==='text'))||b.bbox[2]*b.bbox[3]-a.bbox[2]*a.bbox[3]);
  for(const layer of sorted){
    let [bx,by,bw,bh]=layer.bbox;
    if(layer.type==='text'){
      // Align protected rows in the same text column. Vision boxes sometimes
      // omit the last letters of a short footer; the column supplies their plane.
      const peers=sorted.filter(l=>l.type==='text'&&l.bbox[0]<bx+bw&&l.bbox[0]+l.bbox[2]>bx);
      const right=Math.max(bx+bw,...peers.map(l=>l.bbox[0]+l.bbox[2]));
      bx=Math.min(bx,...peers.map(l=>l.bbox[0]));bw=right-bx;
    }
    const pad=layer.type==='text'?.018:0;
    const x0=clamp(Math.floor((bx-pad)*width),0,width),y0=clamp(Math.floor((by-pad)*height),0,height);
    const x1=clamp(Math.ceil((bx+bw+pad)*width),0,width),y1=clamp(Math.ceil((by+bh+pad)*height),0,height);
    const shift=clamp(Number(layer.depth)||0,-100,100)*.8;
    const feather=Math.max(1,Math.min(x1-x0,y1-y0)*.08);
    for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){
      const i=y*width+x;
      if(layer.type==='text')output[i]=clamp(128+shift,0,255);
      else{
        const weight=clamp(Math.min(x-x0+.5,x1-x-.5,y-y0+.5,y1-y-.5)/feather,0,1);
        output[i]=clamp(base[i]+shift*weight,0,255);
      }
    }
  }
  // A neighbouring row's safety padding must never change a detected glyph plane.
  for(const layer of sorted.filter(l=>l.type==='text')){
    const [x,y,w,h]=layer.bbox,value=clamp(128+(Number(layer.depth)||0)*.8,0,255);
    const x0=clamp(Math.floor(x*width),0,width),x1=clamp(Math.ceil((x+w)*width),0,width);
    for(let yy=clamp(Math.floor(y*height),0,height);yy<clamp(Math.ceil((y+h)*height),0,height);yy++) output.fill(value,yy*width+x0,yy*width+x1);
  }
  return output;
}

export function estimateCardDepth(imageUrl,guide,width,height,onProgress=()=>{}){
  return new Promise((resolve,reject)=>{
    const worker=new Worker(new URL('../depthflow-v42-worker.js',import.meta.url),{type:'module'});
    const timer=setTimeout(()=>finish(new Error('Calcul de profondeur trop long. Réessaie.')),180000);
    const finish=(error,result)=>{clearTimeout(timer);worker.terminate();error?reject(error):resolve(result)};
    worker.onerror=e=>finish(new Error(e.message||'Modèle de profondeur indisponible'));
    worker.onmessage=({data})=>{
      if(data.type==='progress')onProgress(data.stage,data.percent);
      if(data.type==='error')finish(new Error(data.message));
      if(data.type==='result')finish(null,new Uint8ClampedArray(data.refinedBuffer));
    };
    const copy=new Uint8ClampedArray(guide);
    worker.postMessage({type:'estimate-and-refine',requestId:1,payload:{imageUrl,width,height,fullGuideBuffer:copy.buffer}},[copy.buffer]);
  });
}
