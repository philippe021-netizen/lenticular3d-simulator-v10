const SH_C0=0.28209479177387814;

const TYPES={
  char:{size:1,get:(v,o)=>v.getInt8(o)},uchar:{size:1,get:(v,o)=>v.getUint8(o)},
  int8:{size:1,get:(v,o)=>v.getInt8(o)},uint8:{size:1,get:(v,o)=>v.getUint8(o)},
  short:{size:2,get:(v,o)=>v.getInt16(o,true)},ushort:{size:2,get:(v,o)=>v.getUint16(o,true)},
  int16:{size:2,get:(v,o)=>v.getInt16(o,true)},uint16:{size:2,get:(v,o)=>v.getUint16(o,true)},
  int:{size:4,get:(v,o)=>v.getInt32(o,true)},uint:{size:4,get:(v,o)=>v.getUint32(o,true)},
  int32:{size:4,get:(v,o)=>v.getInt32(o,true)},uint32:{size:4,get:(v,o)=>v.getUint32(o,true)},
  float:{size:4,get:(v,o)=>v.getFloat32(o,true)},float32:{size:4,get:(v,o)=>v.getFloat32(o,true)},
  double:{size:8,get:(v,o)=>v.getFloat64(o,true)},float64:{size:8,get:(v,o)=>v.getFloat64(o,true)}
};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const sigmoid=x=>1/(1+Math.exp(-clamp(x,-20,20)));

function parseHeader(buffer){
  const max=Math.min(buffer.byteLength,65536);
  const text=new TextDecoder().decode(new Uint8Array(buffer,0,max));
  let marker='end_header\n',idx=text.indexOf(marker);
  if(idx<0){marker='end_header\r\n';idx=text.indexOf(marker);}
  if(idx<0)throw new Error('PLY: en-tête introuvable.');
  const headerEnd=idx+marker.length;
  let current=null,format='',offset=headerEnd;
  const elements=[];
  for(const raw of text.slice(0,headerEnd).split(/\r?\n/)){
    const line=raw.trim();
    if(line.startsWith('format '))format=line.split(/\s+/)[1];
    else if(line.startsWith('element ')){
      const p=line.split(/\s+/);
      current={name:p[1],count:Number(p[2]),stride:0,properties:[]};
      elements.push(current);
    }else if(line.startsWith('property ')&&current){
      const p=line.split(/\s+/);
      if(p[1]==='list')throw new Error('PLY: propriétés list non prises en charge.');
      const t=TYPES[p[1]];
      if(!t)throw new Error('PLY: type non pris en charge '+p[1]);
      current.properties.push({name:p[2],type:p[1],offset:current.stride});
      current.stride+=t.size;
    }
  }
  if(format!=='binary_little_endian')throw new Error('PLY: format attendu binary_little_endian.');
  for(const el of elements){el.offset=offset;offset+=el.count*el.stride;}
  const vertex=elements.find(e=>e.name==='vertex');
  if(!vertex)throw new Error('PLY: aucun vertex.');
  return {headerEnd,elements,vertex};
}
function prop(vertex,name){
  const p=vertex.properties.find(x=>x.name===name);
  if(!p)throw new Error('PLY: propriété manquante '+name);
  return {...p,get:TYPES[p.type].get};
}
function shader(gl,type,source){
  const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);
  if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error('Shader: '+gl.getShaderInfoLog(s));
  return s;
}
function program(gl,vs,fs){
  const p=gl.createProgram();
  gl.attachShader(p,shader(gl,gl.VERTEX_SHADER,vs));
  gl.attachShader(p,shader(gl,gl.FRAGMENT_SHADER,fs));
  gl.linkProgram(p);
  if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error('WebGL: '+gl.getProgramInfoLog(p));
  return p;
}

