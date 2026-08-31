/* HappyHolo — mains 5/6 suivent le mouvement articulé du buste.
   Correctif non destructif : mémorise les points de repos et anime visuellement
   les mains avec les épaules pendant le déhanché au lieu de les laisser figées.
*/
(()=>{
'use strict';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function install(){
  const rig=window.HappyHoloActionLocal;
  if(!rig||rig.__handsFollowInstalled)return false;
  rig.__handsFollowInstalled=true;
  rig.handFollow=.72;
  rig.getAnimatedPoints=function(norm){
    const base=(rig.normalizedPoints||[]).map(p=>({x:p.x,y:p.y}));
    if(base.length<8)return base;
    const t=clamp(Number(norm)||0,-1,1),k=clamp(Number(rig.intensity)||.45,.1,1);
    if(rig.action==='torso'){
      const sway=t*k;
      // Points normalisés : 2/3 épaules, 4/5 mains, 6 bassin, 7 pieds.
      // Les deux épaules partent ensemble ; chaque main suit son épaule à ~72 %.
      const shoulder=.032*sway;
      const hip=-.045*sway;
      base[1].x+=shoulder*.45;
      base[2].x+=shoulder;
      base[3].x+=shoulder;
      base[4].x+=shoulder*rig.handFollow;
      base[5].x+=shoulder*rig.handFollow;
      base[6].x+=hip;
      base[7].x+=hip*.18;
    }else if(rig.action==='wave'){
      const lift=((t+1)/2)*k;
      base[5].x+=.045*lift;base[5].y-=.155*lift;
      base[3].x+=.015*lift;base[3].y-=.025*lift;
    }else if(rig.action==='headTurn'){
      base[0].x+=.04*t*k;base[1].x+=.012*t*k;
    }
    return base;
  };
  window.dispatchEvent(new CustomEvent('happyholo-action-plan-changed'));
  console.log('[HAPPYHOLO] hands follow fix installed');
  return true;
}
[100,400,900,1600,2800].forEach(ms=>setTimeout(install,ms));
window.addEventListener('happyholo-relief-ready',()=>setTimeout(install,150));
})();
