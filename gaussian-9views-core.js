import * as THREE from 'three';
import { SplatMesh } from '@sparkjsdev/spark';

const TYPE_INFO = {
  char:{size:1,read:(v,o)=>v.getInt8(o)},
  uchar:{size:1,read:(v,o)=>v.getUint8(o)},
  int8:{size:1,read:(v,o)=>v.getInt8(o)},
  uint8:{size:1,read:(v,o)=>v.getUint8(o)},
  short:{size:2,read:(v,o)=>v.getInt16(o,true)},
  ushort:{size:2,read:(v,o)=>v.getUint16(o,true)},
  int16:{size:2,read:(v,o)=>v.getInt16(o,true)},
  uint16:{size:2,read:(v,o)=>v.getUint16(o,true)},
  int:{size:4,read:(v,o)=>v.getInt32(o,true)},
  uint:{size:4,read:(v,o)=>v.getUint32(o,true)},
  int32:{size:4,read:(v,o)=>v.getInt32(o,true)},
  uint32:{size:4,read:(v,o)=>v.getUint32(o,true)},
  float:{size:4,read:(v,o)=>v.getFloat32(o,true)},
  float32:{size:4,read:(v,o)=>v.getFloat32(o,true)},
  double:{size:8,read:(v,o)=>v.getFloat64(o,true)},
  float64:{size:8,read:(v,o)=>v.getFloat64(o,true)}
};

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const pct=v=>Number((v*100).toFixed(3));

function quantile(sorted,q){
  if(!sorted.length)return NaN;
  const p=clamp(q,0,1)*(sorted.length-1);
  const a=Math.floor(p),b=Math.ceil(p),t=p-a;
  return sorted[a]*(1-t)+sorted[b]*t;
}

function readHeader(buffer){
  const max=Math.min(buffer.byteLength,65536);
  const text=new TextDecoder('utf-8').decode(new Uint8Array(buffer,0,max));
  let marker='end_header\n',idx=text.indexOf(marker);
  if(idx<0){marker='end_header\r\n';idx=text.indexOf(marker);}
  if(idx<0)throw new Error('En-tête PLY incomplet ou non reconnu.');
  const headerEnd=idx+marker.length;
  const lines=text.slice(0,headerEnd).split(/\r?\n/);
  let format='',current=null;
  const elements=[];
  for(const raw of lines){
    const line=raw.trim();
    if(line.startsWith('format '))format=line.split(/\s+/)[1]||'';
    else if(line.startsWith('element ')){
      const p=line.split(/\s+/);
      current={name:p[1],count:Number(p[2]),properties:[],stride:0,offset:0};
      elements.push(current);
    }else if(line.startsWith('property ')&&current){
      const p=line.split(/\s+/);
      if(p[1]==='list')throw new Error('PLY avec propriétés list non pris en charge.');
      const info=TYPE_INFO[p[1]];
      if(!info)throw new Error('Type PLY non pris en charge : '+p[1]);
      current.properties.push({type:p[1],name:p[2],size:info.size,offset:current.stride});
      current.stride+=info.size;
    }
  }
  if(format!=='binary_little_endian')throw new Error('Le test Gaussian attend un PLY binary_little_endian.');
  let off=headerEnd;
  for(const el of elements){el.offset=off;off+=el.count*el.stride;}
  if(off>buffer.byteLength)throw new Error('PLY tronqué : taille inférieure aux éléments déclarés.');
  return {format,headerEnd,elements,totalBytes:off};
}

function scalarArray(view,el){
  if(!el||!el.properties.length)return [];
  const out=[];
  if(el.properties.length===1){
    const p=el.properties[0],reader=TYPE_INFO[p.type].read;
    for(let i=0;i<el.count;i++)out.push(reader(view,el.offset+i*el.stride+p.offset));
    return out;
  }
  if(el.count===1){
    for(const p of el.properties)out.push(TYPE_INFO[p.type].read(view,el.offset+p.offset));
    return out;
  }
  return out;
}

function sampleDepths(view,vertex,maxSamples=60000){
  const z=vertex.properties.find(p=>p.name==='z');
  if(!z)throw new Error('Le PLY ne contient pas la coordonnée z.');
  const reader=TYPE_INFO[z.type].read;
  const step=Math.max(1,Math.ceil(vertex.count/maxSamples));
  const depths=[];
  for(let i=0;i<vertex.count;i+=step){
    const value=reader(view,vertex.offset+i*vertex.stride+z.offset);
    if(Number.isFinite(value)&&value>0)depths.push(value);
  }
  depths.sort((a,b)=>a-b);
  return depths;
}

