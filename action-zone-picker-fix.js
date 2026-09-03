/* HappyHolo — sélecteur libre de zone d'action
   Restaure le tracé libre au Pencil/doigt et renvoie un masque kind:'paint'
   compatible reflet, phares, aperçu support et 9 vues.
*/
(()=>{
  'use strict';
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  function source(){
    const rs=window.HappyHoloReliefState;
    if(rs?.sourceImg&&(rs.sourceImg.naturalWidth||rs.sourceImg.width))return rs.sourceImg;
    if(rs?.subjectImg&&(rs.subjectImg.naturalWidth||rs.subjectImg.width))return rs.subjectImg;
    const v=document.getElementById('view');return v?.width&&v?.height?v:null;
  }
  function fit(img,W,H){const iw=img.naturalWidth||img.width||1,ih=img.naturalHeight||img.height||1,sc=Math.min(W/iw,H/ih),w=iw*sc,h=ih*sc;return{x:(W-w)/2,y:(H-h)/2,w,h};}
  function choose(current={},title='Définir zone action'){
    return new Promise(resolve=>{
      const img=source();if(!img){alert('Image source indisponible.');resolve(null);return;}
      document.getElementById('hhActionZoneFixModal')?.remove();
      const modal=document.createElement('div');modal.id='hhActionZoneFixModal';Object.assign(modal.style,{position:'fixed',inset:'0',zIndex:'10000050',background:'rgba(0,0,0,.97)',display:'flex',flexDirection:'column',color:'#fff',fontFamily:'-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif'});
      const top=document.createElement('div');Object.assign(top.style,{display:'flex',gap:'8px',alignItems:'center',padding:'9px 10px',background:'#17171a',borderBottom:'1px solid #333'});
      const cancel=document.createElement('button'),label=document.createElement('div'),clear=document.createElement('button'),ok=document.createElement('button');cancel.textContent='← Annuler';clear.textContent='Effacer';ok.textContent='✓ Valider';label.textContent=title;Object.assign(label.style,{flex:'1',fontWeight:'850',fontSize:'15px'});[cancel,clear,ok].forEach(b=>Object.assign(b.style,{padding:'9px 11px',borderRadius:'9px',border:'1px solid #666',background:'#29292d',color:'#fff',fontWeight:'800'}));ok.style.background='#0a84ff';top.append(cancel,label,clear,ok);
      const tools=document.createElement('div');Object.assign(tools.style,{display:'flex',gap:'8px',alignItems:'center',padding:'7px 10px',background:'#202024',fontSize:'12px'});tools.innerHTML='<span>Épaisseur</span><input id="hhZoneBrush" type="range" min="6" max="70" value="28" style="flex:1"><span id="hhZoneBrushOut">28</span>';
      const body=document.createElement('div');Object.assign(body.style,{flex:'1',minHeight:'0',display:'flex',alignItems:'center',justifyContent:'center',padding:'8px'});const canvas=document.createElement('canvas');canvas.width=Math.min(1500,Math.max(800,innerWidth*2));canvas.height=Math.min(1200,Math.max(650,(innerHeight-150)*2));Object.assign(canvas.style,{width:'100%',height:'100%',maxWidth:'100%',maxHeight:'100%',touchAction:'none',background:'#111',borderRadius:'12px'});body.appendChild(canvas);
      const foot=document.createElement('div');foot.textContent='Trace directement sur la zone à animer. Apple Pencil ou doigt. Plusieurs traits possibles.';Object.assign(foot.style,{padding:'8px 10px 11px',textAlign:'center',fontSize:'11px',opacity:'.8'});modal.append(top,tools,body,foot);document.body.appendChild(modal);
      const ctx=canvas.getContext('2d'),brush=tools.querySelector('#hhZoneBrush'),bout=tools.querySelector('#hhZoneBrushOut');let strokes=[],active=null,pid=null;
      if(current?.actionZone?.kind==='paint'&&Array.isArray(current.actionZone.strokes))strokes=current.actionZone.strokes.map(s=>({erase:!!s.erase,size:Number(s.size)||.02,points:(s.points||[]).map(p=>[+p[0]||0,+p[1]||0])}));
      function draw(){const W=canvas.width,H=canvas.height,f=fit(img,W,H);ctx.clearRect(0,0,W,H);ctx.fillStyle='#111';ctx.fillRect(0,0,W,H);ctx.drawImage(img,f.x,f.y,f.w,f.h);ctx.save();ctx.beginPath();ctx.rect(f.x,f.y,f.w,f.h);ctx.clip();for(const st of strokes){if(!st.points?.length)continue;ctx.strokeStyle='rgba(0,229,255,.78)';ctx.fillStyle=ctx.strokeStyle;ctx.lineCap='round';ctx.lineJoin='round';ctx.lineWidth=Math.max(3,st.size*Math.max(f.w,f.h));const p0=st.points[0];ctx.beginPath();ctx.moveTo(f.x+p0[0]*f.w,f.y+p0[1]*f.h);if(st.points.length===1){ctx.arc(f.x+p0[0]*f.w,f.y+p0[1]*f.h,ctx.lineWidth/2,0,Math.PI*2);ctx.fill();}else{for(let i=1;i<st.points.length;i++){const p=st.points[i];ctx.lineTo(f.x+p[0]*f.w,f.y+p[1]*f.h);}ctx.stroke();}}ctx.restore();}
      function normPoint(e){const r=canvas.getBoundingClientRect(),cx=(e.clientX-r.left)*canvas.width/r.width,cy=(e.clientY-r.top)*canvas.height/r.height,f=fit(img,canvas.width,canvas.height);return{x:clamp((cx-f.x)/f.w,0,1),y:clamp((cy-f.y)/f.h,0,1),inside:cx>=f.x&&cx<=f.x+f.w&&cy>=f.y&&cy<=f.y+f.h};}
      canvas.addEventListener('pointerdown',e=>{e.preventDefault();const p=normPoint(e);if(!p.inside)return;pid=e.pointerId;canvas.setPointerCapture?.(pid);active={erase:false,size:(+brush.value||28)/Math.max(canvas.width,canvas.height),points:[[p.x,p.y]]};strokes.push(active);draw();});
      canvas.addEventListener('pointermove',e=>{if(pid!==e.pointerId||!active)return;e.preventDefault();const p=normPoint(e);active.points.push([p.x,p.y]);draw();});
      const end=e=>{if(pid===e.pointerId){pid=null;active=null;try{canvas.releasePointerCapture(e.pointerId);}catch(_){}}};canvas.addEventListener('pointerup',end);canvas.addEventListener('pointercancel',end);
      brush.oninput=()=>bout.textContent=brush.value;clear.onclick=()=>{strokes=[];draw();};cancel.onclick=()=>{modal.remove();resolve(null);};
      ok.onclick=()=>{if(!strokes.length){alert('Trace au moins une zone.');return;}let minX=1,minY=1,maxX=0,maxY=0;for(const st of strokes)for(const p of st.points||[]){minX=Math.min(minX,p[0]);minY=Math.min(minY,p[1]);maxX=Math.max(maxX,p[0]);maxY=Math.max(maxY,p[1]);}const pad=.025;const out={kind:'paint',strokes,x:clamp(minX-pad,0,1),y:clamp(minY-pad,0,1),w:clamp(maxX-minX+pad*2,.01,1),h:clamp(maxY-minY+pad*2,.01,1),sourceW:img.naturalWidth||img.width||1,sourceH:img.naturalHeight||img.height||1};modal.remove();resolve(out);};draw();
    });
  }
  window.HappyHoloChooseActionZone=choose;
  console.log('[HAPPYHOLO] sélecteur zones libre restauré · masque paint compatible support/9 vues');
})();