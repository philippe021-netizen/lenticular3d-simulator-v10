// Live 3D mesh preview driven by the same depth map as the card simulator.
// Lightweight WebGL1: a textured grid is displaced in Z and lit from its depth slope.
const VS = [
  'attribute vec2 aUv;',
  'uniform sampler2D uDepth;',
  'uniform float uAngle;',
  'uniform float uRelief;',
  'varying vec2 vUv;',
  'void main(){',
  '  vUv=aUv;',
  '  float z=(texture2D(uDepth,aUv).r-0.5)*uRelief;',
  '  float x=(aUv.x-0.5)*2.0;',
  '  float y=(0.5-aUv.y)*2.0;',
  '  float c=cos(uAngle),s=sin(uAngle);',
  '  float rx=x*c+z*s;',
  '  float rz=-x*s+z*c;',
  '  float camera=3.6;',
  '  float perspective=camera/(camera-rz);',
  '  gl_Position=vec4(rx*perspective*0.78,y*perspective*0.78,rz/5.0,1.0);',
  '}'
].join('\n');
const FS = [
  'precision mediump float;',
  'uniform sampler2D uColor;',
  'uniform sampler2D uDepth;',
  'uniform vec2 uTexel;',
  'uniform float uRelief;',
  'varying vec2 vUv;',
  'void main(){',
  '  float l=texture2D(uDepth,vUv-vec2(uTexel.x,0.0)).r;',
  '  float r=texture2D(uDepth,vUv+vec2(uTexel.x,0.0)).r;',
  '  float t=texture2D(uDepth,vUv-vec2(0.0,uTexel.y)).r;',
  '  float b=texture2D(uDepth,vUv+vec2(0.0,uTexel.y)).r;',
  '  vec3 normal=normalize(vec3((l-r)*uRelief*6.0,(b-t)*uRelief*6.0,1.0));',
  '  vec3 lightDir=normalize(vec3(-0.45,0.65,1.0));',
  '  float light=0.62+0.48*max(0.0,dot(normal,lightDir));',
  '  vec3 color=texture2D(uColor,vUv).rgb;',
  '  gl_FragColor=vec4(color*light,1.0);',
  '}'
].join('\n');
function shader(gl,type,source){
  const value=gl.createShader(type);gl.shaderSource(value,source);gl.compileShader(value);
  if(!gl.getShaderParameter(value,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(value)||'Shader 3D invalide');
  return value;
}
function link(gl){
  const p=gl.createProgram();gl.attachShader(p,shader(gl,gl.VERTEX_SHADER,VS));gl.attachShader(p,shader(gl,gl.FRAGMENT_SHADER,FS));gl.linkProgram(p);
  if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(p)||'Programme 3D indisponible');
  return p;
}
export function createCardMeshPreview(canvas){
  const gl=canvas.getContext('webgl',{alpha:false,antialias:true,preserveDrawingBuffer:false})||canvas.getContext('experimental-webgl',{alpha:false,antialias:true});
  if(!gl)throw new Error('WebGL indisponible sur ce navigateur.');
  const program=link(gl),cols=180,rows=112,uv=[],indices=[];
  for(let y=0;y<=rows;y++)for(let x=0;x<=cols;x++)uv.push(x/cols,y/rows);
  for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){const a=y*(cols+1)+x,b=a+1,c=a+cols+1,d=c+1;indices.push(a,c,b,b,c,d)}
  const uvBuffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,uvBuffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(uv),gl.STATIC_DRAW);
  const indexBuffer=gl.createBuffer();gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,indexBuffer);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array(indices),gl.STATIC_DRAW);
  const aUv=gl.getAttribLocation(program,'aUv'),uColor=gl.getUniformLocation(program,'uColor'),uDepth=gl.getUniformLocation(program,'uDepth'),uAngle=gl.getUniformLocation(program,'uAngle'),uRelief=gl.getUniformLocation(program,'uRelief'),uTexel=gl.getUniformLocation(program,'uTexel');
  function texture(unit,filter){const t=gl.createTexture();gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,t);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,filter);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,filter);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);return t}
  const colorTexture=texture(0,gl.LINEAR),depthTexture=texture(1,gl.LINEAR);
  gl.useProgram(program);gl.uniform1i(uColor,0);gl.uniform1i(uDepth,1);
  gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.disable(gl.CULL_FACE);
  function draw(pixels,depth,width,height,angle,relief=0.9){
    if(!pixels||!depth||!width||!height)return;
    const cssW=canvas.clientWidth||560,cssH=canvas.clientHeight||Math.round(cssW*height/width),dpr=Math.min(1.5,window.devicePixelRatio||1),vw=Math.max(1,Math.round(cssW*dpr)),vh=Math.max(1,Math.round(cssH*dpr));
    if(canvas.width!==vw||canvas.height!==vh){canvas.width=vw;canvas.height=vh}
    gl.viewport(0,0,vw,vh);gl.clearColor(0.94,0.94,0.92,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
    gl.useProgram(program);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,colorTexture);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,width,height,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array(pixels.buffer,pixels.byteOffset,pixels.byteLength));
    gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,depthTexture);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.LUMINANCE,width,height,0,gl.LUMINANCE,gl.UNSIGNED_BYTE,new Uint8Array(depth));
    gl.bindBuffer(gl.ARRAY_BUFFER,uvBuffer);gl.enableVertexAttribArray(aUv);gl.vertexAttribPointer(aUv,2,gl.FLOAT,false,0,0);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,indexBuffer);
    gl.uniform1f(uAngle,(Number(angle)||0)*Math.PI/180);gl.uniform1f(uRelief,Math.max(0.05,Number(relief)||0.9));gl.uniform2f(uTexel,1/width,1/height);
    gl.drawElements(gl.TRIANGLES,indices.length,gl.UNSIGNED_SHORT,0);
  }
  return {draw};
}