export function inspectGaussianPly(buffer){
  const parsed=readHeader(buffer),view=new DataView(buffer);
  const map=new Map(parsed.elements.map(el=>[el.name,el]));
  const vertex=map.get('vertex');
  if(!vertex)throw new Error('Aucun élément vertex dans ce PLY.');

  const imageSizeRaw=scalarArray(view,map.get('image_size'));
  const intrinsicRaw=scalarArray(view,map.get('intrinsic'));
  const disparityRaw=scalarArray(view,map.get('disparity'));
  const extrinsicRaw=scalarArray(view,map.get('extrinsic'));
  const versionRaw=scalarArray(view,map.get('version'));

  let width=640,height=480,fx=0,fy=0,cx=0,cy=0;
  if(imageSizeRaw.length>=2){
    width=Math.round(imageSizeRaw[0]);height=Math.round(imageSizeRaw[1]);
  }
  if(intrinsicRaw.length>=9){
    fx=Number(intrinsicRaw[0]);fy=Number(intrinsicRaw[4]);
    cx=Number(intrinsicRaw[2]);cy=Number(intrinsicRaw[5]);
  }else if(intrinsicRaw.length>=4){
    fx=Number(intrinsicRaw[0]);fy=Number(intrinsicRaw[1]);
  }
  if(!(fx>0))fx=height*1.07;
  if(!(fy>0))fy=fx;
  if(!(cx>0))cx=width/2;
  if(!(cy>0))cy=height/2;

  const depths=sampleDepths(view,vertex);
  const depthNear=quantile(depths,.001);
  const depthFocus=quantile(depths,.10);
  const depthMedian=quantile(depths,.50);
  const depthFar=quantile(depths,.999);
  const diagonal=Math.hypot(width/fx,height/fy);

  return {
    kind:'microplayer-gaussian-ply',
    bytes:buffer.byteLength,
    gaussianCount:vertex.count,
    image:{width,height,aspect:width/height},
    intrinsics:{fx,fy,cx,cy},
    depth:{
      near:Number(depthNear.toFixed(4)),
      focus:Number(depthFocus.toFixed(4)),
      median:Number(depthMedian.toFixed(4)),
      far:Number(depthFar.toFixed(4))
    },
    disparity:disparityRaw.slice(0,2),
    extrinsic:extrinsicRaw.slice(0,16),
    version:versionRaw.slice(0,3),
    diagonal:Number(diagonal.toFixed(6)),
    elements:parsed.elements.map(el=>({name:el.name,count:el.count,stride:el.stride}))
  };
}

function waitFrame(){return new Promise(resolve=>requestAnimationFrame(()=>resolve()));}
function canvasBlob(canvas,type='image/png',quality){
  return new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('Export canvas impossible.')),type,quality));
}

function analyzeAlpha(imageData){
  const {data,width,height}=imageData;
  const step=2;
  let full=0,fullMissing=0,center=0,centerMissing=0;
  const x0=Math.round(width*.05),x1=Math.round(width*.95);
  const y0=Math.round(height*.05),y1=Math.round(height*.95);
  let minX=width,minY=height,maxX=-1,maxY=-1;
  for(let y=0;y<height;y+=step){
    for(let x=0;x<width;x+=step){
      const a=data[(y*width+x)*4+3];
      full++;
      if(a<8)fullMissing++;
      else{if(x<minX)minX=x;if(x>maxX)maxX=x;if(y<minY)minY=y;if(y>maxY)maxY=y;}
      if(x>=x0&&x<x1&&y>=y0&&y<y1){
        center++;
        if(a<8)centerMissing++;
      }
    }
  }
  return {
    transparentPercent:pct(fullMissing/Math.max(1,full)),
    transparentCenterPercent:pct(centerMissing/Math.max(1,center)),
    coverageBounds:maxX>=minX?{x:minX,y:minY,width:maxX-minX+1,height:maxY-minY+1}:null
  };
}


