const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

// Camera projection inspired by the former V32 business-card viewer. Depth
// moves each transparent layer both sideways and vertically in the camera view.
export function projectCardPlane(depth,angle,width,height,strength=1.8){
  const z=clamp(Number(depth)||0,-100,100)/100;
  const yaw=clamp(Number(angle)||0,-48,48)*Math.PI/180*.6;
  const elevation=32*Math.PI/180;
  const lift=width*.055*clamp(Number(strength)||1.8,.25,3.2)*z;
  return {
    x:-Math.sin(yaw)*lift*3.2,
    y:-Math.cos(yaw)*Math.sin(elevation)*lift*1.2,
    scale:1+z*.025*clamp(Number(strength)||1.8,.25,3.2),
    yaw
  };
}

function boxPixels(layer,width,height,padding=0){
  const [x,y,w,h]=layer.bbox||[0,0,0,0];
  const x0=clamp(Math.floor((x-padding)*width),0,width-1),y0=clamp(Math.floor((y-padding)*height),0,height-1);
  const x1=clamp(Math.ceil((x+w+padding)*width),x0+1,width),y1=clamp(Math.ceil((y+h+padding)*height),y0+1,height);
  return{x:x0,y:y0,w:x1-x0,h:y1-y0,area:(x1-x0)*(y1-y0)};
}

function makeCanvas(width,height){const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;return canvas}
function compile(gl,type,source){const shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(shader)||'Shader 3D invalide');return shader}
function createWebGLScene(canvas,base,planes,width,height){
  const gl=canvas.getContext('webgl',{alpha:false,antialias:true,preserveDrawingBuffer:false})||canvas.getContext('experimental-webgl',{alpha:false,antialias:true});
  if(!gl)return null;
  const vs='attribute vec2 p;uniform float z;uniform mat4 mvp;varying vec2 uv;void main(){uv=vec2(p.x,1.0-p.y);gl_Position=mvp*vec4((p.x-.5)*1.545,(p.y-.5),z,1.0);}';
  const fs='precision mediump float;varying vec2 uv;uniform sampler2D tex;uniform float alphaCut;void main(){vec4 c=texture2D(tex,uv);if(c.a<alphaCut)discard;gl_FragColor=c;}';
  const program=gl.createProgram();gl.attachShader(program,compile(gl,gl.VERTEX_SHADER,vs));gl.attachShader(program,compile(gl,gl.FRAGMENT_SHADER,fs));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program)||'Scène 3D indisponible');
  const vertices=new Float32Array([0,0,1,0,0,1,0,1,1,0,1,1]),buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,vertices,gl.STATIC_DRAW);
  gl.useProgram(program);const loc=gl.getAttribLocation(program,'p');gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,2,gl.FLOAT,false,0,0);
  const textureFor=source=>{const texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,true);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,source);return texture};
  const textures=new Map([[base,textureFor(base)]]);for(const plane of planes)textures.set(plane.canvas,textureFor(plane.canvas));
  const zLoc=gl.getUniformLocation(program,'z'),mvpLoc=gl.getUniformLocation(program,'mvp'),texLoc=gl.getUniformLocation(program,'tex'),cutLoc=gl.getUniformLocation(program,'alphaCut');
  gl.uniform1i(texLoc,0);gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
  const multiply=(a,b)=>{const out=new Float32Array(16);for(let r=0;r<4;r++)for(let c=0;c<4;c++)for(let k=0;k<4;k++)out[r*4+c]+=a[r*4+k]*b[k*4+c];return out};
  const normalize=v=>{const n=Math.hypot(...v)||1;return v.map(x=>x/n)};
  const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  const perspective=(fov,aspect,near,far)=>{const f=1/Math.tan(fov/2),out=new Float32Array(16);out[0]=f/aspect;out[5]=f;out[10]=(far+near)/(near-far);out[11]=-1;out[14]=2*far*near/(near-far);return out};
  const lookAt=(eye,target,up)=>{const z=normalize([eye[0]-target[0],eye[1]-target[1],eye[2]-target[2]]),x=normalize(cross(up,z)),y=cross(z,x),out=new Float32Array([x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,0,0,0,1]);out[12]=-(x[0]*eye[0]+x[1]*eye[1]+x[2]*eye[2]);out[13]=-(y[0]*eye[0]+y[1]*eye[1]+y[2]*eye[2]);out[14]=-(z[0]*eye[0]+z[1]*eye[1]+z[2]*eye[2]);return out};
  const draw=(angle,strength,currentLayers)=>{
    const dpr=Math.min(1.5,window.devicePixelRatio||1),cw=canvas.clientWidth||800,ch=canvas.clientHeight||Math.round(cw*height/width),vw=Math.max(1,Math.round(cw*dpr)),vh=Math.max(1,Math.round(ch*dpr));if(canvas.width!==vw||canvas.height!==vh){canvas.width=vw;canvas.height=vh}
    gl.viewport(0,0,vw,vh);gl.clearColor(.94,.94,.92,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.useProgram(program);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,2,gl.FLOAT,false,0,0);
    const yaw=clamp(Number(angle)||0,-48,48)*Math.PI/180*.75,eye=[Math.sin(yaw)*3.45,.78,Math.cos(yaw)*3.45],camera=multiply(perspective(34*Math.PI/180,vw/vh,.1,20),lookAt(eye,[0,0,.16],[0,1,0]));gl.uniformMatrix4fv(mvpLoc,false,camera);gl.uniform1i(texLoc,0);
    const depths=new Map((currentLayers||[]).map((layer,index)=>[layer.id||String(index),clamp(Number(layer.depth)||0,-100,100)])),ordered=planes.map(plane=>({...plane,depth:depths.get(plane.id)??plane.depth})).sort((a,b)=>a.depth-b.depth),min=Math.min(0,...ordered.map(p=>p.depth)),max=Math.max(0,...ordered.map(p=>p.depth)),span=Math.max(1,max-min),relief=clamp(Number(strength)||1.8,.25,3.2);
    const renderPlane=(source,z,cut)=>{gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,textures.get(source));gl.uniform1f(zLoc,z);gl.uniform1f(cutLoc,cut);gl.drawArrays(gl.TRIANGLES,0,6)};
    gl.depthMask(true);renderPlane(base,0,0);for(const plane of ordered)renderPlane(plane.canvas,.035+((plane.depth-min)/span)*.305*relief/1.8,.025);
  };
  return draw;
}

