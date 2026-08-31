/* HappyHolo — correctif déhanché naturel V3.27
   Le torse se courbe latéralement sans élargissement : déplacement horizontal par lignes.
*/
(()=>{
'use strict';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function fitContain(i,W,H){const r=Math.min(W/i.naturalWidth,H/i.naturalHeight),w=i.naturalWidth*r,h=i.naturalHeight*r;return{x:(W-w)/2,y:(H-h)/2,w,h};}
function fitCover(i,W,H){const r=Math.max(W/i.naturalWidth,H/i.naturalHeight),w=i.naturalWidth*r,h=i.naturalHeight*r;return{x:(W-w)/2,y:(H-h)/2,w,h};}
function smoothstep(a,b,x){const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);}

function rowShift(yNorm,phase,intensity,W){
  // Haut du corps d'un côté, bassin de l'autre, pieds presque ancrés.
  // Une ligne entière reçoit le même déplacement => aucune dilatation horizontale.
  const A=W*0.045*intensity*phase;
  const upper=smoothstep(.10,.30,yNorm)*(1-smoothstep(.46,.60,yNorm));
  const hip=smoothstep(.42,.58,yNorm)*(1-smoothstep(.72,.86,yNorm));
  const legs=smoothstep(.60,.78,yNorm)*(1-smoothstep(.88,.98,yNorm));
  return A*(0.72*upper - 1.00*hip - 0.22*legs);
}

function drawNaturalTorso(ctx,img,fit,phase,intensity){
  const strips=96;
  const sh=img.naturalHeight/strips;
  const dh=fit.h/strips;
  for(let i=0;i<strips;i++){
    const yn=(i+.5)/strips;
    const sx=0, sy=i*sh, sw=img.naturalWidth;
    const dx=fit.x+rowShift(yn,phase,intensity,fit.w);
    const dy=fit.y+i*dh;
    ctx.drawImage(img,sx,sy,sw,sh+1,dx,dy,fit.w,dh+1);
  }
}

function install(){
  const state=window.HappyHoloActionLocal;
  if(!state||state.__naturalTorsoInstalled)return false;
  state.__naturalTorsoInstalled=true;
  const originalRender=state.renderSubject?.bind(state);
  state.renderSubject=function(subjectImg,W,H,norm){
    if(state.action!=='torso' || !state.enabled || !state.ready){
      return originalRender?originalRender(subjectImg,W,H,norm):null;
    }
    const out=document.createElement('canvas');out.width=W;out.height=H;
    const x=out.getContext('2d');
    const fit=fitCover(subjectImg,W,H);
    drawNaturalTorso(x,subjectImg,fit,clamp(norm,-1,1),clamp(Number(state.intensity)||.45,.1,1));
    return out;
  };

  function replacePreviewButton(){
    const old=document.getElementById('hhRigPreview');
    const canvas=document.getElementById('hhRigCanvas');
    if(!old||!canvas||old.dataset.naturalTorso==='1')return;
    const b=old.cloneNode(true);b.dataset.naturalTorso='1';old.replaceWith(b);
    let raf=0,running=false;
    const ctx=canvas.getContext('2d');
    function stop(){running=false;cancelAnimationFrame(raf);b.textContent='▶ Aperçu local';
      try{window.HappyHoloActionLocal?.__redrawEditor?.();}catch(_){}
    }
    b.onclick=()=>{
      if(running){stop();return;}
      if(state.action!=='torso'){
        // Pour les autres actions, on laisse l'ancien moteur via rechargement de l'éditeur.
        document.getElementById('hhRigStatus').textContent='Ce correctif vise le déhanché. Les autres actions restent inchangées.';
        return;
      }
      const img=state.subjectImg;if(!img)return;
      running=true;b.textContent='■ Arrêter aperçu';
      const box=fitContain(img,canvas.width,canvas.height),t0=performance.now();
      const loop=t=>{if(!running)return;const p=Math.sin((t-t0)/1500*Math.PI*2);ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#222';ctx.fillRect(0,0,canvas.width,canvas.height);drawNaturalTorso(ctx,img,box,p,clamp(Number(state.intensity)||.45,.1,1));raf=requestAnimationFrame(loop);};
      raf=requestAnimationFrame(loop);
      const s=document.getElementById('hhRigStatus');if(s)s.textContent='Aperçu déhanché naturel : largeur du corps conservée.';
    };
  }
  const tryInstall=()=>replacePreviewButton();
  [100,400,900,1600].forEach(ms=>setTimeout(tryInstall,ms));
  window.addEventListener('happyholo-relief-ready',()=>setTimeout(tryInstall,250));
  console.log('[HAPPYHOLO] déhanché naturel sans élargissement installé');
  return true;
}
[200,700,1400].forEach(ms=>setTimeout(install,ms));
})();