function repairBorderTransparency(canvas){
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  const img=ctx.getImageData(0,0,canvas.width,canvas.height);
  const {data,width:W,height:H}=img,N=W*H;
  const transparent=new Uint8Array(N);
  let transparentBefore=0;
  for(let i=0;i<N;i++){
    if(data[i*4+3]<8){transparent[i]=1;transparentBefore++;}
  }
  if(!transparentBefore)return {repairedPixels:0,repairedPercent:0,remainingTransparentPercent:0};

  // Find only transparent regions connected to the image border.
  // Interior holes around the subject are deliberately not touched.
  const connected=new Uint8Array(N);
  const queue=new Int32Array(N);
  let qh=0,qt=0;
  const push=i=>{if(transparent[i]&&!connected[i]){connected[i]=1;queue[qt++]=i;}};
  for(let x=0;x<W;x++){push(x);push((H-1)*W+x);}
  for(let y=1;y<H-1;y++){push(y*W);push(y*W+W-1);}
  while(qh<qt){
    const i=queue[qh++],x=i%W,y=(i/W)|0;
    if(x>0)push(i-1);if(x<W-1)push(i+1);if(y>0)push(i-W);if(y<H-1)push(i+W);
  }

  const repaired=new Uint8Array(N);
  const copy=(di,si)=>{
    const d=di*4,s=si*4;
    data[d]=data[s];data[d+1]=data[s+1];data[d+2]=data[s+2];data[d+3]=255;
    repaired[di]=1;
  };

  // 1) Reflect real border texture horizontally. This preserves much more texture
  // than a flat nearest-pixel extension on tree / water / pavement backgrounds.
  for(let y=0;y<H;y++){
    const row=y*W;let left=-1,right=-1;
    for(let x=0;x<W;x++){if(!transparent[row+x]){left=x;break;}}
    for(let x=W-1;x>=0;x--){if(!transparent[row+x]){right=x;break;}}
    if(left<0||right<0)continue;
    for(let x=0;x<left;x++){
      const i=row+x;if(!connected[i])continue;
      const sx=Math.min(right,left+(left-x));
      copy(i,row+sx);
    }
    for(let x=W-1;x>right;x--){
      const i=row+x;if(!connected[i])continue;
      const sx=Math.max(left,right-(x-right));
      copy(i,row+sx);
    }
  }

  // 2) Reflect vertically for top/bottom border holes not solved above.
  for(let x=0;x<W;x++){
    let top=-1,bottom=-1;
    for(let y=0;y<H;y++){const i=y*W+x;if(!transparent[i]||repaired[i]){top=y;break;}}
    for(let y=H-1;y>=0;y--){const i=y*W+x;if(!transparent[i]||repaired[i]){bottom=y;break;}}
    if(top<0||bottom<0)continue;
    for(let y=0;y<top;y++){
      const i=y*W+x;if(!connected[i]||repaired[i])continue;
      const sy=Math.min(bottom,top+(top-y));copy(i,sy*W+x);
    }
    for(let y=H-1;y>bottom;y--){
      const i=y*W+x;if(!connected[i]||repaired[i])continue;
      const sy=Math.max(top,bottom-(y-bottom));copy(i,sy*W+x);
    }
  }

  // 3) Remaining irregular border-connected pockets: propagate the nearest
  // reconstructed/real neighbour. This is still restricted to border holes.
  qh=0;qt=0;
  const source=new Int32Array(N);source.fill(-1);
  for(let i=0;i<N;i++){
    if(!connected[i]||repaired[i])continue;
    const x=i%W,y=(i/W)|0;
    let s=-1;
    if(x>0&&(!transparent[i-1]||repaired[i-1]))s=i-1;
    else if(x<W-1&&(!transparent[i+1]||repaired[i+1]))s=i+1;
    else if(y>0&&(!transparent[i-W]||repaired[i-W]))s=i-W;
    else if(y<H-1&&(!transparent[i+W]||repaired[i+W]))s=i+W;
    if(s>=0){source[i]=s;queue[qt++]=i;}
  }
  while(qh<qt){
    const i=queue[qh++],s=source[i];
    if(s>=0&&!repaired[i])copy(i,s);
    const x=i%W,y=(i/W)|0;
    const visit=n=>{
      if(n<0||n>=N||!connected[n]||repaired[n]||source[n]>=0)return;
      source[n]=i;queue[qt++]=n;
    };
    if(x>0)visit(i-1);if(x<W-1)visit(i+1);if(y>0)visit(i-W);if(y<H-1)visit(i+W);
  }

  let repairedPixels=0,remaining=0;
  for(let i=0;i<N;i++){
    if(repaired[i])repairedPixels++;
    if(data[i*4+3]<8)remaining++;
  }
  ctx.putImageData(img,0,0);
  return {
    repairedPixels,
    repairedPercent:pct(repairedPixels/Math.max(1,N)),
    remainingTransparentPercent:pct(remaining/Math.max(1,N)),
    mode:'border-connected-texture-extension'
  };
}

