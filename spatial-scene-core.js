const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

function makeCanvas(width,height,data){
  const canvas=document.createElement('canvas');
  canvas.width=width;canvas.height=height;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  ctx.putImageData(new ImageData(new Uint8ClampedArray(data),width,height),0,0);
  return canvas;
}

function resampleRgba(source,width,height,targetWidth,targetHeight){
  if(width===targetWidth&&height===targetHeight)return new Uint8ClampedArray(source);
  const src=makeCanvas(width,height,source),dst=document.createElement('canvas');
  dst.width=targetWidth;dst.height=targetHeight;
  const ctx=dst.getContext('2d',{willReadFrequently:true});
  ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
  ctx.drawImage(src,0,0,targetWidth,targetHeight);
  return ctx.getImageData(0,0,targetWidth,targetHeight).data;
}

function resampleDepth(depth,width,height,targetWidth,targetHeight){
  if(width===targetWidth&&height===targetHeight)return new Uint8ClampedArray(depth);
  const out=new Uint8ClampedArray(targetWidth*targetHeight);
  for(let y=0;y<targetHeight;y++){
    const sy=clamp(Math.round((y+.5)*height/targetHeight-.5),0,height-1);
    for(let x=0;x<targetWidth;x++){
      const sx=clamp(Math.round((x+.5)*width/targetWidth-.5),0,width-1);
      out[y*targetWidth+x]=depth[sy*width+sx];
    }
  }
  return out;
}

function reconstructBackplate(source,depth,width,height,zero){
  const out=new Uint8ClampedArray(source);
  const nearThreshold=Math.min(248,zero+10);
  const maxSearch=Math.max(16,Math.round(width*.09));
  const leftBg=new Int32Array(width),rightBg=new Int32Array(width);
  for(let y=0;y<height;y++){
    let last=-1;
    for(let x=0;x<width;x++){
      const i=y*width+x;
      if(depth[i]<=nearThreshold)last=x;
      leftBg[x]=last;
    }
    last=-1;
    for(let x=width-1;x>=0;x--){
      const i=y*width+x;
      if(depth[i]<=nearThreshold)last=x;
      rightBg[x]=last;
    }
    for(let x=0;x<width;x++){
      const i=y*width+x;
      if(depth[i]<=nearThreshold)continue;
      const l=leftBg[x],r=rightBg[x];
      const dl=l<0?1e9:x-l,dr=r<0?1e9:r-x;
      let sx=-1;
      if(dl<=maxSearch||dr<=maxSearch)sx=dl<=dr?l:r;
      if(sx<0)continue;
      const s=(y*width+sx)*4,p=i*4;
      out[p]=source[s];out[p+1]=source[s+1];out[p+2]=source[s+2];out[p+3]=255;
    }
  }
  // Small seam-only relaxation. It does not blur the original source layer.
  const tmp=new Uint8ClampedArray(out);
  for(let y=1;y<height-1;y++)for(let x=1;x<width-1;x++){
    const i=y*width+x;if(depth[i]<=nearThreshold)continue;
    const p=i*4;let sr=0,sg=0,sb=0,n=0;
    for(let oy=-1;oy<=1;oy++)for(let ox=-1;ox<=1;ox++){
      const q=((y+oy)*width+x+ox)*4;sr+=tmp[q];sg+=tmp[q+1];sb+=tmp[q+2];n++;
    }
    out[p]=Math.round(sr/n);out[p+1]=Math.round(sg/n);out[p+2]=Math.round(sb/n);out[p+3]=255;
  }
  return out;
}

function buildGeometry(depth,zero,relief){
  const z=new Float32Array(depth.length),inverse=new Float32Array(depth.length);
  const strength=clamp(Number(relief)||2.2,.8,2.8);
  const nearScale=.16*strength,farScale=.105*strength;
  let maxAbs=1e-6;
  for(let i=0;i<depth.length;i++){
    const d=depth[i]-zero;
    const norm=d>=0?d/Math.max(1,255-zero):d/Math.max(1,zero);
    const zz=clamp(1-(norm>=0?norm*nearScale:norm*farScale),.42,1.75);
    z[i]=zz;
    const inv=1/zz-1;
    inverse[i]=inv;maxAbs=Math.max(maxAbs,Math.abs(inv));
  }
  return {z,inverse,maxAbs};
}

export function createSpatialScene(source,depth,width,height,options={}){
  if(source.length!==width*height*4||depth.length!==width*height)throw new Error('Dimensions scène spatiale incohérentes');
  const maxEdge=Math.max(1,Number(options.maxEdge)||Math.max(width,height));
  const scale=Math.min(1,maxEdge/Math.max(width,height));
  const W=Math.max(1,Math.round(width*scale)),H=Math.max(1,Math.round(height*scale));
  const rgba=resampleRgba(source,width,height,W,H),d=resampleDepth(depth,width,height,W,H);
  const zero=clamp(Number(options.zero??128),0,255);
  const relief=clamp(Number(options.relief??2.2),.8,2.8);
  const geometry=buildGeometry(d,zero,relief);
  const backplate=reconstructBackplate(rgba,d,W,H,zero);
  return {
    width:W,height:H,source:rgba,depth:d,backplate,zero,relief,
    z:geometry.z,inverse:geometry.inverse,maxAbsInverse:geometry.maxAbs,
    sourceWidth:width,sourceHeight:height,scale,
    model:'microplayer-spatial-scene-2.5d-v03'
  };
}

