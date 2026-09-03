/* HappyHolo — mini-actions locales, interface unifiée V3.1
   Catégories : Personne / Animal / Objet-Véhicule / Logo.
   Restaure le ciblage libre Pencil pour reflet et appel de phare.
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
      {label:'Reflet local',action:'glint',intensity:55,active:true,needsZone:true},
      {label:'Appel de phare',action:'headlight',intensity:70,active:true,needsZone:true},
      {label:'Clignotant',active:false,note:'ancien essai — moteur non restauré'}
    ]},
    {name:'Logo',icon:'✦',items:[
      {label:'Reflet / brillance logo',action:'glint',intensity:60,active:true,needsZone:true},
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
    if((action==='glint'||action==='headlight')&&!Array.isArray(item.actionZones)) item.actionZones=[];
    const selects=findActionSelects();
    if(selects[index]){
      selects[index].value=action;
      try{selects[index].dispatchEvent(new Event('change',{bubbles:true}));}catch(_){}
    }
    notify();
    render();
  }

  async function addFreeZone(index){
    const item=plan()[index]; if(!item)return;
    if(item.action!=='glint'&&item.action!=='headlight') return;
    if(typeof window.HappyHoloChooseActionZone!=='function'){
      alert('Outil de ciblage non chargé. Recharge la page puis réessaie.');
      return;
    }
    item.actionZones=Array.isArray(item.actionZones)?item.actionZones:[];
    if(item.actionZones.length>=4){alert('4 zones maximum pour cette action.');return;}
    const isGlint=item.action==='glint';
    const z=await window.HappyHoloChooseActionZone(
      {actionZone:null,zoneMode:'paint'},
      isGlint
        ? `Zone reflet ${item.actionZones.length+1} — peins librement la matière à faire briller`
        : `Zone phare ${item.actionZones.length+1} — peins librement l’optique`
    );
    if(!z) return;
    if(z.kind!=='paint'){
      alert('La zone reçue n’est pas un tracé libre. Recharge la page puis recommence.');
      return;
    }
    item.actionZones.push(z);
    notify();
    render();
  }

  function removeLastZone(index){
    const item=plan()[index]; if(!item||!Array.isArray(item.actionZones)||!item.actionZones.length)return;
    item.actionZones.pop();notify();render();
  }

  function buttonFor(cfg,index){
    const b=document.createElement('button');b.type='button';b.textContent=cfg.label;
    const disabled=!cfg.active;
    const item=plan()[index];
    const selected=!!(cfg.active&&item?.action===cfg.action);
    Object.assign(b.style,{margin:'0',padding:'9px 10px',border:selected?'2px solid #0a84ff':'1px solid '+(disabled?'#d8d8d8':'#bfc3c7'),borderRadius:'10px',background:selected?'#e8f2ff':disabled?'#f6f6f6':'#eef1f3',color:disabled?'#999':'#111',fontWeight:'800',fontSize:'12px',opacity:disabled?'.72':'1'});
    b.disabled=disabled;
    if(cfg.note) b.title=cfg.note;
    if(cfg.active) b.addEventListener('click',()=>setAction(index,cfg.action,cfg.intensity));
    return b;
  }

  function renderZoneTools(group,index,box){
    const item=plan()[index];
    const supportsZone=group.items.some(x=>x.active&&x.needsZone&&x.action===item?.action);
    if(!supportsZone) return;
    const zones=Array.isArray(item.actionZones)?item.actionZones:[];
    const z=document.createElement('div');
    Object.assign(z.style,{marginTop:'9px',padding:'9px',borderRadius:'10px',background:'#eef6ff',border:'1px solid #b9d7ff'});
    const info=document.createElement('div');
    info.textContent=`Ciblage libre : ${zones.length}/4 zone${zones.length>1?'s':''} peinte${zones.length>1?'s':''}.`;
    Object.assign(info.style,{fontSize:'11px',fontWeight:'800',marginBottom:'7px'});z.appendChild(info);
    const add=document.createElement('button');add.type='button';add.textContent=zones.length?'＋ Ajouter une autre zone':'🎯 Peindre la zone';
    Object.assign(add.style,{padding:'9px 11px',border:'0',borderRadius:'9px',background:'#0a84ff',color:'#fff',fontWeight:'850',margin:'0 7px 0 0'});
    add.onclick=()=>addFreeZone(index);z.appendChild(add);
    if(zones.length){
      const del=document.createElement('button');del.type='button';del.textContent='− Retirer dernière zone';
      Object.assign(del.style,{padding:'9px 11px',border:'1px solid #bbb',borderRadius:'9px',background:'#fff',fontWeight:'800',margin:'0'});
      del.onclick=()=>removeLastZone(index);z.appendChild(del);
    }
    const hint=document.createElement('div');hint.textContent='Apple Pencil/doigt : peins directement la zone utile. Pas de rectangle.';Object.assign(hint.style,{fontSize:'10px',color:'#666',marginTop:'7px'});z.appendChild(hint);
    box.appendChild(z);
  }

  function renderGroup(group,index){
    const box=document.createElement('div');
    Object.assign(box.style,{border:'1px solid #dedede',borderRadius:'14px',padding:'10px',background:'#fafafa'});
    const head=document.createElement('div');head.innerHTML=`<b>${group.icon} ${group.name}</b>`;Object.assign(head.style,{fontSize:'13px',marginBottom:'8px'});box.appendChild(head);
    const wrap=document.createElement('div');Object.assign(wrap.style,{display:'flex',gap:'7px',flexWrap:'wrap'});
    group.items.forEach(cfg=>wrap.appendChild(buttonFor(cfg,index)));box.appendChild(wrap);
    renderZoneTools(group,index,box);
    const inactive=group.items.filter(x=>!x.active);
    if(inactive.length){const n=document.createElement('div');n.textContent='Grisé = ancien essai retrouvé mais non fiable / moteur non validé.';Object.assign(n.style,{fontSize:'10px',color:'#888',marginTop:'7px'});box.appendChild(n);}
    return box;
  }

  function render(){
    relabelCoreOptions();
    const p=plan();let host=document.getElementById('happyHoloLocalMiniActions');
    if(!p.length){if(host)host.remove();return;}
    if(!host){
      host=document.createElement('section');host.id='happyHoloLocalMiniActions';
      Object.assign(host.style,{background:'#fff',border:'2px solid #111',borderRadius:'18px',padding:'16px',margin:'16px 0'});
      const controls=document.getElementById('happyHoloSelectionControls');
      if(controls?.parentNode)controls.parentNode.insertBefore(host,controls.nextSibling); else return;
    }
    host.innerHTML='<div style="font-size:19px;font-weight:900">Mini-actions locales</div><div style="font-size:12px;color:#666;margin:4px 0 12px">Choisis la sélection, puis l’action. Pour reflet/phare, le bouton bleu permet de peindre librement la zone au Pencil ou au doigt.</div>';
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
  console.log('[HAPPYHOLO] mini-actions UI V3.1 · ciblage libre restauré');
})();