export function cameraPlan(metadata,maxDisparity=0.018,focusDepth){
  const d=clamp(Number(maxDisparity)||0,0,.2);
  const zNear=Math.max(.05,Number(metadata.depth.near)||1);
  const halfRange=d*metadata.diagonal*zNear;
  const focus=Math.max(.05,Number(focusDepth)||metadata.depth.focus||metadata.depth.median||1);
  const views=Array.from({length:9},(_,i)=>{
    const normal=(i-4)/4;
    return {
      index:i+1,
      normal,
      eyeX:Number((normal*halfRange).toFixed(6)),
      eyeY:0,
      eyeZ:0,
      focusDepth:Number(focus.toFixed(6))
    };
  });
  return {
    maxDisparity:d,
    cameraHalfRangeMeters:Number(halfRange.toFixed(6)),
    cameraHalfRangeMillimeters:Number((halfRange*1000).toFixed(2)),
    focusDepth:Number(focus.toFixed(6)),
    views
  };
}

export class GaussianNineViewStudio{
  constructor(container){
    this.container=container;
    this.scene=new THREE.Scene();
    this.camera=new THREE.PerspectiveCamera(45,4/3,.01,500);
    this.camera.up.set(0,-1,0);
    this.renderer=new THREE.WebGLRenderer({
      antialias:true,
      alpha:true,
      preserveDrawingBuffer:true,
      powerPreference:'high-performance'
    });
    this.renderer.setPixelRatio(1);
    this.renderer.setClearColor(0x000000,0);
    this.renderer.outputColorSpace=THREE.SRGBColorSpace;
    this.renderer.domElement.style.width='100%';
    this.renderer.domElement.style.height='100%';
    this.renderer.domElement.style.display='block';
    this.renderer.domElement.style.objectFit='contain';
    container.appendChild(this.renderer.domElement);
    this.mesh=null;
    this.metadata=null;
    this.file=null;
    this.renderWidth=0;
    this.renderHeight=0;
  }

  async load(file,onStatus=()=>{}){
    if(!file?.name?.toLowerCase().endsWith('.ply'))throw new Error('Choisis un fichier .ply.');
    onStatus('Lecture du PLY…');
    const buffer=await file.arrayBuffer();
    const metadata=inspectGaussianPly(buffer);
    onStatus('Métadonnées lues · '+metadata.gaussianCount.toLocaleString('fr-FR')+' Gaussians');

    if(this.mesh){
      this.scene.remove(this.mesh);
      try{this.mesh.dispose();}catch{}
      this.mesh=null;
    }

    const blob=new Blob([buffer],{type:'application/octet-stream'});
    const url=URL.createObjectURL(blob);
    try{
      onStatus('Chargement du renderer Gaussian…');
      const mesh=new SplatMesh({url});
      this.scene.add(mesh);
      await mesh.initialized;
      this.mesh=mesh;
    }finally{
      URL.revokeObjectURL(url);
    }

    this.file=file;
    this.metadata=metadata;
    this.setOutputSize(metadata.image.width,metadata.image.height);
    this.setCamera(0,metadata.depth.focus);
    await this.settle(3);
    onStatus('Scène Gaussian prête.');
    return metadata;
  }

  setOutputSize(width,height,framingScale=1.14){
    const w=Math.max(64,Math.round(width)),h=Math.max(64,Math.round(height));
    this.renderWidth=w;this.renderHeight=h;
    this.renderer.setSize(w,h,false);
    this.camera.aspect=w/h;
    const fy=this.metadata?.intrinsics?.fy||h*1.07;
    const safeScale=clamp(Number(framingScale)||1.14,1,1.35);
    // Safe framing: enlarge the virtual sensor instead of cropping/scaling the PNG afterwards.
    // This keeps one identical camera framing for all 9 views and reveals extra Gaussian content
    // around the original frame, especially above the head.
    this.camera.fov=2*Math.atan((h*safeScale)/(2*fy))*180/Math.PI;
    this.camera.near=.01;
    this.camera.far=Math.max(100,Number(this.metadata?.depth?.far||50)*2);
    this.camera.updateProjectionMatrix();
    this.framingScale=safeScale;
  }

