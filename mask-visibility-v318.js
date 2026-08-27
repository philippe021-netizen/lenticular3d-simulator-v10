/* HappyHolo V3.21 — visibilité zone, bouton dans l’en-tête + palette flottante */
(() => {
  'use strict';
  const state={color:'#ff3b30',opacity:.62,outline:true};
  let modal=null,editCanvas=null,header=null,toggleBtn=null,panel=null,boundCanvas=null,scheduled=false;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

  function rgb(hex){
    let h=String(hex||'#ff3b30').replace('#','');
    if(h.length===3)h=h.split('').map(c=>c+c).join('');
    if(!/^[0-9a-f]{6}$/i.test(h))h='ff3b30';
    return [parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)];
  }
  function contrast(hex){const [r,g,b]=rgb(hex);return (.2126*r+.7152*g+.0722*b)>145?'#000':'#fff';}

  function findEditor(){
    modal=[...document.querySelectorAll('div')].find(d=>getComputedStyle(d).position==='fixed'&&d.textContent?.includes('Correction du sujet')&&d.querySelector('canvas'))||null;
    if(!modal)return false;
    const validate=[...modal.querySelectorAll('button')].find(b=>b.textContent?.includes('Valider'))||null;
    header=validate?.parentElement||null;
    const canvases=[...modal.querySelectorAll('canvas')];
    editCanvas=canvases.find(c=>c.style.touchAction==='none'||getComputedStyle(c).touchAction==='none')||canvases[1]||null;
    return !!(header&&editCanvas);
  }

  let colorInput,opacityInput,opacityOut,outlineInput;
  function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(()=>requestAnimationFrame(recolor));}
  function updateBorder(){if(!editCanvas)return;const c=contrast(state.color);editCanvas.style.filter=state.outline?`drop-shadow(0 0 1px ${c}) drop-shadow(0 0 2px ${c})`:'none';}

  function recolor(){
    scheduled=false;
    if(!editCanvas||!modal||getComputedStyle(modal).display==='none')return;
    const ctx=editCanvas.getContext('2d',{willReadFrequently:true});
    if(!ctx||!editCanvas.width||!editCanvas.height)return;
    try{
      const im=ctx.getImageData(0,0,editCanvas.width,editCanvas.height),d=im.data;
      const [nr,ng,nb]=rgb(state.color),oa=clamp(state.opacity,0,1);
      for(let i=0;i<d.length;i+=4){
        const a=d[i+3];if(a<12)continue;
        const r=d[i],g=d[i+1],b=d[i+2];
        if(b>135&&g>65&&b>r*1.15){d[i]=nr;d[i+1]=ng;d[i+2]=nb;d[i+3]=Math.max(a,Math.round(255*oa));}
      }
      ctx.putImageData(im,0,0);
    }catch(_){}
  }

  function swatch(color,parent){
    const b=document.createElement('button');b.type='button';b.title=color;
    Object.assign(b.style,{margin:'0',padding:'0',width:'44px',height:'34px',minHeight:'34px',borderRadius:'8px',border:'2px solid #ddd',background:color});
    b.addEventListener('click',()=>{state.color=color;colorInput.value=color;updateBorder();schedule();});
    parent.appendChild(b);
  }

  function buildUI(){
    if(!header||!modal)return;
    toggleBtn=modal.querySelector('#happyHoloMaskColorButton');
    panel=modal.querySelector('#happyHoloMaskColorPanel');
    if(toggleBtn&&panel)return;

    toggleBtn=document.createElement('button');
    toggleBtn.id='happyHoloMaskColorButton';toggleBtn.type='button';toggleBtn.textContent='🎨 Couleur zone';
    Object.assign(toggleBtn.style,{margin:'0 8px',padding:'10px 12px',borderRadius:'10px',border:'2px solid #ffd60a',background:'#3b3200',color:'#fff',fontWeight:'850',minHeight:'44px'});
    const validate=[...header.querySelectorAll('button')].find(b=>b.textContent?.includes('Valider'));
    if(validate)header.insertBefore(toggleBtn,validate);else header.appendChild(toggleBtn);

    panel=document.createElement('div');panel.id='happyHoloMaskColorPanel';
    Object.assign(panel.style,{position:'fixed',top:'72px',right:'18px',zIndex:'1000005',width:'270px',padding:'12px',border:'2px solid #ffd60a',borderRadius:'14px',background:'#17171a',color:'#fff',boxShadow:'0 8px 28px #000b',display:'none'});
    panel.innerHTML='<div style="font-size:15px;font-weight:900;margin-bottom:9px">🎨 Visibilité de la sélection</div>';

    const row=document.createElement('div');Object.assign(row.style,{display:'flex',alignItems:'center',justifyContent:'space-between',gap:'10px',marginBottom:'9px'});
    const label=document.createElement('span');label.textContent='Couleur du masque';label.style.fontSize='12px';label.style.fontWeight='750';
    colorInput=document.createElement('input');colorInput.type='color';colorInput.value=state.color;Object.assign(colorInput.style,{width:'58px',height:'36px',padding:'0',border:'1px solid #888',borderRadius:'8px'});
    row.append(label,colorInput);panel.appendChild(row);
    colorInput.addEventListener('input',()=>{state.color=colorInput.value;updateBorder();schedule();});

    const presets=document.createElement('div');Object.assign(presets.style,{display:'flex',gap:'7px',marginBottom:'10px'});panel.appendChild(presets);
    ['#ff3b30','#ffd60a','#34c759','#af52de'].forEach(c=>swatch(c,presets));

    const opHead=document.createElement('div');Object.assign(opHead.style,{display:'flex',justifyContent:'space-between',fontSize:'12px',fontWeight:'750'});
    const os=document.createElement('span');os.textContent='Opacité';opacityOut=document.createElement('b');opacityOut.textContent='62%';opHead.append(os,opacityOut);panel.appendChild(opHead);
    opacityInput=document.createElement('input');opacityInput.type='range';opacityInput.min='25';opacityInput.max='90';opacityInput.value='62';opacityInput.style.width='100%';panel.appendChild(opacityInput);
    opacityInput.addEventListener('input',()=>{state.opacity=Number(opacityInput.value)/100;opacityOut.textContent=`${opacityInput.value}%`;schedule();});

    const ol=document.createElement('label');Object.assign(ol.style,{display:'flex',alignItems:'center',gap:'8px',fontSize:'12px',fontWeight:'750',marginTop:'8px'});
    outlineInput=document.createElement('input');outlineInput.type='checkbox';outlineInput.checked=true;
    const ot=document.createElement('span');ot.textContent='Contour contrasté';ol.append(outlineInput,ot);panel.appendChild(ol);
    outlineInput.addEventListener('change',()=>{state.outline=outlineInput.checked;updateBorder();schedule();});

    const hint=document.createElement('div');hint.textContent='Pour un sujet bleu/gris : jaune ou rouge.';Object.assign(hint.style,{fontSize:'11px',opacity:'.78',marginTop:'8px'});panel.appendChild(hint);
    modal.appendChild(panel);
    toggleBtn.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();panel.style.display=panel.style.display==='none'?'block':'none';schedule();});
  }

  function bind(){
    if(!editCanvas||boundCanvas===editCanvas)return;boundCanvas=editCanvas;
    ['pointerdown','pointermove','pointerup','pointercancel'].forEach(ev=>editCanvas.addEventListener(ev,schedule,{passive:true,capture:true}));
    modal?.addEventListener('input',schedule,true);
  }
  function boot(){if(!findEditor())return;buildUI();bind();updateBorder();schedule();}
  const observer=new MutationObserver(boot);observer.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['style']});
  setInterval(boot,250);document.addEventListener('pointerdown',()=>setTimeout(boot,0),true);
  console.log('[HAPPYHOLO] mask visibility V3.21 active');
})();