const VS=`#version 300 es
precision highp float;
layout(location=0) in vec3 a_position;
layout(location=1) in vec3 a_color;
layout(location=2) in float a_alpha;
layout(location=3) in float a_scale;

uniform float u_eyeX;
uniform float u_focusDepth;
uniform float u_fx;
uniform float u_fy;
uniform float u_cx;
uniform float u_cy;
uniform float u_width;
uniform float u_height;
uniform float u_near;
uniform float u_far;
uniform float u_pointGain;
uniform float u_minPoint;
uniform float u_maxPoint;

out vec3 v_color;
out float v_alpha;

void main(){
  float z=a_position.z;
  if(z<=u_near){
    gl_Position=vec4(2.0,2.0,2.0,1.0);
    gl_PointSize=1.0;
    v_color=a_color;v_alpha=0.0;return;
  }

  // Vraie translation latérale + convergence off-axis.
  // eyeX=0 reproduit exactement la caméra native du PLY.
  float xn=(a_position.x-u_eyeX)/z + u_eyeX/max(u_focusDepth,0.05);
  float yn=a_position.y/z;
  float px=u_fx*xn+u_cx;
  float py=u_fy*yn+u_cy;

  float ndcX=px/u_width*2.0-1.0;
  float ndcY=1.0-py/u_height*2.0;
  float d=clamp((z-u_near)/(u_far-u_near),0.0,1.0);
  gl_Position=vec4(ndcX,ndcY,d*2.0-1.0,1.0);

  float diameter=u_pointGain*u_fy*a_scale/max(z,0.01);
  gl_PointSize=clamp(diameter,u_minPoint,u_maxPoint);
  v_color=a_color;
  v_alpha=a_alpha;
}`;

const FS=`#version 300 es
precision highp float;
in vec3 v_color;
in float v_alpha;
out vec4 outColor;
void main(){
  vec2 q=gl_PointCoord*2.0-1.0;
  float r2=dot(q,q);
  if(r2>1.0)discard;
  float footprint=exp(-2.25*r2);
  float a=v_alpha*footprint;
  if(a<0.085)discard;
  // Opaque nearest-surface rasterization avoids order-dependent zoom/ghosting.
  outColor=vec4(v_color,1.0);
}`;

export class NativeGaussianRenderer{
  constructor(container){
    this.container=container;
    this.canvas=document.createElement('canvas');
    this.canvas.className='nativeGaussianCanvas';
    this.canvas.style.position='absolute';
    this.canvas.style.inset='0';
    this.canvas.style.width='100%';
    this.canvas.style.height='100%';
    this.canvas.style.objectFit='contain';
    const badge=container.querySelector('.viewerBadge');
    if(badge)container.insertBefore(this.canvas,badge);else container.appendChild(this.canvas);

    const gl=this.canvas.getContext('webgl2',{
      alpha:true,antialias:false,depth:true,preserveDrawingBuffer:true,
      premultipliedAlpha:false,powerPreference:'high-performance'
    });
    if(!gl)throw new Error('WebGL2 indisponible sur cet appareil.');
    this.gl=gl;
    this.program=program(gl,VS,FS);
    this.vao=gl.createVertexArray();
    this.buffers=[];
    this.count=0;
    this.metadata=null;
    this.sourceWidth=0;
    this.sourceHeight=0;

    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    gl.clearColor(0,0,0,0);

    this.uniform={};
    for(const name of ['u_eyeX','u_focusDepth','u_fx','u_fy','u_cx','u_cy','u_width','u_height','u_near','u_far','u_pointGain','u_minPoint','u_maxPoint']){
      this.uniform[name]=gl.getUniformLocation(this.program,name);
    }
  }