  setCamera(eyeX,focusDepth,headroomRatio=0.06){
    const focus=Math.max(.05,Number(focusDepth)||1);
    const ratio=clamp(Number(headroomRatio)||0,0,.15);
    // Translate camera AND its Y target together: optical axis stays level.
    // In OpenCV coordinates Y grows downward, so negative Y moves the camera up
    // and moves the subject down in frame, creating real headroom on all views.
    const fullHeightAtFocus=2*Math.tan(THREE.MathUtils.degToRad(this.camera.fov/2))*focus;
    const eyeY=-fullHeightAtFocus*ratio;
    this.camera.position.set(Number(eyeX)||0,eyeY,0);
    this.camera.up.set(0,-1,0);
    this.camera.lookAt(new THREE.Vector3(0,eyeY,focus));
    this.camera.updateMatrixWorld(true);
    this.headroomRatio=ratio;
  }

  async settle(frames=2){
    for(let i=0;i<frames;i++){
      await waitFrame();
      this.renderer.render(this.scene,this.camera);
    }
    this.renderer.render(this.scene,this.camera);
  }

  async snapshot(planView,focusDepth,options={}){
    if(!this.mesh||!this.metadata)throw new Error('Charge d’abord un scene.ply.');
    const maxEdge=Number(options.maxEdge)||0;
    const framingScale=clamp(Number(options.framingScale)||1.14,1,1.35);
    let w=this.metadata.image.width,h=this.metadata.image.height;
    if(maxEdge>0&&Math.max(w,h)>maxEdge){
      const s=maxEdge/Math.max(w,h);w=Math.round(w*s);h=Math.round(h*s);
    }
    if(w!==this.renderWidth||h!==this.renderHeight||Math.abs((this.framingScale||1)-framingScale)>1e-6)this.setOutputSize(w,h,framingScale);
    this.setCamera(planView.eyeX,focusDepth,options.headroomRatio??0.06);
    await this.settle(options.settleFrames??3);

    const copy=document.createElement('canvas');
    copy.width=this.renderWidth;copy.height=this.renderHeight;
    const ctx=copy.getContext('2d',{willReadFrequently:true});
    ctx.clearRect(0,0,copy.width,copy.height);
    ctx.drawImage(this.renderer.domElement,0,0,copy.width,copy.height);
    const repair=options.repairBorders===false
      ? {repairedPixels:0,repairedPercent:0,remainingTransparentPercent:null,mode:'disabled'}
      : repairBorderTransparency(copy);
    const imageData=ctx.getImageData(0,0,copy.width,copy.height);
    const qc={...analyzeAlpha(imageData),borderRepair:repair};
    const blob=await canvasBlob(copy,'image/png');
    return {blob,qc,width:copy.width,height:copy.height};
  }

  async renderViews(indices,options={},onProgress=()=>{}){
    if(!this.metadata)throw new Error('Aucune scène chargée.');
    const plan=cameraPlan(this.metadata,options.maxDisparity,options.focusDepth);
    const out=[];
    for(let n=0;n<indices.length;n++){
      const index=indices[n],pv=plan.views[index-1];
      onProgress({current:n+1,total:indices.length,index,planView:pv});
      const snap=await this.snapshot(pv,plan.focusDepth,options);
      out.push({
        index,
        name:'view_'+String(index).padStart(2,'0')+'.png',
        normal:pv.normal,
        eyeX:pv.eyeX,
        framingScale:clamp(Number(options.framingScale)||1.22,1,1.45),
        headroomRatio:clamp(Number(options.headroomRatio)??0.06,0,.15),
        ...snap
      });
      await waitFrame();
    }
    this.setOutputSize(
      options.maxEdge&&Math.max(this.metadata.image.width,this.metadata.image.height)>options.maxEdge
        ? Math.round(this.metadata.image.width*(options.maxEdge/Math.max(this.metadata.image.width,this.metadata.image.height)))
        : this.metadata.image.width,
      options.maxEdge&&Math.max(this.metadata.image.width,this.metadata.image.height)>options.maxEdge
        ? Math.round(this.metadata.image.height*(options.maxEdge/Math.max(this.metadata.image.width,this.metadata.image.height)))
        : this.metadata.image.height,
      clamp(Number(options.framingScale)||1.22,1,1.45)
    );
    this.setCamera(0,plan.focusDepth,options.headroomRatio??0.06);
    await this.settle(2);
    return {plan,views:out};
  }

