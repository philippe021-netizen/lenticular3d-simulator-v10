// Local, deterministic contrast segmentation for offline iPad Safari.
// A cropped alpha mask follows object silhouettes or independent glyphs.
// Not a semantic SAM model: low-contrast/complex backgrounds need manual correction.
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const boxRect=(box,w,h)=>{
 const x=clamp(Math.floor(box[0]*w),0,w-1),y=clamp(Math.floor(box[1]*h),0,h-1);
 return {x,y,w:Math.max(1,Math.min(w-x,Math.ceil(box[2]*w))),h:Math.max(1,Math.min(h-y,Math.ceil(box[3]*h)))};
};

export function maskAlphaAt(mask,box,x,y,width,height){
 if(!mask||!mask.alpha||!mask.width||!mask.height)return 255;
 const rx=(x+.5)/width,ry=(y+.5)/height;
 const u=(rx-box[0])/box[2],v=(ry-box[1])/box[3];
 if(u<0||u>=1||v<0||v>=1)return 0;
 return mask.alpha[Math.min(mask.height-1,Math.floor(v*mask.height))*mask.width+Math.min(mask.width-1,Math.floor(u*mask.width))]||0;
}
const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);

export function segmentCardSelection(pixels,width,height,bbox,kind='object',maxSize=450){
 if(pixels.length!==width*height*4||!bbox||bbox.length!==4)throw Error('Image ou zone incorrecte');
 const r=boxRect(bbox,width,height),scale=Math.min(1,maxSize/Math.max(r.w,r.h));
 const mw=Math.max(1,Math.round(r.w*scale)),mh=Math.max(1,Math.round(r.h*scale)),n=mw*mh;
 const rgb=new Uint8Array(n*3),border=[];
 for(let y=0;y<mh;y++)for(let x=0;x<mw;x++){
   const sx=Math.min(width-1,r.x+Math.floor((x+.5)*r.w/mw));
   const sy=Math.min(height-1,r.y+Math.floor((y+.5)*r.h/mh));
   const si=(sy*width+sx)*4,di=(y*mw+x)*3;
   rgb[di]=pixels[si];rgb[di+1]=pixels[si+1];rgb[di+2]=pixels[si+2];
   if(x<Math.max(1,mw*.04)||y<Math.max(1,mh*.04)||x>=mw-Math.max(1,mw*.04)||y>=mh-Math.max(1,mh*.04)){
     border.push([rgb[di],rgb[di+1],rgb[di+2]]);
   }
 }
 // Most common perimeter colour cell; avoids a few foreground boundary pixels.
 const buckets=new Map();
 for(const c of border){
   const key=((c[0]>>4)<<8)|((c[1]>>4)<<4)|(c[2]>>4);
   const entry=buckets.get(key)||{count:0,r:0,g:0,b:0};
   entry.count++;entry.r+=c[0];entry.g+=c[1];entry.b+=c[2];buckets.set(key,entry);
 }
 const sorted=[...buckets.values()].sort((a,b)=>b.count-a.count);
 const bg=sorted.length?[sorted[0].r/sorted[0].count,sorted[0].g/sorted[0].count,sorted[0].b/sorted[0].count]:[255,255,255];
 const edgeDistances=border.map(c=>distance(c,bg)).sort((a,b)=>a-b);
 const noise=edgeDistances[Math.floor(edgeDistances.length*.6)]||0;
 const threshold=clamp(Math.max(kind==='text'?22:31,noise*.85+14),22,90);
 const candidate=new Uint8Array(n);
 for(let i=0;i<n;i++){
   const j=i*3;
   candidate[i]=distance([rgb[j],rgb[j+1],rgb[j+2]],bg)>threshold?255:0;
 }
 // Object mode: keep the largest coherent island, not stray marks in the rectangle.
 if(kind!=='text'&&n>10){
   const visited=new Uint8Array(n),queue=new Int32Array(n);
   let best=[],bestScore=-1;
   for(let i=0;i<n;i++){
     if(!candidate[i]||visited[i])continue;
     visited[i]=1;let head=0,tail=0,sumX=0,sumY=0;queue[tail++]=i;
     while(head<tail){
       const p=queue[head++],x=p%mw,y=Math.floor(p/mw);
       sumX+=x;sumY+=y;
       const neigh=[x>0?p-1:-1,x+1<mw?p+1:-1,y>0?p-mw:-1,y+1<mh?p+mw:-1];
       for(const q of neigh)if(q>=0&&candidate[q]&&!visited[q]){visited[q]=1;queue[tail++]=q}
     }
     const dx=sumX/tail/mw-.5,dy=sumY/tail/mh-.5;
     const score=tail/(1+Math.hypot(dx,dy)*.5);
     if(score>bestScore){bestScore=score;best=Array.from(queue.subarray(0,tail))}
   }
   if(best.length>3){candidate.fill(0);for(const i of best)candidate[i]=255}
 }
 // Gentle 3x3 majority for objects: remove specks without erasing fine letter stems.
 if(kind!=='text'&&mw>4&&mh>4){
   const filtered=new Uint8Array(candidate);
   for(let y=1;y<mh-1;y++)for(let x=1;x<mw-1;x++){
     let count=0;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)count+=candidate[(y+dy)*mw+x+dx]>0?1:0;
     filtered[y*mw+x]=count>=4?255:0;
   }
   candidate.set(filtered);
 }
 const coverage=candidate.reduce((a,b)=>a+(b>0?1:0),0)/n;
 if(coverage<.0015||coverage>.89)throw Error('Détourage incertain : augmente la marge du cadre ou corrige manuellement le contour');
 return {width:mw,height:mh,alpha:candidate,mode:kind,coverage,background:bg.map(Math.round)};
}

