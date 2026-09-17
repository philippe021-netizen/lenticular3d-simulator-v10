// MicroPlayer Image Preprocess V1
// Shared browser-side preprocessing for business cards/documents and normal photos.
// No generative modification: pixels are only cropped, perspective-warped, resized and gently corrected.

export const MP_PREPROCESS_VERSION = '1.0.0';

const clamp=(v,a=0,b=255)=>Math.max(a,Math.min(b,v));

export function detectMode(width,height,{documentHint=false}={}){
  const r=Math.max(width,height)/Math.max(1,Math.min(width,height));
  if(documentHint || (r>1.35 && r<1.9)) return 'document';
  return 'photo';
}

export function normalizedBusinessCardRatio(){ return 85/55; }

export function fitCrop(w,h,targetRatio){
  const r=w/h;
  if(Math.abs(r-targetRatio)<0.002) return {x:0,y:0,w,h};
  if(r>targetRatio){ const nw=h*targetRatio; return {x:(w-nw)/2,y:0,w:nw,h}; }
  const nh=w/targetRatio; return {x:0,y:(h-nh)/2,w,h:nh};
}

export function normalizeQuad(points,w,h){
  if(!Array.isArray(points)||points.length!==4) return null;
  return points.map(p=>({x:clamp(+p.x||0,0,w-1),y:clamp(+p.y||0,0,h-1)}));
}

// Bilinear quad warp. This is intentionally deterministic and local: no AI hallucination.
export function warpQuad(source,points,outW,outH){
  const sw=source.width, sh=source.height, q=normalizeQuad(points,sw,sh);
  if(!q) throw new Error('4 coins requis');
  const sctx=source.getContext('2d',{willReadFrequently:true});
  const src=sctx.getImageData(0,0,sw,sh), dst=new ImageData(outW,outH);
  const [tl,tr,br,bl]=q;
  for(let y=0;y<outH;y++){
    const v=outH===1?0:y/(outH-1);
    const lx=tl.x+(bl.x-tl.x)*v, ly=tl.y+(bl.y-tl.y)*v;
    const rx=tr.x+(br.x-tr.x)*v, ry=tr.y+(br.y-tr.y)*v;
    for(let x=0;x<outW;x++){
      const u=outW===1?0:x/(outW-1), sx=lx+(rx-lx)*u, sy=ly+(ry-ly)*u;
      const ix=clamp(Math.round(sx),0,sw-1), iy=clamp(Math.round(sy),0,sh-1);
      const si=(iy*sw+ix)*4, di=(y*outW+x)*4;
      dst.data[di]=src.data[si]; dst.data[di+1]=src.data[si+1]; dst.data[di+2]=src.data[si+2]; dst.data[di+3]=255;
    }
  }
  const c=document.createElement('canvas'); c.width=outW;c.height=outH;c.getContext('2d').putImageData(dst,0,0);return c;
}

export function gentleEnhance(canvas,{brightness=0,contrast=1.04,saturation=1.02}={}){
  const c=document.createElement('canvas');c.width=canvas.width;c.height=canvas.height;
  const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(canvas,0,0);
  const im=ctx.getImageData(0,0,c.width,c.height),d=im.data;
  for(let i=0;i<d.length;i+=4){
    let r=d[i]+brightness,g=d[i+1]+brightness,b=d[i+2]+brightness;
    r=(r-128)*contrast+128;g=(g-128)*contrast+128;b=(b-128)*contrast+128;
    const l=.2126*r+.7152*g+.0722*b;
    d[i]=clamp(l+(r-l)*saturation);d[i+1]=clamp(l+(g-l)*saturation);d[i+2]=clamp(l+(b-l)*saturation);
  }
  ctx.putImageData(im,0,0);return c;
}

export function cropAndResize(source,crop,maxWidth=1536){
  const ratio=crop.w/crop.h,w=Math.min(maxWidth,Math.max(1,Math.round(crop.w))),h=Math.max(1,Math.round(w/ratio));
  const c=document.createElement('canvas');c.width=w;c.height=h;
  c.getContext('2d').drawImage(source,crop.x,crop.y,crop.w,crop.h,0,0,w,h);return c;
}

export function preprocessPhoto(source,{maxWidth=1536,enhance=true,crop=null}={}){
  const area=crop||{x:0,y:0,w:source.width,h:source.height};
  let c=cropAndResize(source,area,maxWidth);if(enhance)c=gentleEnhance(c);return c;
}

export function preprocessBusinessCard(source,{corners=null,maxWidth=1536,enhance=true,forceRatio=true}={}){
  const ratio=normalizedBusinessCardRatio();let c;
  if(corners){
    const w=Math.min(maxWidth,1536),h=Math.round(w/ratio);c=warpQuad(source,corners,w,h);
  }else{
    const crop=forceRatio?fitCrop(source.width,source.height,ratio):{x:0,y:0,w:source.width,h:source.height};
    c=cropAndResize(source,crop,maxWidth);
  }
  if(enhance)c=gentleEnhance(c,{contrast:1.06,saturation:1.01});return c;
}

export async function canvasToDataURL(canvas,type='image/png',quality=.96){ return canvas.toDataURL(type,quality); }

export function qualityReport(before,after,mode){
  return {mode,before:`${before.width}×${before.height}`,after:`${after.width}×${after.height}`,nonGenerative:true,ready:true};
}