  async renderThree(options={},onProgress=()=>{}){
    return this.renderViews([1,5,9],options,onProgress);
  }

  async renderNine(options={},onProgress=()=>{}){
    return this.renderViews([1,2,3,4,5,6,7,8,9],options,onProgress);
  }

  dispose(){
    if(this.mesh){
      this.scene.remove(this.mesh);
      try{this.mesh.dispose();}catch{}
    }
    this.renderer.dispose();
    this.container.innerHTML='';
  }
}

export async function makeMontage(views,columns=3,maxCell=420){
  if(!views?.length)throw new Error('Aucune vue pour le montage.');
  const bitmaps=[];
  for(const v of views)bitmaps.push(await createImageBitmap(v.blob));
  const ratio=bitmaps[0].width/bitmaps[0].height;
  const cw=Math.min(maxCell,bitmaps[0].width),ch=Math.round(cw/ratio);
  const rows=Math.ceil(bitmaps.length/columns);
  const canvas=document.createElement('canvas');
  canvas.width=cw*columns;canvas.height=ch*rows;
  const ctx=canvas.getContext('2d');
  ctx.fillStyle='#111';ctx.fillRect(0,0,canvas.width,canvas.height);
  bitmaps.forEach((bmp,i)=>{
    const x=(i%columns)*cw,y=Math.floor(i/columns)*ch;
    ctx.drawImage(bmp,x,y,cw,ch);
    ctx.fillStyle='rgba(0,0,0,.72)';ctx.fillRect(x+6,y+6,62,28);
    ctx.fillStyle='#fff';ctx.font='bold 16px -apple-system,sans-serif';
    ctx.fillText('Vue '+String(views[i].index).padStart(2,'0'),x+12,y+26);
    bmp.close();
  });
  return canvasBlob(canvas,'image/jpeg',.9);
}

export function buildManifest(metadata,rendered,profile){
  const center=rendered.views.find(v=>v.index===5);
  const worstCenter=Math.max(...rendered.views.map(v=>v.qc.transparentCenterPercent));
  const worstFull=Math.max(...rendered.views.map(v=>v.qc.transparentPercent));
  return {
    format:'MicroPlayer Gaussian 9 Views',
    version:'1.0',
    createdAt:new Date().toISOString(),
    source:{
      gaussianCount:metadata.gaussianCount,
      bytes:metadata.bytes,
      image:metadata.image,
      intrinsics:metadata.intrinsics,
      depth:metadata.depth,
      disparityMetadata:metadata.disparity
    },
    camera:{
      model:'metric-lateral-converged',
      maxDisparity:rendered.plan.maxDisparity,
      halfRangeMeters:rendered.plan.cameraHalfRangeMeters,
      halfRangeMillimeters:rendered.plan.cameraHalfRangeMillimeters,
      convergenceDepthMeters:rendered.plan.focusDepth,
      forwardMovementMeters:0,
      zOffsetMeters:0,
      positions:rendered.plan.views
    },
    output:{
      width:center?.width||rendered.views[0]?.width,
      height:center?.height||rendered.views[0]?.height,
      order:'left-to-right',
      centerView:5,
      profile,
      safeFramingScale:center?.framingScale||1.22,
      safeFramingMarginPercent:Number((((center?.framingScale||1.22)-1)*100).toFixed(1)),
      headroomRatio:center?.headroomRatio??0.06,
      headroomPercent:Number(((center?.headroomRatio??0.06)*100).toFixed(1)),
      borderRepairMode:center?.qc?.borderRepair?.mode||'unknown'
    },
    qc:{
      worstTransparentPercent:worstFull,
      worstTransparentCenterPercent:worstCenter,
      centerViewTransparentPercent:center?.qc.transparentPercent??null,
      centerViewTransparentCenterPercent:center?.qc.transparentCenterPercent??null,
      backgroundRepairRecommended:worstCenter>0.25,
      note:'QC alpha mesure les zones non couvertes par les Gaussians. Le sujet n’est jamais régénéré.'
    },
    views:rendered.views.map(v=>({
      index:v.index,
      file:v.name,
      normal:v.normal,
      eyeXMeters:v.eyeX,
      qc:v.qc
    }))
  };
}
