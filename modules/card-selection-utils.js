const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));

export function normalizeSelectionBbox(box,minSize=.015){
  const [rx,ry,rw,rh]=(box||[]).map(Number);
  const x=clamp(Number.isFinite(rx)?rx:0,0,1-minSize);
  const y=clamp(Number.isFinite(ry)?ry:0,0,1-minSize);
  const w=clamp(Number.isFinite(rw)?rw:minSize,minSize,1-x);
  const h=clamp(Number.isFinite(rh)?rh:minSize,minSize,1-y);
  return [x,y,w,h];
}

export function selectionFromPoints(a,b){
  return normalizeSelectionBbox([Math.min(a.x,b.x),Math.min(a.y,b.y),
    Math.abs(b.x-a.x),Math.abs(b.y-a.y)]);
}

export function moveSelectionBbox(box,dx,dy){
  const [x,y,w,h]=normalizeSelectionBbox(box);
  return [clamp(x+dx,0,1-w),clamp(y+dy,0,1-h),w,h];
}

export function resizeSelectionBbox(box,dx,dy){
  const [x,y,w,h]=normalizeSelectionBbox(box);
  return normalizeSelectionBbox([x,y,w+dx,h+dy]);
}

// Modifies only a WORKING COPY, using a smooth approximation of the surrounding
// background. Suitable for plain cards, not a semantic/content-aware reconstruction.
export function fillSelectionWithBackground(pixels,width,height,bbox){
  if(width<3||height<3||pixels.length!==width*height*4)throw new Error('Image de sélection invalide');
  const [x,y,w,h]=normalizeSelectionBbox(bbox);
  const pad=Math.max(1,Math.round(Math.min(width,height)*.002));
  const x0=clamp(Math.floor(x*width)-pad,0,width-1),
        y0=clamp(Math.floor(y*height)-pad,0,height-1),
        x1=clamp(Math.ceil((x+w)*width)+pad,x0+1,width),
        y1=clamp(Math.ceil((y+h)*height)+pad,y0+1,height);
  const out=new Uint8ClampedArray(pixels);
  const left=clamp(x0-1,0,width-1),right=clamp(x1,0,width-1);
  const top=clamp(y0-1,0,height-1),bottom=clamp(y1,0,height-1);
  const horizontalWeight=(y1-y0)/((x1-x0)+(y1-y0));
  for(let yy=y0;yy<y1;yy++)for(let xx=x0;xx<x1;xx++){
    const k=(yy*width+xx)*4, u=(xx-x0+.5)/(x1-x0),v=(yy-y0+.5)/(y1-y0);
    const kl=(yy*width+left)*4,kr=(yy*width+right)*4;
    const kt=(top*width+xx)*4,kb=(bottom*width+xx)*4;
    for(let c=0;c<3;c++){
      const side=pixels[kl+c]*(1-u)+pixels[kr+c]*u;
      const vertical=pixels[kt+c]*(1-v)+pixels[kb+c]*v;
      out[k+c]=side*horizontalWeight+vertical*(1-horizontalWeight);
    }
    out[k+3]=255;
  }
  return out;
}