  _upload(location,data,size){
    const gl=this.gl,b=gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER,b);
    gl.bufferData(gl.ARRAY_BUFFER,data,gl.STATIC_DRAW);
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location,size,gl.FLOAT,false,0,0);
    this.buffers.push(b);
  }

  load(buffer,metadata,onStatus=()=>{}){
    this.disposeBuffers();
    const parsed=parseHeader(buffer),vertex=parsed.vertex,view=new DataView(buffer);
    const px=prop(vertex,'x'),py=prop(vertex,'y'),pz=prop(vertex,'z');
    const pr=prop(vertex,'f_dc_0'),pg=prop(vertex,'f_dc_1'),pb=prop(vertex,'f_dc_2');
    const po=prop(vertex,'opacity'),ps0=prop(vertex,'scale_0'),ps1=prop(vertex,'scale_1');
    const ps2=vertex.properties.find(x=>x.name==='scale_2');
    const ps2r=ps2?{...ps2,get:TYPES[ps2.type].get}:null;
    const n=vertex.count;

    onStatus('Préparation projection native · '+n.toLocaleString('fr-FR')+' Gaussians…');
    const positions=new Float32Array(n*3);
    const colors=new Float32Array(n*3);
    const alpha=new Float32Array(n);
    const scale=new Float32Array(n);

    let valid=0;
    for(let i=0;i<n;i++){
      const base=vertex.offset+i*vertex.stride;
      const x=px.get(view,base+px.offset),y=py.get(view,base+py.offset),z=pz.get(view,base+pz.offset);
      positions[i*3]=x;positions[i*3+1]=y;positions[i*3+2]=z;
      colors[i*3]=clamp(.5+SH_C0*pr.get(view,base+pr.offset),0,1);
      colors[i*3+1]=clamp(.5+SH_C0*pg.get(view,base+pg.offset),0,1);
      colors[i*3+2]=clamp(.5+SH_C0*pb.get(view,base+pb.offset),0,1);
      alpha[i]=sigmoid(po.get(view,base+po.offset));
      const a=ps0.get(view,base+ps0.offset),b=ps1.get(view,base+ps1.offset);
      const c=ps2r?ps2r.get(view,base+ps2r.offset):Math.min(a,b);
      scale[i]=Math.exp(clamp(Math.max(a,b,c),-12,2));
      if(Number.isFinite(z)&&z>0)valid++;
    }

    const gl=this.gl;
    gl.bindVertexArray(this.vao);
    this._upload(0,positions,3);
    this._upload(1,colors,3);
    this._upload(2,alpha,1);
    this._upload(3,scale,1);
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER,null);

    this.count=n;
    this.metadata=metadata;
    this.sourceWidth=metadata.image.width;
    this.sourceHeight=metadata.image.height;
    onStatus('Projection native prête · '+valid.toLocaleString('fr-FR')+' points devant la caméra.');
  }

  setSize(width,height){
    const w=Math.max(64,Math.round(width)),h=Math.max(64,Math.round(height));
    if(this.canvas.width!==w)this.canvas.width=w;
    if(this.canvas.height!==h)this.canvas.height=h;
    this.width=w;this.height=h;
  }

  render({eyeX=0,focusDepth=1,width,height,pointGain=2.35,minPoint=1.25,maxPoint=28}={}){
    if(!this.count||!this.metadata)throw new Error('Projection native non chargée.');
    const srcW=this.sourceWidth,srcH=this.sourceHeight;
    let w=Number(width)||srcW,h=Number(height)||srcH;
    this.setSize(w,h);
    const sx=w/srcW,sy=h/srcH;
    const intr=this.metadata.intrinsics;
    const near=.03;
    const far=Math.max(20,Number(this.metadata.depth?.far||10)*1.5);
    const gl=this.gl;
    gl.viewport(0,0,w,h);
    gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);
    gl.uniform1f(this.uniform.u_eyeX,Number(eyeX)||0);
    gl.uniform1f(this.uniform.u_focusDepth,Math.max(.05,Number(focusDepth)||1));
    gl.uniform1f(this.uniform.u_fx,Number(intr.fx)*sx);
    gl.uniform1f(this.uniform.u_fy,Number(intr.fy)*sy);
    gl.uniform1f(this.uniform.u_cx,Number(intr.cx)*sx);
    gl.uniform1f(this.uniform.u_cy,Number(intr.cy)*sy);
    gl.uniform1f(this.uniform.u_width,w);
    gl.uniform1f(this.uniform.u_height,h);
    gl.uniform1f(this.uniform.u_near,near);
    gl.uniform1f(this.uniform.u_far,far);
    gl.uniform1f(this.uniform.u_pointGain,pointGain);
    gl.uniform1f(this.uniform.u_minPoint,minPoint);
    gl.uniform1f(this.uniform.u_maxPoint,maxPoint);
    gl.drawArrays(gl.POINTS,0,this.count);
    gl.bindVertexArray(null);
    gl.flush();
    return this.canvas;
  }

  renderToCanvas(options={}){
    const srcW=this.sourceWidth,srcH=this.sourceHeight;
    const maxEdge=Number(options.maxEdge)||0;
    let w=srcW,h=srcH;
    if(maxEdge>0&&Math.max(w,h)>maxEdge){
      const s=maxEdge/Math.max(w,h);w=Math.round(w*s);h=Math.round(h*s);
    }
    this.render({...options,width:w,height:h});
    const out=document.createElement('canvas');
    out.width=w;out.height=h;
    const ctx=out.getContext('2d',{alpha:true,willReadFrequently:true});
    ctx.clearRect(0,0,w,h);
    ctx.drawImage(this.canvas,0,0,w,h);
    return out;
  }

  disposeBuffers(){
    const gl=this.gl;
    for(const b of this.buffers)try{gl.deleteBuffer(b);}catch{}
    this.buffers=[];
    this.count=0;
  }

  dispose(){
    this.disposeBuffers();
    try{this.gl.deleteVertexArray(this.vao);}catch{}
    try{this.gl.deleteProgram(this.program);}catch{}
    try{this.canvas.remove();}catch{}
  }
}
