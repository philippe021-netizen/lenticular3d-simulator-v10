/* HappyHolo — correctif sélecteur de zone d'action
   Utilise la source fiable HappyHoloReliefState.sourceImg et évite l'écran noir.
*/
(()=>{
  'use strict';

  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

  function source(){
    const rs=window.HappyHoloReliefState;
    if(rs?.sourceImg && (rs.sourceImg.naturalWidth||rs.sourceImg.width)) return rs.sourceImg;
    const view=document.getElementById('view');
    if(view?.width&&view?.height) return view;
    return null;
  }

  function fitContain(img,W,H){
    const iw=img.naturalWidth||img.width||1, ih=img.naturalHeight||img.height||1;
    const sc=Math.min(W/iw,H/ih); const w=iw*sc,h=ih*sc;
    return {x:(W-w)/2,y:(H-h)/2,w,h};
  }

  function choose(current={},title='Définir zone action'){
    return new Promise(resolve=>{
      const img=source();
      if(!img){alert('Image source indisponible. Reviens à la photo puis réessaie.');resolve(null);return;}

      const old=document.getElementById('hhActionZoneFixModal'); if(old) old.remove();
      const modal=document.createElement('div'); modal.id='hhActionZoneFixModal';
      Object.assign(modal.style,{position:'fixed',inset:'0',zIndex:'10000050',background:'rgba(0,0,0,.96)',display:'flex',flexDirection:'column',color:'#fff',fontFamily:'-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif'});

      const top=document.createElement('div');
      Object.assign(top.style,{display:'flex',gap:'10px',alignItems:'center',padding:'10px 12px',background:'#17171a',borderBottom:'1px solid #333'});
      const cancel=document.createElement('button'); cancel.type='button'; cancel.textContent='← Annuler';
      const label=document.createElement('div'); label.textContent=title; Object.assign(label.style,{flex:'1',fontWeight:'850',fontSize:'16px'});
      const ok=document.createElement('button'); ok.type='button'; ok.textContent='✓ Valider'; ok.disabled=true;
      [cancel,ok].forEach(b=>Object.assign(b.style,{padding:'10px 13px',borderRadius:'10px',border:'1px solid #666',background:'#27272b',color:'#fff',fontWeight:'800'}));
      ok.style.background='#0a84ff'; top.append(cancel,label,ok);

      const body=document.createElement('div'); Object.assign(body.style,{flex:'1',minHeight:'0',display:'flex',alignItems:'center',justifyContent:'center',padding:'10px'});
      const canvas=document.createElement('canvas'); canvas.width=Math.min(1400,Math.max(720,window.innerWidth*2)); canvas.height=Math.min(1100,Math.max(620,(window.innerHeight-100)*2));
      Object.assign(canvas.style,{maxWidth:'100%',maxHeight:'100%',width:'100%',height:'100%',touchAction:'none',background:'#111',borderRadius:'12px'}); body.appendChild(canvas);
      const foot=document.createElement('div'); foot.textContent='Trace un rectangle autour de la zone à animer. La photo affichée est la source réelle du relief.'; Object.assign(foot.style,{padding:'9px 12px 13px',textAlign:'center',fontSize:'11px',opacity:'.78'});
      modal.append(top,body,foot); document.body.appendChild(modal);

      const ctx=canvas.getContext('2d'); let rect=null,start=null,pid=null;
      function draw(){
        const W=canvas.width,H=canvas.height;ctx.clearRect(0,0,W,H);ctx.fillStyle='#111';ctx.fillRect(0,0,W,H);
        const f=fitContain(img,W,H);ctx.drawImage(img,f.x,f.y,f.w,f.h);
        if(rect){ctx.save();ctx.strokeStyle='#0a84ff';ctx.lineWidth=Math.max(4,W/300);ctx.setLineDash([14,8]);ctx.strokeRect(rect.x,rect.y,rect.w,rect.h);ctx.fillStyle='rgba(10,132,255,.14)';ctx.fillRect(rect.x,rect.y,rect.w,rect.h);ctx.restore();}
      }
      function point(e){const r=canvas.getBoundingClientRect();return{x:(e.clientX-r.left)*canvas.width/r.width,y:(e.clientY-r.top)*canvas.height/r.height};}
      canvas.addEventListener('pointerdown',e=>{pid=e.pointerId;canvas.setPointerCapture(pid);start=point(e);rect={x:start.x,y:start.y,w:0,h:0};draw();});
      canvas.addEventListener('pointermove',e=>{if(pid!==e.pointerId||!start)return;const p=point(e);rect={x:Math.min(start.x,p.x),y:Math.min(start.y,p.y),w:Math.abs(p.x-start.x),h:Math.abs(p.y-start.y)};ok.disabled=rect.w<8||rect.h<8;draw();});
      const end=e=>{if(pid===e.pointerId){pid=null;start=null;try{canvas.releasePointerCapture(e.pointerId);}catch(_){}}};
      canvas.addEventListener('pointerup',end);canvas.addEventListener('pointercancel',end);

      cancel.onclick=()=>{modal.remove();resolve(null);};
      ok.onclick=()=>{
        if(!rect)return;
        const f=fitContain(img,canvas.width,canvas.height);
        const x1=clamp(rect.x,f.x,f.x+f.w), y1=clamp(rect.y,f.y,f.y+f.h), x2=clamp(rect.x+rect.w,f.x,f.x+f.w), y2=clamp(rect.y+rect.h,f.y,f.y+f.h);
        const out={x:clamp((x1-f.x)/f.w,0,1),y:clamp((y1-f.y)/f.h,0,1),w:clamp((x2-x1)/f.w,0,1),h:clamp((y2-y1)/f.h,0,1),kind:'rect',sourceW:img.naturalWidth||img.width||1,sourceH:img.naturalHeight||img.height||1};
        modal.remove(); resolve(out);
      };
      draw();
    });
  }

  window.HappyHoloChooseActionZone=choose;
  console.log('[HAPPYHOLO] sélecteur zones V2 corrigé · source relief fiable');
})();
