/* HappyHolo V3.18 — visibilité des zones de masque
   - couleur de masque configurable
   - opacité configurable
   - presets rouge / jaune / vert / violet
   - contour contrasté automatique
   - fonctionne sans modifier l'éditeur V3.17
*/
(() => {
  'use strict';

  const state={color:'#ff3b30',opacity:.62,outline:true};
  let modal=null, editCanvas=null, sidebar=null, panel=null;
  let scheduled=false, lastSignature='';

  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  function rgb(hex){
    let h=String(hex||'#ff3b30').replace('#','');
    if(h.length===3)h=h.split('').map(c=>c+c).join('');
    if(!/^[0-9a-f]{6}$/i.test(h))h='ff3b30';
    return [parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)];
  }
  function contrast(hex){
    const [r,g,b]=rgb(hex);const lum=.2126*r+.7152*g+.0722*b;
    return lum>145?'#000':'#fff';
  }

  function findEditor(){
    const all=[...document.querySelectorAll('div')];
    modal=all.find(d=>d.style.position==='fixed'&&Number(d.style.zIndex)>=999999&&d.textContent?.includes('Correction du sujet'))||null;
    if(!modal)return false;
    const canvases=[...modal.querySelectorAll('canvas')];
    editCanvas=canvases.find(c=>c.style.touchAction==='none')||null;
    sidebar=[...modal.querySelectorAll('div')].find(d=>d.style.overflowY==='auto'&&d.querySelector('button'))||null;
    return !!(editCanvas&&sidebar);
  }

  function makeButton(color,parent){
    const b=document.createElement('button');b.type='button';b.setAttribute('aria-label',`Couleur ${color}`);
    Object.assign(b.style,{margin:'0',padding:'0',height:'32px',borderRadius:'8px',border:'2px solid #777',background:color});
    b.addEventListener('click',()=>{state.color=color;colorInput.value=color;updateBorder();schedule();});
    parent.appendChild(b);
  }

  let colorInput,opacityInput,opacityOut,outlineInput;
  function buildPanel(){
    if(panel||!sidebar)return;
    panel=document.createElement('div');
    Object.assign(panel.style,{padding:'10px',border:'1px solid #3b3b3f',borderRadius:'12px',background:'#1e1e22',display:'flex',flexDirection:'column',gap:'8px',order:'-1'});
    const title=document.createElement('div');title.textContent='Visibilité zone';Object.assign(title.style,{fontSize:'13px',fontWeight:'850'});panel.appendChild(title);

    const row=document.createElement('label');Object.assign(row.style,{display:'flex',alignItems:'center',justifyContent:'space-between',gap:'10px',fontSize:'12px',fontWeight:'700'});
    const txt=document.createElement('span');txt.textContent='Couleur du masque';row.appendChild(txt);
    colorInput=document.createElement('input');colorInput.type='color';colorInput.value=state.color;Object.assign(colorInput.style,{width:'54px',height:'34px',padding:'0',border:'1px solid #666',borderRadius:'8px',background:'#111'});row.appendChild(colorInput);panel.appendChild(row);
    colorInput.addEventListener('input',()=>{state.color=colorInput.value;updateBorder();schedule();});

    const presets=document.createElement('div');Object.assign(presets.style,{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:'6px'});panel.appendChild(presets);
    ['#ff3b30','#ffd60a','#34c759','#af52de'].forEach(c=>makeButton(c,presets));

    const opLab=document.createElement('label');Object.assign(opLab.style,{display:'flex',flexDirection:'column',gap:'5px',fontSize:'11px'});
    const opHead=document.createElement('div');Object.assign(opHead.style,{display:'flex',justifyContent:'space-between'});const o1=document.createElement('span');o1.textContent='Opacité';opacityOut=document.createElement('b');opacityOut.textContent=`${Math.round(state.opacity*100)}%`;opHead.append(o1,opacityOut);opLab.appendChild(opHead);
    opacityInput=document.createElement('input');opacityInput.type='range';opacityInput.min='25';opacityInput.max='90';opacityInput.step='1';opacityInput.value=String(Math.round(state.opacity*100));opacityInput.style.width='100%';opLab.appendChild(opacityInput);panel.appendChild(opLab);
    opacityInput.addEventListener('input',()=>{state.opacity=Number(opacityInput.value)/100;opacityOut.textContent=`${opacityInput.value}%`;schedule();});

    const ol=document.createElement('label');Object.assign(ol.style,{display:'flex',alignItems:'center',gap:'8px',fontSize:'11px',fontWeight:'750'});outlineInput=document.createElement('input');outlineInput.type='checkbox';outlineInput.checked=true;const ot=document.createElement('span');ot.textContent='Contour contrasté automatique';ol.append(outlineInput,ot);panel.appendChild(ol);
    outlineInput.addEventListener('change',()=>{state.outline=outlineInput.checked;updateBorder();schedule();});

    const hint=document.createElement('div');hint.textContent='Pour un sujet bleu : jaune ou rouge donnent généralement le meilleur contraste.';Object.assign(hint.style,{fontSize:'10px',opacity:'.76,lineHeight:'1.3'});panel.appendChild(hint);
    sidebar.insertBefore(panel,sidebar.firstChild);
    updateBorder();
  }

  function updateBorder(){
    if(!editCanvas)return;
    const c=contrast(state.color);
    editCanvas.style.filter=state.outline
      ? `drop-shadow(0 0 1px ${c}) drop-shadow(0 0 2px ${c})`
      : 'none';
  }

  function recolor(){
    scheduled=false;
    if(!editCanvas||!modal||modal.style.display==='none')return;
    const ctx=editCanvas.getContext('2d',{willReadFrequently:true});
    if(!ctx||!editCanvas.width||!editCanvas.height)return;
    try{
      const im=ctx.getImageData(0,0,editCanvas.width,editCanvas.height),d=im.data;
      const [nr,ng,nb]=rgb(state.color),oa=clamp(state.opacity,0,1);
      for(let i=0;i<d.length;i+=4){
        const a=d[i+3];if(a<15)continue;
        const r=d[i],g=d[i+1],b=d[i+2];
        // Masque historique HappyHolo : bleu/cyan semi-transparent. Ne touche pas aux curseurs vert/rouge.
        if(b>150 && g>80 && b>r*1.25 && Math.abs(b-g)<150){
          d[i]=nr;d[i+1]=ng;d[i+2]=nb;d[i+3]=Math.max(a,Math.round(255*oa));
        }
      }
      ctx.putImageData(im,0,0);
    }catch(_){ }
  }

  function schedule(){
    if(scheduled)return;scheduled=true;
    requestAnimationFrame(()=>requestAnimationFrame(recolor));
  }

  function attachEvents(){
    if(!editCanvas)return;
    ['pointerdown','pointermove','pointerup','pointercancel'].forEach(ev=>editCanvas.addEventListener(ev,schedule,{passive:true,capture:true}));
    modal.addEventListener('click',schedule,true);
    modal.addEventListener('input',schedule,true);
  }

  function boot(){
    if(!findEditor())return;
    const sig=`${editCanvas.width}x${editCanvas.height}-${!!panel}`;
    if(sig!==lastSignature){lastSignature=sig;buildPanel();attachEvents();updateBorder();schedule();}
  }

  // L'éditeur est créé à la demande : observation légère, uniquement pour l'accrochage initial.
  const observer=new MutationObserver(()=>boot());
  observer.observe(document.documentElement,{childList:true,subtree:true});
  setInterval(()=>{if(findEditor()){buildPanel();updateBorder();if(modal.style.display!=='none')schedule();}},650);

  console.log('[HAPPYHOLO] mask visibility V3.18 active');
})();
