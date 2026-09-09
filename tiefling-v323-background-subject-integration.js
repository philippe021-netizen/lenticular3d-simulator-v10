(()=>{'use strict';
const VERSION='V323.2';
function loadScript(src){return new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=src;s.onload=resolve;s.onerror=()=>reject(new Error(src));document.head.appendChild(s);});}
function selectionSummary(){
  const host=document.getElementById('happyHoloCustomBackgrounds'),api=window.HappyHoloBackgroundSelections;
  if(!host||!api?.list)return;
  let box=document.getElementById('hhV323SelectionSummary');
  if(!box){box=document.createElement('div');box.id='hhV323SelectionSummary';box.style.cssText='margin:10px 0;padding:10px;border:1px solid #b7c8d8;border-radius:10px;background:#f7fbff;color:#17324d;font-size:12px';host.appendChild(box);}
  const list=api.list()||[];
  const rows=list.map((o,i)=>{const filled=api.hasMask?.(o)?'✓':'○',d=Number(o.depth||.18).toFixed(2);return `<div data-bgsel="${i}" style="padding:3px 0"><b>${filled} ${i+1}. ${o.name||`Sélection fond ${i+1}`}</b> — profondeur <b>${d}</b></div>`;}).join('');
  box.innerHTML=`<b>Sélections de profondeur mémorisées</b>${rows?`<div style="margin-top:5px">${rows}</div>`:'<div>Aucune sélection enregistrée.</div>'}`;
}
function markVersion(){
  const top=document.querySelector('.hhV21Tools strong');if(top)top.textContent='MicroPlayer — Tiefling V323.2';
  const h1=[...document.querySelectorAll('h1')].find(e=>(e.textContent||'').includes('Tiefling'));if(h1)h1.textContent='HappyHolo — Tiefling V323.2';
  [...document.querySelectorAll('.hint,p,div')].forEach(e=>{if(e.children.length===0&&(e.textContent||'').startsWith('V321 test'))e.textContent='V323.2 : fond IA/importé indépendant, sujet détouré superposé, profondeur du fond calculée séparément.';});
}
function syncExternalBackground(){
  const input=document.getElementById('customBgFile'),api=window.HappyHoloCustomBackground;if(!input||!api?.state)return;
  if(input.dataset.hhV3232==='1')return;input.dataset.hhV3232='1';
  input.addEventListener('change',()=>{
    const f=input.files?.[0];if(!f)return;
    const st=api.state,slot=st.a;if(slot.url)try{URL.revokeObjectURL(slot.url)}catch(_){}
    slot.url=URL.createObjectURL(f);slot.name=f.name;
    const im=new Image();im.onload=()=>{slot.img=im;st.mode='fixedA';window.dispatchEvent(new CustomEvent('happyholo-background-changed'));selectionSummary();};im.src=slot.url;
  });
}
function waitForReady(){
  const ready=document.querySelector('.wrap')||document.getElementById('customBgFile')||document.getElementById('aiFab');
  if(!ready){setTimeout(waitForReady,120);return;}if(window.__HH_V323_BG_LOADED)return;window.__HH_V323_BG_LOADED=true;
  loadScript('./custom-background-v338.js?v=3232').then(()=>loadScript('./background-multiselect-engine.js?v=3232')).then(()=>loadScript('./background-object-editor-ipad-fix.js?v=3232')).then(()=>{
    try{
      markVersion();syncExternalBackground();
      const host=document.getElementById('happyHoloCustomBackgrounds');if(host){host.dataset.version=VERSION;const note=document.createElement('div');note.style.cssText='margin:0 0 10px;padding:9px 10px;border-radius:10px;background:#eef6ff;border:1px solid #9ec7ff;color:#17324d;font-size:12px;font-weight:700';note.textContent='V323.2 : dès qu’un fond IA ou importé est choisi, il devient le décor actif. Le fond reconstruit n’est plus la source du rendu final ; règle ensuite sa profondeur et replace le sujet indépendamment.';host.insertBefore(note,host.firstChild);}
      selectionSummary();window.addEventListener('happyholo-background-changed',()=>setTimeout(selectionSummary,0));window.addEventListener('happyholo-subject-placement-changed',()=>setTimeout(selectionSummary,0));window.dispatchEvent(new CustomEvent('happyholo-v323-ready'));
    }catch(e){console.warn('[V323.2] intégration UI',e)}
  }).catch(e=>console.error('[V323.2] chargement module',e));
}
waitForReady();
})();
