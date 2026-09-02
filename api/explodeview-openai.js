export const config = { api: { bodyParser: { sizeLimit: '10mb' } }, maxDuration: 60 };

function getKey(){return process.env.OPENAI_API_KEY||process.env['CLÉ_API_OPENAI']||process.env.CLE_API_OPENAI;}
function cleanType(v){const s=String(v||'objet').toLowerCase();if(s.includes('moto'))return'motorcycle';if(s.includes('voiture')||s.includes('car'))return'car';if(s.includes('outil')||s.includes('tool'))return'tool';if(s.includes('machine'))return'industrial machine';return'object';}
function parseDataUrl(dataUrl){const m=/^data:(image\/(?:png|jpeg|webp));base64,(.+)$/s.exec(dataUrl||'');if(!m)throw new Error('Image invalide');return{type:m[1],buffer:Buffer.from(m[2],'base64')};}
function extFor(type){return type.includes('png')?'png':type.includes('webp')?'webp':'jpg';}
function promptFor(type){return `Use the uploaded reference photo as the ONLY identity reference. Create ONE square 3 by 3 contact sheet containing exactly 9 equal panels, read left-to-right then top-to-bottom. Every panel must show the EXACT SAME ${type} from the reference photo, preserving its distinctive body, proportions, colors, trim, camera viewpoint and visual identity. Do not replace or redesign it. No text, labels, numbers, captions, UI, panel borders or decorative graphics.

This is a progressive technical ExplodeView sequence for a 9-view lenticular animation. Keep a consistent modern technical photographic rendering and the exact same simple coherent background in all panels. The visual goal is elegant and technical: parts should FLOAT around the object in clean exploded-view positions, never be dropped on the floor, never scattered randomly, and never look like junk.

MOST IMPORTANT CONTINUITY RULE: once a component is detached in any panel, that exact same component MUST remain visible in EVERY later panel, at the exact same exploded position, orientation, scale and side of the object. Detached components never disappear, never move again, never reattach, never duplicate and never swap sides. Each new panel only adds one new detached group while preserving all previously detached groups unchanged. Think cumulative exploded-view layers.

For a CAR, use this logical order unless the reference clearly requires an equivalent variation: Panel 1 fully assembled. Panel 2 wheels detach and float at fixed positions beside their original hubs. Panel 3 doors detach and remain fixed. Panel 4 hood detaches and remains fixed above/front of the vehicle. Panel 5 windshield detaches and remains fixed above the cabin. Panel 6 front bumper detaches and remains fixed in front. Panel 7 rear bumper detaches and remains fixed behind. Panel 8 major side panels / rocker panels / fenders detach and remain fixed around the body. Panel 9 final clean technical exploded view: chassis/cell/core remains central while ALL previously detached parts are STILL present at their exact previous positions. Do not make the car suddenly bare by deleting those parts.

For motorcycles, tools and machines, follow the same cumulative logic with equivalent large assemblies: one new major assembly separates at a time, and every previously detached assembly remains frozen in place through all later panels.

CRITICAL: ONLY large meaningful assemblies. ABSOLUTELY NO screws, bolts, nuts, clips, washers, loose cables, tiny brackets or micro-parts. Never disassemble an engine internally. No duplicated wheels or duplicated parts. No component may appear if it was not part of the original reference. No component may disappear after detaching. No floor placement. The progression must be smooth, cumulative, mechanically logical and visually clean for lenticular 1→9→1 viewing.`;}

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
  return res.status(200).json({boardDataUrl:'data:image/jpeg;base64,'+b64,mode:'single-board-3x3-cumulative'});
 }catch(e){console.error('[explodeview-openai]',e);return res.status(500).json({error:e?.message||'Erreur OpenAI ExplodeView'});}
}
