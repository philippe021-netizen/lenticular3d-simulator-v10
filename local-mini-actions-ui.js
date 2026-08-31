/* HappyHolo — mini-actions locales, interface unifiée
   Réutilise uniquement les moteurs OFFLINE déjà présents et validés.
*/
(()=>{
  'use strict';
  const plan=()=>Array.isArray(window.happyHoloSelectionPlan)?window.happyHoloSelectionPlan:[];
  const notify=()=>window.dispatchEvent(new CustomEvent('happyholo-action-plan-changed'));

  function findActionSelects(){
    return [...document.querySelectorAll('select')].filter(s=>{
      const vals=[...s.options].map(o=>o.value);
      return vals.includes('yaw3d')&&vals.includes('pivot');
    });
  }

  function relabelCoreOptions(){
    findActionSelects().forEach(s=>{
      const yaw=[...s.options].find(o=>o.value==='yaw3d');
      const pivot=[...s.options].find(o=>o.value==='pivot');
      if(yaw) yaw.textContent='Personne / sujet — léger déhanché + rotation 3D';
      if(pivot) pivot.textContent='Sujet / objet — balancement / pivot léger';
    });
  }

  function setAction(index,action,intensity){
    const p=plan(),item=p[index]; if(!item)return;
    item.action=action;
    if(Number.isFinite(intensity)) item.intensity=intensity;
    notify();
    relabelCoreOptions();
    const selects=findActionSelects();
    if(selects[index]){selects[index].value=action;selects[index].dispatchEvent(new Event('change',{bubbles:true}));}
  }

  function makeButton(label,action,index,intensity){
    const b=document.createElement('button');b.type='button';b.textContent=label;
    Object.assign(b.style,{margin:'0',padding:'10px 11px',border:'1px solid #c8c8c8',borderRadius:'10px',background:'#f1f1ef',color:'#111',fontWeight:'800',fontSize:'12px'});
    b.addEventListener('click',()=>setAction(index,action,intensity));return b;
  }

  function render(){
    const p=plan();
    let host=document.getElementById('happyHoloLocalMiniActions');
    if(!p.length){if(host)host.remove();return;}
    if(!host){
      host=document.createElement('section');host.id='happyHoloLocalMiniActions';
      Object.assign(host.style,{background:'#fff',border:'2px solid #111',borderRadius:'18px',padding:'16px',margin:'16px 0'});
      const controls=document.getElementById('happyHoloSelectionControls');
      if(controls?.parentNode)controls.parentNode.insertBefore(host,controls.nextSibling);
      else document.querySelector('.card.grid')?.insertAdjacentElement('afterend',host);
    }
    host.innerHTML='<div style="font-size:19px;font-weight:900">Mini-actions locales</div><div style="font-size:12px;color:#666;margin:4px 0 12px">Sans PixVerse ni réseau. Ces effets utilisent les moteurs déjà intégrés aux aperçus et aux 9 vues.</div>';
    p.forEach((s,i)=>{
      const row=document.createElement('div');
      Object.assign(row.style,{padding:'11px 0',borderTop:i?'1px solid #ddd':'0'});
      const title=document.createElement('div');title.innerHTML=`<b>${s.name||`Sélection ${i+1}`}</b> <span style="font-size:11px;color:#777">— intensité actuelle ${Number(s.intensity||50)}%</span>`;row.appendChild(title);
      const buttons=document.createElement('div');Object.assign(buttons.style,{display:'flex',gap:'7px',flexWrap:'wrap',marginTop:'8px'});
      buttons.append(
        makeButton('Aucune','none',i,50),
        makeButton('Léger déhanché / rotation','yaw3d',i,42),
        makeButton('Balancement / pivot','pivot',i,35),
        makeButton('Reflet local','glint',i,55),
        makeButton('Appel de phare','headlight',i,70)
      );
      row.appendChild(buttons);host.appendChild(row);
    });
  }

  const refresh=()=>{relabelCoreOptions();render();};
  window.addEventListener('happyholo-relief-ready',()=>setTimeout(refresh,100));
  window.addEventListener('happyholo-action-plan-changed',()=>setTimeout(refresh,80));
  new MutationObserver(()=>{relabelCoreOptions();if(plan().length&&!document.getElementById('happyHoloLocalMiniActions'))render();}).observe(document.documentElement,{childList:true,subtree:true});
  setTimeout(refresh,600);setTimeout(refresh,1600);
  console.log('[HAPPYHOLO] mini-actions locales UI active');
})();