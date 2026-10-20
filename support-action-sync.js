(() => {
  'use strict';
  const actions=new Set(['yaw3d','pivot','dual-axis','parallax','parallax-pivot','glint','headlight','explodeview']);
  window.HappyHoloSupportActionSync={render({state,plan,canvas,norm=0,renderActionFrame}){
    if(!state?.subjectImg||!state?.backgroundImg||!state?.view||typeof renderActionFrame!=='function'||!plan?.some(s=>actions.has(s?.action)))return false;
    const width=Math.min(640,state.view.width),height=Math.max(2,Math.round(width*state.view.height/state.view.width));
    if(canvas.width!==width)canvas.width=width;if(canvas.height!==height)canvas.height=height;
    renderActionFrame(Math.max(-1,Math.min(1,Number(norm)||0)),canvas);
    return true;
  }};
})();