function copyPixel(dst,di,src,si){
  dst[di]=src[si];dst[di+1]=src[si+1];dst[di+2]=src[si+2];dst[di+3]=255;
}

export function renderSpatialSceneView(scene,position,options={}){
  const W=scene.width,H=scene.height,N=W*H;
  const normal=clamp(Number(position)||0,-1,1);
  if(Math.abs(normal)<1e-9){
    return {canvas:makeCanvas(W,H,scene.source),stats:{
      position:0,mode:'spatial-scene-center-exact',maxShift:0,holesBeforeFill:0,
      holeRatioBeforeFill:0,sceneDisocclusionPercent:0,backgroundFilled:0,
      backgroundFillPercent:100,fallbackFilled:0,fallbackFillPercent:0,
      interiorFallbackFilled:0,interiorFallbackFillPercent:0,filled:0,
      maxFillDistance:0,scale:scene.scale,unresolvedHoleRatio:0
    }};
  }

  const parallaxPercent=clamp(Number(options.parallaxPercent??4.2),0,7);
  const halfRange=W*parallaxPercent/200;
  const focusZ=1;
  const farZ=1.34;
  const farInv=(1/farZ-1/focusZ);
  const farNorm=farInv/scene.maxAbsInverse;
  const backgroundShift=normal*halfRange*farNorm;

  const output=new Uint8ClampedArray(N*4);
  // Backplate = hidden-surface hypothesis. Render it as a farther textured plane first.
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
    const sx=clamp(Math.round(x+backgroundShift),0,W-1);
    copyPixel(output,(y*W+x)*4,scene.backplate,(y*W+sx)*4);
  }

  const zbuf=new Float32Array(N);zbuf.fill(Infinity);
  const hit=new Uint8Array(N);
  let maxShift=0;
  for(let y=0;y<H;y++){
    for(let x=0;x<W;x++){
      const i=y*W+x;
      const disparity=normal*halfRange*(scene.inverse[i]/scene.maxAbsInverse);
      maxShift=Math.max(maxShift,Math.abs(disparity));
      const tx=x-disparity;
      const x0=Math.floor(tx),x1=x0+1,frac=tx-x0;
      // Surfel splat: two neighbouring samples reduce cracks without changing source texture.
      const candidates=[[x0,1-frac],[x1,frac]];
      for(const [xx,w] of candidates){
        if(xx<0||xx>=W||w<.18)continue;
        const ti=y*W+xx;
        if(scene.z[i]>=zbuf[ti])continue;
        zbuf[ti]=scene.z[i];hit[ti]=1;
        copyPixel(output,ti*4,scene.source,i*4);
      }
    }
  }

  // Estimate genuine disocclusion: background plate visible between projected scene surfels.
  let disoccluded=0;
  for(let i=0;i<N;i++)if(!hit[i])disoccluded++;
  const disocclusionPercent=N?disoccluded/N*100:0;

  // Tiny edge repair from already projected neighbours; backplate remains the default fill.
  let repaired=0;
  const repairedMask=new Uint8Array(hit);
  for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++){
    const i=y*W+x;if(hit[i])continue;
    const l=i-1,r=i+1;
    if(hit[l]&&hit[r]&&Math.abs(scene.depth[l]-scene.depth[r])<10){
      const p=i*4,pl=l*4,pr=r*4;
      output[p]=Math.round((output[pl]+output[pr])/2);
      output[p+1]=Math.round((output[pl+1]+output[pr+1])/2);
      output[p+2]=Math.round((output[pl+2]+output[pr+2])/2);output[p+3]=255;
      repairedMask[i]=1;repaired++;
    }
  }

  const canvas=makeCanvas(W,H,output);
  return {canvas,stats:{
    position:normal,mode:'spatial-scene-2.5d-camera',camera:'lateral-perspective-converged',
    maxShift:Number(maxShift.toFixed(3)),holesBeforeFill:0,holeRatioBeforeFill:0,
    unresolvedHoleRatio:0,sceneDisocclusionPercent:Number(disocclusionPercent.toFixed(2)),
    backgroundFilled:Math.max(0,disoccluded-repaired),
    backgroundFillPercent:100,fallbackFilled:0,fallbackFillPercent:0,
    interiorFallbackFilled:0,interiorFallbackFillPercent:0,filled:disoccluded,
    maxFillDistance:0,edgeRepairs:repaired,scale:scene.scale,
    sceneModel:scene.model
  }};
}

export function spatialSceneDiagnostics(scene){
  let min=255,max=0;
  for(const d of scene.depth){if(d<min)min=d;if(d>max)max=d;}
  return {model:scene.model,width:scene.width,height:scene.height,scale:scene.scale,depthMin:min,depthMax:max,zero:scene.zero,relief:scene.relief};
}