export function paintMaskAt(mask,u,v,radiusPixels,mode='add'){
 if(!mask||!mask.alpha)return mask;
 if(!Number.isFinite(u)||!Number.isFinite(v)||u<0||u>1||v<0||v>1)return mask;
 // Copy only once per operation; no full 200k-pixel coverage scan on every Pencil move.
 const out={...mask,alpha:new Uint8Array(mask.alpha)};
 const cx=Math.min(mask.width-1,Math.max(0,Math.round(u*(mask.width-1))));
 const cy=Math.min(mask.height-1,Math.max(0,Math.round(v*(mask.height-1))));
 const radius=Math.max(1,Math.round(radiusPixels));
 const next=mode==='erase'?0:255;
 let delta=0;
 for(let y=Math.max(0,cy-radius);y<=Math.min(mask.height-1,cy+radius);y++)
 for(let x=Math.max(0,cx-radius);x<=Math.min(mask.width-1,cx+radius);x++){
   if(Math.hypot(x-cx,y-cy)>radius)continue;
   const i=y*mask.width+x;
   if(out.alpha[i]!==next){delta+=(next>0?1:-1);out.alpha[i]=next}
 }
 const count=out.alpha.length;
 out.coverage=Number.isFinite(mask.coverage)?
   Math.max(0,Math.min(1,mask.coverage+delta/count)):
   out.alpha.reduce((sum,value)=>sum+(value>0?1:0),0)/count;
 return out;
}
export function paintMaskStroke(mask,from,to,radiusPixels,mode='add'){
 if(!mask)return mask;
 const distance=Math.hypot((to.u-from.u)*mask.width,(to.v-from.v)*mask.height);
 const steps=Math.max(1,Math.ceil(distance/Math.max(1,radiusPixels*.42)));
 let edited=mask;
 for(let i=0;i<=steps;i++){
   const t=i/steps;
   edited=paintMaskAt(edited,from.u*(1-t)+to.u*t,from.v*(1-t)+to.v*t,radiusPixels,mode);
 }
 return edited;
}
export function eraseCardSelectionByMask(pixels,width,height,bbox,mask,rectFill){
 if(!mask||!mask.alpha)return rectFill;
 const output=new Uint8ClampedArray(pixels);
 const {x,y,w,h}=boxRect(bbox,width,height);
 for(let yy=y;yy<y+h;yy++)for(let xx=x;xx<x+w;xx++){
   const a=maskAlphaAt(mask,bbox,xx,yy,width,height)/255;
   if(a<=0)continue;
   const i=(yy*width+xx)*4;
   for(let k=0;k<3;k++)output[i+k]=pixels[i+k]*(1-a)+rectFill[i+k]*a;
 }
 return output;
}
