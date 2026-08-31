/* HappyHolo — mini-actions locales, interface unifiée V3
   Réutilise uniquement les moteurs OFFLINE réellement présents.
   Catégories visibles : Personne / Animal / Objet-Véhicule / Logo.
   Les actions non encore fiables restent indiquées mais désactivées.
*/
(()=>{
  'use strict';
  const plan=()=>Array.isArray(window.happyHoloSelectionPlan)?window.happyHoloSelectionPlan:[];
  const notify=()=>window.dispatchEvent(new CustomEvent('happyholo-action-plan-changed'));

  const groups=[
    {name:'Personne',icon:'👤',items:[
      {label:'Léger déhanché / rotation',action:'yaw3d',intensity:42,active:true},
      {label:'Clin d’œil',active:false,note:'ancien essai local — pas assez fiable'},
      {label:'Sourire léger',active:false,note:'ancien essai — non validé'},
      {label:'Petit bisou',active:false,note:'ancien essai — non validé'}
    ]},
    {name:'Animal',icon:'🐾',items:[
      {label:'Rotation / mouvement léger',action:'yaw3d',intensity:34,active:true},
      {label:'Clignement lent chat',active:false,note:'ancien essai — non validé'},
      {label:'Tête penchée chien',active:false,note:'ancien essai — non validé'},
      {label:'Miaulement / petit aboiement',active:false,note:'ancien essai — non validé'}
    ]},
    {name:'Objet / véhicule',icon:'🚗',items:[
      {label:'Balancement / pivot',action:'pivot',intensity:35,active:true},
      {label:'Reflet local',action:'glint',intensity:55,active:true},
      {label:'Appel de phare',action:'headlight',intensity:70,active:true},
      {label:'Clignotant',active:false,note:'ancien essai — moteur non restauré'}
    ]},
    {name:'Logo',icon:'✦',items:[
      {label:'Reflet / brillance logo',action:'glint',intensity:60,active:true},
      {label:'Pivot léger logo',action:'pivot',intensity:28,active:true},
      {label:'Logo qui se reforme',active:false,note:'prévu pour moteur complexe / PixVerse'}
    ]}
  ];

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
      if(yaw) yaw.textContent='Personne / animal / sujet — mouvement léger + rotation 3D';
      if(pivot) pivot.textContent='Objet / logo — balancement / pivot léger';
    });
  }

  function setAction(index,action,intensity){
    const item=plan()[index]; if(!item)return;
    item.action=action;
    if(Number.isFinite(intensity)) item.intensity=intensity;
    const selects=findActionSelects();
    if(selects[index]) selects[index].value=action;
    notify();
    render();
  }

  function buttonFor(cfg,index){
    const b=document.createElement('button');b.type='button';b.textContent=cfg.label;
    const disabled=!cfg.active;
    Object.assign(b.style,{margin:'0',padding:'9px 10px',border:'1px solid '+(disabled?'#d8d8d8':'#bfc3c7'),borderRadius:'10px',background:disabled?'#f6f6f6':'#eef1f3',color:disabled?'#999':'#111',fontWeight:'800',fontSize:'12px',opacity:disabled?'.72':'1'});
    b.disabled=disabled;
    if(cfg.note) b.title=cfg.note;
    if(cfg.active) b.addEventListener('click',()=>setAction(index,cfg.action,cfg.intensity));
    return b;
  }

  function renderGroup(group,index){
    const box=document.createElement('div');
    Object.assign(box.style,{border:'1px solid #dedede',borderRadius:'14px',padding:'10px',background:'#fafafa'});
    const head=document.createElement('div');
    head.innerHTML=`<b>${group.icon} ${group.name}</b>`;
    Object.assign(head.style,{fontSize:'13px',marginBottom:'8px'});box.appendChild(head);
    const wrap=document.createElement('div');Object.assign(wrap.style,{display:'flex',gap:'7px',flexWrap:'wrap'});
    group.items.forEach(cfg=>wrap.appendChild(buttonFor(cfg,index)));
    box.appendChild(wrap);
    const inactive=group.items.filter(x=>!x.active);
    if(inactive.length){const n=document.createElement('div');n.textContent='Grisé = ancien essai retrouvé mais non fiable / moteur non validé.';Object.assign(n.style,{fontSize:'10px',color:'#888',marginTop:'7px'});box.appendChild(n);}
    return box;
  }

  function render(){
    relabelCoreOptions();
    const p=plan();
    let host=document.getElementById('happyHoloLocalMiniActions');
    if(!p.length){if(host)host.remove();return;}
    if(!host){
      host=document.createElement('section');host.id='happyHoloLocalMiniActions';
      Object.assign(host.style,{background:'#fff',border:'2px solid #111',borderRadius:'18px',padding:'16px',margin:'16px 0'});
      const controls=document.getElementById('happyHoloSelectionControls');
      if(controls?.parentNode)controls.parentNode.insertBefore(host,controls.nextSibling); else return;
    }
    host.innerHTML='<div style="font-size:19px;font-weight:900">Mini-actions locales</div><div style="font-size:12px;color:#666;margin:4px 0 12px">Choisis d’abord la sélection, puis une catégorie. Actives = moteur local existant. Grisées = anciennes pistes retrouvées mais non validées.</div>';
    p.forEach((s,i)=>{
      const row=document.createElement('div');Object.assign(row.style,{padding:'12px 0',borderTop:i?'1px solid #ddd':'0'});
      const title=document.createElement('div');title.innerHTML=`<b>${s.name||`Sélection ${i+1}`}</b> <span style="font-size:11px;color:#777">— action : ${s.action||'none'} · intensité ${Number(s.intensity||50)}%</span>`;row.appendChild(title);
      const none=document.createElement('div');Object.assign(none.style,{margin:'8px 0'});const b=document.createElement('button');b.type='button';b.textContent='Aucune action';Object.assign(b.style,{padding:'9px 10px',border:'1px solid #bbb',borderRadius:'10px',background:'#fff',fontWeight:'800'});b.onclick=()=>setAction(i,'none',50);none.appendChild(b);row.appendChild(none);
      const grid=document.createElement('div');Object.assign(grid.style,{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:'8px'});
      groups.forEach(g=>grid.appendChild(renderGroup(g,i)));row.appendChild(grid);host.appendChild(row);
    });
  }

  window.addEventListener('happyholo-relief-ready',()=>setTimeout(render,120));
  window.addEventListener('happyholo-action-plan-changed',()=>setTimeout(render,80));
  window.addEventListener('happyholo-selection-plan-changed',()=>setTimeout(render,100));
  [900,1800,3000].forEach(ms=>setTimeout(()=>{if(plan().length)render();},ms));
  console.log('[HAPPYHOLO] mini-actions UI V3 · catégories personne/animal/objet/logo');
})();