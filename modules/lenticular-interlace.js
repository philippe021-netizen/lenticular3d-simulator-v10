// Physical addressing uses absolute pixel centers, never rounded stripe widths.
const SCALE=1000000;
function settings(o){
 const {pitch,dpi,count,phase=0}=o;
 if(!Number.isFinite(pitch)||pitch<=0||pitch>300||!Number.isInteger(dpi)||dpi<1||dpi>2400||!Number.isInteger(count)||count<2||count>48||!Number.isFinite(phase))throw new Error('Pitch, résolution, vues ou décalage invalides.');
 return {pitchInt:Math.round(pitch*SCALE),den:2*dpi*SCALE,shift:2*dpi*Math.round((((phase%1)+1)%1)*SCALE),count,reverse:!!o.reverse};
}
function address(x,s){const n=(2*x+1)*s.pitchInt+s.shift,r=((n%s.den)+s.den)%s.den,v=Math.floor(r*s.count/s.den);return s.reverse?s.count-1-v:v;}
export function viewIndex(x,o){if(!Number.isInteger(x)||x<0||x>1000000)throw new Error('Coordonnée invalide.');return address(x,settings(o));}
export function pixelsForMm(mm,dpi){if(!Number.isFinite(mm)||mm<=0||!Number.isFinite(dpi)||dpi<=0)throw new Error('Dimensions invalides.');return Math.round(mm*dpi/25.4);}
export function axisMap(length,o){const s=settings(o),origin=o.origin??0;if(!Number.isInteger(length)||length<1||length>50000||!Number.isInteger(origin)||origin<0||origin+length>1000000)throw new Error('Dimension ou origine invalide.');return Uint8Array.from({length},(_,i)=>address(i+origin,s));}
export function reorderViews(views,index,delta){const result=views.slice(),next=index+delta;if(!Number.isInteger(index)||![-1,1].includes(delta)||index<0||index>=views.length||next<0||next>=views.length)return result;[result[index],result[next]]=[result[next],result[index]];return result;}
export function copyView(out,rgba,width,height,index,map,orientation='vertical'){
 if(out.length!==width*height*3||rgba.length!==width*height*4||!['vertical','horizontal'].includes(orientation)||map.length!==(orientation==='vertical'?width:height))throw new Error('Dimensions des vues incohérentes.');
 if(orientation==='horizontal'){
  for(let y=0;y<height;y++)if(map[y]===index)for(let x=0;x<width;x++){const p=y*width+x,q=p*4,r=p*3;out[r]=rgba[q];out[r+1]=rgba[q+1];out[r+2]=rgba[q+2];}
 }else for(let x=0;x<width;x++)if(map[x]===index)for(let y=0;y<height;y++){const p=y*width+x,q=p*4,r=p*3;out[r]=rgba[q];out[r+1]=rgba[q+1];out[r+2]=rgba[q+2];}
}
export function encodeTiff({width,height,dpi=600,row}){
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width*height>140000000||!Number.isInteger(dpi)||dpi<1)throw new Error('TIFF : dimensions ou résolution invalides.');
 const tags=13,extra=8+2+tags*12+4,bits=extra,xres=bits+6,yres=xres+8,offset=yres+8;
 const header=new Uint8Array(offset),d=new DataView(header.buffer);header.set([73,73]);d.setUint16(2,42,true);d.setUint32(4,8,true);d.setUint16(8,tags,true);
 const entries=[[256,4,1,width],[257,4,1,height],[258,3,3,bits],[259,3,1,1],[262,3,1,2],[273,4,1,offset],[277,3,1,3],[278,4,1,height],[279,4,1,width*height*3],[282,5,1,xres],[283,5,1,yres],[284,3,1,1],[296,3,1,2]];
 entries.forEach(([tag,type,count,value],i)=>{const p=10+i*12;d.setUint16(p,tag,true);d.setUint16(p+2,type,true);d.setUint32(p+4,count,true);d.setUint32(p+8,value,true);});
 for(let i=0;i<3;i++)d.setUint16(bits+i*2,8,true);
 for(const p of [xres,yres]){d.setUint32(p,dpi,true);d.setUint32(p+4,1,true);}
 const parts=[header];for(let y=0;y<height;y++){const r=row(y);if(!(r instanceof Uint8Array)||r.length!==width*3)throw new Error('TIFF : ligne RGB invalide.');parts.push(r);}
 return new Blob(parts,{type:'image/tiff'});
}
export function makePrintPage(rgb,w,h,{dpi=600,marks=true}={}){
 const width=pixelsForMm(210,dpi),height=pixelsForMm(297,dpi),left=Math.floor((width-w)/2),top=Math.floor((height-h)/2);
 if(left<0||top<0||rgb.length!==w*h*3)throw new Error('La photo ne tient pas sur A4.');
 const white=new Uint8Array(width*3).fill(255),gap=Math.max(2,Math.round(dpi/150)),arm=Math.max(3,Math.round(dpi/30)),thick=Math.max(1,Math.round(dpi/300));
 return {width,height,left,top,row(y){
  let line=(y>=top&&y<top+h)?white.slice():white;
  if(line!==white)line.set(rgb.subarray((y-top)*w*3,(y-top+1)*w*3),left*3);
  if(marks)for(const cy of [top-gap,top+h+gap])for(const cx of [left-gap,left+w+gap]){
   if(Math.abs(y-cy)<=arm){if(line===white)line=white.slice();const half=Math.abs(y-cy)<thick?arm:thick;for(let x=Math.max(0,cx-half);x<Math.min(width,cx+half+1);x++)line.fill(0,x*3,x*3+3);}
  }
  return line;
 }};
}
