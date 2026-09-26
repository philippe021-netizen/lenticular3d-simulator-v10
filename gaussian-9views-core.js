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
  const original=new Uint8ClampedArray(data);
  const hole=new Uint8Array(N);
  let holesBefore=0;
  for(let i=0;i<N;i++){
    if(original[i*4+3]<16){hole[i]=1;holesBefore++;}
  }
  if(!holesBefore)return {
    repairedPixels:0,repairedPercent:0,
    borderRepairedPixels:0,borderRepairedPercent:0,
    interiorRepairedPixels:0,interiorRepairedPercent:0,
    remainingTransparentPercent:0,mode:'background-directed-inpaint'
  };

  // Classify holes that touch the outer frame.
  const borderHole=new Uint8Array(N),queue=new Int32Array(N);
  let qh=0,qt=0;
  const push=i=>{if(i>=0&&i<N&&hole[i]&&!borderHole[i]){borderHole[i]=1;queue[qt++]=i;}};
  for(let x=0;x<W;x++){push(x);push((H-1)*W+x);}
  for(let y=1;y<H-1;y++){push(y*W);push(y*W+W-1);}
  while(qh<qt){
    const i=queue[qh++],x=i%W,y=(i/W)|0;
    if(x>0)push(i-1);if(x<W-1)push(i+1);if(y>0)push(i-W);if(y<H-1)push(i+W);
  }

  const cx=(W-1)/2,cy=(H-1)/2;
  const maxSearch=Math.round(Math.max(W,H)*.28);
  const isGood=(x,y)=>{
    if(x<0||x>=W||y<0||y>=H)return false;
    return original[(y*W+x)*4+3]>=96;
  };
  const patchColor=(x,y)=>{
    let r=0,g=0,b=0,n=0;
    for(let oy=-2;oy<=2;oy++)for(let ox=-2;ox<=2;ox++){
      const xx=x+ox,yy=y+oy;
      if(!isGood(xx,yy))continue;
      const p=(yy*W+xx)*4;
      r+=original[p];g+=original[p+1];b+=original[p+2];n++;
    }
    if(!n)return null;
    return [Math.round(r/n),Math.round(g/n),Math.round(b/n)];
  };
  const write=(i,color)=>{
    if(!color)return false;
    const p=i*4;data[p]=color[0];data[p+1]=color[1];data[p+2]=color[2];data[p+3]=255;return true;
  };

  function findBackgroundSample(x,y,isBorder){
    let dx=0,dy=0;
    if(isBorder){
      // For outer holes move inward, then deliberately skip the fragile contour
      // before sampling a stable patch.
      const dl=x,dr=W-1-x,dt=y,db=H-1-y;
      const m=Math.min(dl,dr,dt,db);
      if(m===dl)dx=1;else if(m===dr)dx=-1;else if(m===dt)dy=1;else dy=-1;
    }else{
      // Interior disocclusion: move away from the centered subject. This avoids
      // borrowing hair/skin/clothes as "background".
      const nx=(x-cx)/(W/2),ny=(y-cy)/(H/2);
      if(Math.abs(nx)>=Math.abs(ny)){dx=nx<0?-1:1;}else{dy=ny<0?-1:1;}
    }

    let first=-1;
    for(let s=1;s<=maxSearch;s++){
      const xx=Math.round(x+dx*s),yy=Math.round(y+dy*s);
      if(xx<0||xx>=W||yy<0||yy>=H)break;
      if(isGood(xx,yy)){first=s;break;}
    }
    if(first<0){
      // Opposite direction fallback.
      dx=-dx;dy=-dy;
      for(let s=1;s<=maxSearch;s++){
        const xx=Math.round(x+dx*s),yy=Math.round(y+dy*s);
        if(xx<0||xx>=W||yy<0||yy>=H)break;
        if(isGood(xx,yy)){first=s;break;}
      }
    }
    if(first<0)return null;

    // Skip 6–18 px beyond the first opaque contour so the sample comes from
    // stable background, not from the edge of hair/body/tree splats.
    const skip=Math.max(6,Math.min(18,Math.round(Math.max(W,H)*.008)));
    for(let extra=skip;extra>=0;extra-=3){
      const sx=Math.round(x+dx*(first+extra)),sy=Math.round(y+dy*(first+extra));
      const color=patchColor(sx,sy);
      if(color)return color;
    }
    return null;
  }

  let repairedPixels=0,borderRepairedPixels=0,interiorRepairedPixels=0;
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
    const i=y*W+x;if(!hole[i])continue;
    const isBorder=!!borderHole[i];
    let color=findBackgroundSample(x,y,isBorder);
    if(!color){
      // Last-resort local background sample. It still never overwrites opaque pixels.
      const dirs=[[1,0],[-1,0],[0,1],[0,-1]];
      for(const [dx,dy] of dirs){
        for(let s=8;s<=maxSearch;s+=4){
          const sx=x+dx*s,sy=y+dy*s;
          color=patchColor(sx,sy);
          if(color)break;
        }
        if(color)break;
      }
    }
    if(write(i,color)){
      repairedPixels++;
      if(isBorder)borderRepairedPixels++;else interiorRepairedPixels++;
    }
  }

  // Gentle seam relaxation only inside pixels we filled.
  const filled=new Uint8Array(N);
  for(let i=0;i<N;i++)if(hole[i]&&data[i*4+3]===255)filled[i]=1;
  const tmp=new Uint8ClampedArray(data);
  for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++){
    const i=y*W+x;if(!filled[i])continue;
    let r=0,g=0,b=0,n=0;
    for(let oy=-1;oy<=1;oy++)for(let ox=-1;ox<=1;ox++){
      const q=((y+oy)*W+x+ox)*4;
      if(tmp[q+3]<64)continue;
      r+=tmp[q];g+=tmp[q+1];b+=tmp[q+2];n++;
    }
    if(n){
      const p=i*4;
      data[p]=Math.round(r/n);data[p+1]=Math.round(g/n);data[p+2]=Math.round(b/n);data[p+3]=255;
    }
  }

  let remaining=0;
  for(let i=0;i<N;i++)if(data[i*4+3]<16)remaining++;
  ctx.putImageData(img,0,0);
  return {
    repairedPixels,
    repairedPercent:pct(repairedPixels/Math.max(1,N)),
    borderRepairedPixels,
    borderRepairedPercent:pct(borderRepairedPixels/Math.max(1,N)),
    interiorRepairedPixels,
    interiorRepairedPercent:pct(interiorRepairedPixels/Math.max(1,N)),
    remainingTransparentPercent:pct(remaining/Math.max(1,N)),
    mode:'background-directed-inpaint'
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

export function assessTopCoverage(coverageBounds,height,thresholdPercent=12){
  const h=Number(height);
  if(!coverageBounds||!Number.isFinite(h)||h<=0||!Number.isFinite(Number(coverageBounds.y)))
    return {warning:false,upperBlankPercent:null,message:'Couverture haute non mesurable.'};
  const upperBlankPercent=Number((Math.max(0,Number(coverageBounds.y))/h*100).toFixed(1));
  const warning=upperBlankPercent>=thresholdPercent;
  return {
    warning,
    upperBlankPercent,
    message:warning
      ? 'Aucun point géométrique PLY dans les '+upperBlankPercent+' % supérieurs du cadre. Si le sujet devait s’y trouver, ces données géométriques PLY absentes ne peuvent pas être recréées par MicroPlayer.'
      : 'La géométrie PLY couvre la partie haute du cadre.'
  };
}

export class GaussianNineViewStudio{
  constructor(container){
    this.container=container;
    this.scene=null;
    this.camera=null;
    this.renderer=null;
    this.spark=null;
    this.THREE=null;
    this.mesh=null;
    this.metadata=null;
    this.file=null;
    this.renderWidth=0;
    this.renderHeight=0;
    this.rendererPromise=null;
  }

  async ensureRenderer(){
    if(this.renderer)return;
    if(this.rendererPromise)return this.rendererPromise;
    this.rendererPromise=(async()=>{
      const [THREE,Spark]=await Promise.all([
        import('three'),
        import('@sparkjsdev/spark')
      ]);
      this.THREE=THREE;
      this.scene=new THREE.Scene();
      this.camera=new THREE.PerspectiveCamera(45,4/3,.01,500);
      this.camera.up.set(0,-1,0);
      this.renderer=new THREE.WebGLRenderer({
        antialias:false,
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
      this.spark=new Spark.SparkRenderer({renderer:this.renderer,sortRadial:false});
      this.scene.add(this.spark);
      this.container.appendChild(this.renderer.domElement);
    })();
    try{await this.rendererPromise;}catch(error){this.rendererPromise=null;throw error;}
  }

  async load(file,onStatus=()=>{}){
    if(!file?.name?.toLowerCase().endsWith('.ply'))throw new Error('Choisis un fichier .ply.');
    onStatus('Lecture du PLY…');
    const buffer=await file.arrayBuffer();
    const metadata=inspectGaussianPly(buffer);
    onStatus('Métadonnées lues · '+metadata.gaussianCount.toLocaleString('fr-FR')+' Gaussians');
    await this.ensureRenderer();

    if(this.mesh){
      this.scene.remove(this.mesh);
      try{this.mesh.dispose();}catch{}
      this.mesh=null;
    }

    const blob=new Blob([buffer],{type:'application/octet-stream'});
    const url=URL.createObjectURL(blob);
    try{
      onStatus('Chargement des ellipsoïdes Gaussian avec SparkJS…');
      const mesh=new (await import('@sparkjsdev/spark')).SplatMesh({url});
      this.scene.add(mesh);
      await mesh.initialized;
      this.mesh=mesh;
    }finally{
      URL.revokeObjectURL(url);
    }

    this.file=file;
    this.metadata=metadata;
    this.setOutputSize(metadata.image.width,metadata.image.height);
    this.setCamera(0,metadata.depth.focus,0);
    await this.settle(3);
    onStatus('Scène Gaussian prête avec rendu SparkJS.');
    return metadata;
  }

  setOutputSize(width,height,framingScale=1){
    const w=Math.max(64,Math.round(width)),h=Math.max(64,Math.round(height));
    this.renderWidth=w;this.renderHeight=h;
    this.renderer.setSize(w,h,false);
    this.camera.aspect=w/h;
    const fy=this.metadata?.intrinsics?.fy||h*1.07;
    const safeScale=clamp(Number(framingScale)||1,1,1.45);
    this.camera.fov=2*Math.atan((h*safeScale)/(2*fy))*180/Math.PI;
    this.camera.near=.01;
    this.camera.far=Math.max(100,Number(this.metadata?.depth?.far||50)*2);
    this.camera.updateProjectionMatrix();
    this.framingScale=safeScale;
  }

  setCamera(eyeX,focusDepth,headroomRatio=0){
    const THREE=this.THREE;
    const focus=Math.max(.05,Number(focusDepth)||1);
    const ratio=clamp(Number(headroomRatio)||0,0,.15);
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
    const framingScale=clamp(Number(options.framingScale)||1,1,1.45);
    let w=this.metadata.image.width,h=this.metadata.image.height;
    if(maxEdge>0&&Math.max(w,h)>maxEdge){
      const s=maxEdge/Math.max(w,h);w=Math.round(w*s);h=Math.round(h*s);
    }
    if(w!==this.renderWidth||h!==this.renderHeight||Math.abs((this.framingScale||1)-framingScale)>1e-6)this.setOutputSize(w,h,framingScale);
    this.setCamera(planView.eyeX,focusDepth,options.headroomRatio??0);
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
        framingScale:clamp(Number(options.framingScale)||1,1,1.45),
        headroomRatio:clamp(Number(options.headroomRatio)||0,0,.15),
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
      clamp(Number(options.framingScale)||1,1,1.45)
    );
    this.setCamera(0,plan.focusDepth,options.headroomRatio??0);
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
      this.scene?.remove(this.mesh);
      try{this.mesh.dispose();}catch{}
    }
    this.spark?.dispose?.();
    this.renderer?.dispose();
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
      model:'sparkjs-gaussian-lateral-converged',
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
      projectionMode:'sparkjs-covariance-aware-gaussian-renderer',
      centerViewNativeProjection:true,
      autoFit:false,
      autoCenter:false,
      autoZoom:false,
      maxSideFramingScale:Math.max(...rendered.views.map(v=>v.framingScale||1)),
      maxSideFramingMarginPercent:Number(((Math.max(...rendered.views.map(v=>v.framingScale||1))-1)*100).toFixed(1)),
      headroomRatio:0,
      headroomPercent:0,
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
