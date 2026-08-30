// HappyHolo — couche texte carte réutilisable, issue de text-layer-v337 V3.4.5
export function createBusinessCardTextState(overrides={}){
  return {
    enabled:true,text:'',x:.5,y:.18,size:8,orientation:0,rotation3D:14,depth:55,
    color:'#ffffff',outline:'#111111',outlineSize:5,font:'system',...overrides
  };
}

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const fonts={
  system:'-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
  rounded:'ui-rounded,"Arial Rounded MT Bold",-apple-system,sans-serif',
  serif:'Georgia,"Times New Roman",serif',
  mono:'ui-monospace,"SFMono-Regular",Menlo,monospace'
};

export function cleanCardTextLines(state){
  return String(state?.text||'').replace(/\r/g,'').split('\n').slice(0,4).map(s=>s.trim()).filter(Boolean);
}

export function drawBusinessCardText(ctx,state,norm=0,box=null){
  const lines=cleanCardTextLines(state);
  if(!state?.enabled||!lines.length||!ctx?.canvas)return;
  const b=box||{x:0,y:0,w:ctx.canvas.width,h:ctx.canvas.height};
  const fontSize=Math.max(10,b.w*(Number(state.size)||8)/100);
  const lineHeight=fontSize*1.04;
  const depthValue=clamp(Number(state.depth)||0,-100,100);
  const parallax=Number(norm||0)*(depthValue/100)*b.w*.10;
  const angle=Number(state.orientation)||0;
  const yaw=Number(norm||0)*(Number(state.rotation3D)||0);
  const face=Math.max(.34,Math.cos(Math.abs(yaw)*Math.PI/180));
  const cx=b.x+clamp(Number(state.x)||.5,0,1)*b.w+parallax;
  const cy=b.y+clamp(Number(state.y)||.18,0,1)*b.h;
  ctx.save();
  ctx.translate(cx,cy);ctx.rotate(angle*Math.PI/180);ctx.scale(face,1);
  ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.font=`800 ${fontSize}px ${fonts[state.font]||fonts.system}`;
  ctx.lineJoin='round';ctx.miterLimit=2;
  ctx.shadowColor='rgba(0,0,0,.28)';ctx.shadowBlur=Math.max(1,fontSize*.07);ctx.shadowOffsetY=Math.max(1,fontSize*.03);
  const firstY=-(lines.length-1)*lineHeight/2;
  lines.forEach((line,i)=>{
    const y=firstY+i*lineHeight;
    const stroke=Math.max(0,Number(state.outlineSize)||0)*fontSize/100;
    if(stroke>.2){ctx.lineWidth=stroke*2;ctx.strokeStyle=state.outline||'#111111';ctx.strokeText(line,0,y,b.w*.92);}
    ctx.fillStyle=state.color||'#ffffff';ctx.fillText(line,0,y,b.w*.92);
  });
  ctx.restore();
}

export function serializeBusinessCardText(state){
  const lines=cleanCardTextLines(state);
  if(!state?.enabled||!lines.length)return null;
  return {
    text:lines.join('\n'),x:state.x,y:state.y,size:state.size,
    orientation:state.orientation,rotation3D:state.rotation3D,depth:state.depth,
    color:state.color,outline:state.outline,outlineSize:state.outlineSize,font:state.font,
    placement:Number(state.depth)<0?'behind-subject':'front'
  };
}

export function bindBusinessCardTextDrag(stage,state,onChange){
  if(!stage||!state)return()=>{};
  let dragging=false,dx=0,dy=0,pointerId=null;
  const down=e=>{
    if(!state.enabled||!cleanCardTextLines(state).length)return;
    e.preventDefault();dragging=true;pointerId=e.pointerId;stage.setPointerCapture?.(pointerId);
    const r=stage.getBoundingClientRect();dx=(e.clientX-r.left)-state.x*r.width;dy=(e.clientY-r.top)-state.y*r.height;
  };
  const move=e=>{
    if(!dragging||e.pointerId!==pointerId)return;e.preventDefault();const r=stage.getBoundingClientRect();
    state.x=clamp(((e.clientX-r.left)-dx)/r.width,0,1);state.y=clamp(((e.clientY-r.top)-dy)/r.height,0,1);onChange?.(state);
  };
  const up=e=>{if(pointerId!=null&&e.pointerId!==pointerId)return;dragging=false;pointerId=null;};
  stage.addEventListener('pointerdown',down,{passive:false});stage.addEventListener('pointermove',move,{passive:false});stage.addEventListener('pointerup',up);stage.addEventListener('pointercancel',up);
  return()=>{stage.removeEventListener('pointerdown',down);stage.removeEventListener('pointermove',move);stage.removeEventListener('pointerup',up);stage.removeEventListener('pointercancel',up);};
}

export const BUSINESS_CARD_TEXT_PRESET={x:.5,y:.18,size:8,rotation3D:14,depth:55};