function reconstructBackground(pixels,width,height,layers){
  const source=new Uint8ClampedArray(pixels),unknown=new Uint8Array(width*height);
  const pad=.006;
  for(const layer of layers){const r=boxPixels(layer,width,height,pad);for(let y=r.y;y<r.y+r.h;y++)unknown.fill(1,y*width+r.x,y*width+r.x+r.w)}
  const radius=Math.max(1,Math.round(Math.min(width,height)*.006)),seed=new Uint8Array(unknown);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){if(!seed[y*width+x])continue;for(let dy=-radius;dy<=radius;dy++){const yy=y+dy;if(yy<0||yy>=height)continue;const reach=Math.floor(Math.sqrt(radius*radius-dy*dy));for(let dx=-reach;dx<=reach;dx++){const xx=x+dx;if(xx>=0&&xx<width)unknown[yy*width+xx]=1}}}
  const output=new Uint8ClampedArray(source),left=new Int32Array(width),right=new Int32Array(width),top=new Int32Array(height),bottom=new Int32Array(height);
  const mix=(dst,a,b,t)=>{const di=dst*4,ai=a*4,bi=b*4;for(let c=0;c<3;c++)output[di+c]=source[ai+c]*(1-t)+source[bi+c]*t;output[di+3]=255};
  for(let y=0;y<height;y++){
    let found=-1;for(let x=0;x<width;x++){if(!unknown[y*width+x])found=x;left[x]=found}
    found=-1;for(let x=width-1;x>=0;x--){if(!unknown[y*width+x])found=x;right[x]=found}
    for(let x=0;x<width;x++){const p=y*width+x;if(!unknown[p])continue;const l=left[x],r=right[x];if(l>=0&&r>=0&&r>l)mix(p,y*width+l,y*width+r,(x-l)/(r-l));else if(l>=0||r>=0){const q=y*width+(l>=0?l:r);output[p*4]=source[q*4];output[p*4+1]=source[q*4+1];output[p*4+2]=source[q*4+2];output[p*4+3]=255}}
  }
  for(let x=0;x<width;x++){
    let found=-1;for(let y=0;y<height;y++){if(!unknown[y*width+x])found=y;top[y]=found}
    found=-1;for(let y=height-1;y>=0;y--){if(!unknown[y*width+x])found=y;bottom[y]=found}
    for(let y=0;y<height;y++){const p=y*width+x;if(!unknown[p])continue;const t=top[y],b=bottom[y];if(t<0&&b<0)continue;const q=(t>=0?t:b)*width+x,k=p*4,j=q*4;if(t>=0&&b>=0&&b>t){const u=(y-t)/(b-t),jb=(b*width+x)*4;for(let c=0;c<3;c++)output[k+c]=(source[j+c]*(1-u)+source[jb+c]*u+output[k+c])*.5}else for(let c=0;c<3;c++)output[k+c]=(source[j+c]+output[k+c])*.5;output[k+3]=255}
  }
  return output;
}

