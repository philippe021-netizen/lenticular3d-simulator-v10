export const config = { api: { bodyParser: { sizeLimit: '10mb' } }, maxDuration: 60 };

function getKey(){return process.env.OPENAI_API_KEY||process.env['CLÉ_API_OPENAI']||process.env.CLE_API_OPENAI;}
function cleanType(v){const s=String(v||'objet').toLowerCase();if(s.includes('moto'))return'motorcycle';if(s.includes('voiture')||s.includes('car'))return'car';if(s.includes('outil')||s.includes('tool'))return'tool';if(s.includes('machine'))return'industrial machine';return'object';}
function parseDataUrl(dataUrl){const m=/^data:(image\/(?:png|jpeg|webp));base64,(.+)$/s.exec(dataUrl||'');if(!m)throw new Error('Image invalide');return{type:m[1],buffer:Buffer.from(m[2],'base64')};}
function extFor(type){return type.includes('png')?'png':type.includes('webp')?'webp':'jpg';}
function promptFor(type){return `Use the uploaded reference photo as the ONLY identity reference. Create ONE square 3 by 3 contact sheet containing exactly 9 equal panels, read left-to-right then top-to-bottom. Every panel must show the EXACT SAME ${type} from the reference photo, preserving the same body, proportions, colors, trim, camera viewpoint, perspective, scale and visual identity. Do not redesign or substitute the object. No text, labels, numbers, captions, UI, borders or decorative overlays.

THIS IS NOT 9 INDEPENDENT IMAGES. Treat the sequence as ONE CUMULATIVE STATE MACHINE.

STATE-MACHINE RULE:
- Panel N+1 must be Panel N plus exactly ONE newly detached major group.
- Every previously detached piece is LOCKED after detachment.
- LOCKED means its x/y position, distance from the object, rotation, scale, orientation and side of the object must remain unchanged in all later panels.
- A locked piece must remain visible in every later panel.
- A locked piece can NEVER disappear, reappear elsewhere, move again, rotate again, change scale, return to the object, swap sides, merge into another piece or be duplicated.
- The central object/chassis must also stay in the exact same camera position and scale in all 9 panels.
- Think of transparent animation layers: once a layer is moved out, freeze that layer forever and only animate the next new layer.

VISUAL RULE:
Keep the result elegant, technical and modern. Detached pieces must FLOAT cleanly around the object at deliberate exploded-view offsets. Never place detached components on the floor. Never scatter them randomly. Maintain balanced spacing so all detached groups stay readable through panel 9. Use a consistent clean technical/studio background in every panel.

FOR A CAR, use this exact cumulative ledger:
P1 = complete vehicle.
P2 = P1 + detach all 4 wheels only. Lock all 4 wheels at fixed floating positions near their original hubs.
P3 = P2 + detach left and right doors only. Lock both doors. Wheels remain exactly where they were in P2.
P4 = P3 + detach hood only. Lock hood above/front. Wheels and doors remain pixel-position consistent.
P5 = P4 + detach windshield only. Lock windshield above cabin. Wheels, doors and hood remain unchanged.
P6 = P5 + detach front bumper only. Lock it in front. All earlier detached groups remain unchanged.
P7 = P6 + detach rear bumper only. Lock it behind. All earlier detached groups remain unchanged.
P8 = P7 + detach major fenders / rocker panels / large side panels as one readable group. Lock them. All earlier detached groups remain unchanged.
P9 = P8 + reveal the final chassis/cell/core and, only if visually appropriate, separate the engine/transmission as ONE large block. EVERY detached component from P2-P8 must still be present at the exact same locked position.

FOR MOTORCYCLES, TOOLS AND MACHINES: use the identical cumulative-state principle with equivalent large assemblies. One new major group per panel, then freeze it forever.

HARD CONSTRAINTS:
- NO screws, bolts, nuts, clips, washers, tiny brackets, loose cables or micro-parts.
- NO internal engine teardown.
- NO disappearing parts.
- NO reappearing parts.
- NO duplicated parts.
- NO new invented parts.
- NO floor placement.
- NO camera or background jumps.
- NO change of vehicle/object identity.

Before rendering each panel, mentally verify this ledger: previous detached groups = PRESENT + SAME POSITION; new group = DETACHED ONCE; all other groups = STILL ATTACHED. The full 9-panel sheet must read as a mechanically logical, cumulative, lenticular-friendly 1→9→1 ExplodeView.`;}

async function callOpenAI(key,imageDataUrl,type){
 const src=parseDataUrl(imageDataUrl);
 const form=new FormData();
 form.append('model','gpt-image-2');
 form.append('image[]',new Blob([src.buffer],{type:src.type}),`reference.${extFor(src.type)}`);
 form.append('prompt',promptFor(type));
 form.append('size','1024x1024');
 form.append('quality','low');
 form.append('output_format','jpeg');
 form.append('output_compression','88');
 const controller=new AbortController();
 const timeout=setTimeout(()=>controller.abort(),55000);
 try{
  const r=await fetch('https://api.openai.com/v1/images/edits',{method:'POST',headers:{Authorization:`Bearer ${key}`},body:form,signal:controller.signal});
  const text=await r.text();
  let j;try{j=JSON.parse(text)}catch{j=null}
  if(!r.ok)throw new Error(`OpenAI ${r.status}: ${j?.error?.message||text.slice(0,600)||'erreur inconnue'}`);
  const b64=j?.data?.[0]?.b64_json;
  if(!b64)throw new Error('OpenAI n’a retourné aucune image ExplodeView.');
  return b64;
 }catch(e){if(e?.name==='AbortError')throw new Error('La génération a dépassé 55 secondes. Relance une fois : le mode rapide est maintenant actif.');throw e;}finally{clearTimeout(timeout);}
}

export default async function handler(req,res){
 if(req.method!=='POST')return res.status(405).json({error:'POST only'});
 const key=getKey();if(!key)return res.status(500).json({error:'OPENAI_API_KEY absente sur Vercel'});
 try{
  const {imageDataUrl,objectType='object'}=req.body||{};
  const b64=await callOpenAI(key,imageDataUrl,cleanType(objectType));
  res.setHeader('Cache-Control','no-store');
  return res.status(200).json({boardDataUrl:'data:image/jpeg;base64,'+b64,mode:'single-board-3x3-state-machine-v341'});
 }catch(e){console.error('[explodeview-openai]',e);return res.status(500).json({error:e?.message||'Erreur OpenAI ExplodeView'});}
}
