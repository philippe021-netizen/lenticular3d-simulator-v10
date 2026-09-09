(()=>{'use strict';
const nativeWrite=Document.prototype.write;
if(nativeWrite.__hhV21DepthHook)return;
function patchHtml(s){
  if(typeof s!=='string')return s;
  s=s.replaceAll('tiefling-v21-bg-zones.js?v=537','tiefling-v21-bg-zones.js?v=538');
  if(!s.includes('function warpBg(outW,outH,t,amp){')||s.includes('HappyHoloV21Depth'))return s;
  const hook=`let hhBDepthBase=null;function hhCloneDepth(v){return new ImageData(new Uint8ClampedArray(v.data),v.width,v.height)}function hhDepthBase(){if(!bDepth)return false;hhBDepthBase=hhCloneDepth(bDepth);return true}window.HappyHoloV21Depth={sync(){return hhDepthBase()},applyZones(zones){if(!bDepth)throw new Error('Carte de profondeur du fond indisponible');if(!hhBDepthBase||hhBDepthBase.width!==bDepth.width||hhBDepthBase.height!==bDepth.height)hhDepthBase();const out=hhCloneDepth(hhBDepthBase),od=out.data,w=out.width,h=out.height;for(const z of(zones||[])){if(!z||!z.mask)continue;const src=document.createElement('canvas');src.width=z.mask.width;src.height=z.mask.height;src.getContext('2d').putImageData(z.mask,0,0);const mc=document.createElement('canvas');mc.width=w;mc.height=h;const mx=mc.getContext('2d',{willReadFrequently:true});mx.filter='blur(4px)';mx.drawImage(src,0,0,w,h);mx.filter='none';const md=mx.getImageData(0,0,w,h).data,target=Math.max(8,Math.min(247,128+(+z.depth||0)*1.15));for(let i=0;i<w*h;i++){const a=md[i*4+3]/255;if(a<.008)continue;const o=i*4,v=od[o]*(1-a)+target*a;od[o]=od[o+1]=od[o+2]=v;od[o+3]=255}}bDepth=out;const bd=$('bd');if(bd){bd.width=out.width;bd.height=out.height;bd.getContext('2d').putImageData(out,0,0)}if(subject&&sDepth&&bg)build();return true},reset(){if(!hhBDepthBase)return false;bDepth=hhCloneDepth(hhBDepthBase);const bd=$('bd');if(bd){bd.width=bDepth.width;bd.height=bDepth.height;bd.getContext('2d').putImageData(bDepth,0,0)}if(subject&&sDepth&&bg)build();return true},refreshBase(){return hhDepthBase()}};`;
  return s.replace('function warpBg(outW,outH,t,amp){',hook+'function warpBg(outW,outH,t,amp){');
}
function wrappedWrite(...args){return nativeWrite.call(this,...args.map(a=>patchHtml(String(a))))}
wrappedWrite.__hhV21DepthHook=true;
Document.prototype.write=wrappedWrite;
})();