export function createCardFloatingPlanesPreview(pixels,width,height,layers){
  const cleanLayers=(layers||[]).filter(l=>Array.isArray(l.bbox)&&l.bbox.length===4&&l.enabled!==false).map(l=>({...l,bbox:[...l.bbox]}));
  const background=reconstructBackground(pixels,width,height,cleanLayers),base=makeCanvas(width,height),baseCtx=base.getContext('2d');
  baseCtx.putImageData(new ImageData(background,width,height),0,0);
  const ownership=new Int16Array(width*height);ownership.fill(-1);
  const order=cleanLayers.map((layer,index)=>({layer,index,rect:boxPixels(layer,width,height)})).sort((a,b)=>a.rect.area-b.rect.area);
  const planes=[];
  for(const item of order){
    const {layer,rect,index}=item,rgba=new Uint8ClampedArray(width*height*4);let active=0;
    for(let y=rect.y;y<rect.y+rect.h;y++)for(let x=rect.x;x<rect.x+rect.w;x++){
      const p=y*width+x;if(ownership[p]>=0)continue;const k=p*4;
      const color=Math.sqrt((pixels[k]-background[k])**2+(pixels[k+1]-background[k+1])**2+(pixels[k+2]-background[k+2])**2);
      const left=x>rect.x?k-4:k,up=y>rect.y?k-width*4:k;
      const edge=((Math.abs(pixels[k]-pixels[left])+Math.abs(pixels[k+1]-pixels[left+1])+Math.abs(pixels[k+2]-pixels[left+2]))+(Math.abs(pixels[k]-pixels[up])+Math.abs(pixels[k+1]-pixels[up+1])+Math.abs(pixels[k+2]-pixels[up+2])))/6;
      const score=Math.max(color,edge*1.3),alpha=Math.round(clamp((score-13)/27,0,1)*255);
      if(alpha<12)continue;ownership[p]=index;rgba[k]=pixels[k];rgba[k+1]=pixels[k+1];rgba[k+2]=pixels[k+2];rgba[k+3]=alpha;active++;
    }
    if(!active)continue;
    const canvas=makeCanvas(width,height);canvas.getContext('2d').putImageData(new ImageData(rgba,width,height),0,0);
    planes.push({canvas,id:layer.id||String(index),depth:clamp(Number(layer.depth)||0,-100,100),label:layer.label||`Calque ${index+1}`,type:layer.type||'object'});
  }
  const output=makeCanvas(width,height),ctx=output.getContext('2d',{willReadFrequently:true});
  let webglDraw=null;
  try{webglDraw=createWebGLScene(document.getElementById('sim3dCanvas'),base,planes,width,height)}catch(error){console.warn('Aperçu WebGL indisponible, repli 2D :',error)}
  return{
    planes:planes.length,
    draw3D(angle=0,strength=1.8,currentLayers=cleanLayers){if(!webglDraw)return false;webglDraw(angle,strength,currentLayers);return true},
    render(angle=0,strength=1.8,currentLayers=cleanLayers){
      ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,width,height);ctx.fillStyle='#efefec';ctx.fillRect(0,0,width,height);
      const marginX=width*.065,marginY=height*.10,cardW=width-marginX*2,cardH=height-marginY*2,cx=width/2;
      const yaw=clamp(Number(angle)||0,-48,48)*Math.PI/180*.6,projectedW=cardW*Math.cos(yaw),side=(cardW-projectedW)/2;
      const draw=(image,depth)=>{
        const p=projectCardPlane(depth,angle,width,height,strength),w=projectedW*p.scale,h=cardH*p.scale,x=cx-w/2+side+p.x,y=marginY+(cardH-h)/2+p.y;
        ctx.save();ctx.setTransform(1,Math.sin(yaw)*.06,Math.sin(yaw)*.10,1,0,0);ctx.drawImage(image,x,y,w,h);ctx.restore();
      };
      ctx.save();ctx.shadowColor='rgba(0,0,0,.24)';ctx.shadowBlur=Math.max(4,width*.018);ctx.shadowOffsetY=height*.018;draw(base,0);ctx.restore();
      const depthById=new Map((currentLayers||[]).map((layer,index)=>[layer.id||String(index),clamp(Number(layer.depth)||0,-100,100)]));
      planes.map(plane=>({...plane,depth:depthById.get(plane.id)??plane.depth})).sort((a,b)=>a.depth-b.depth).forEach(plane=>draw(plane.canvas,plane.depth));
      const edge=projectedW;ctx.save();ctx.strokeStyle='rgba(25,30,36,.7)';ctx.lineWidth=Math.max(1,width/500);ctx.setTransform(1,Math.sin(yaw)*.06,Math.sin(yaw)*.10,1,0,0);ctx.strokeRect(cx-edge/2,marginY,edge,cardH);ctx.restore();
      return ctx.getImageData(0,0,width,height);
    }
  };
}
