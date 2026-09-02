export const config = { api: { bodyParser: { sizeLimit: '10mb' } }, maxDuration: 60 };

function getKey(){return process.env.OPENAI_API_KEY||process.env['CLÉ_API_OPENAI']||process.env.CLE_API_OPENAI;}
function cleanType(v){const s=String(v||'objet').toLowerCase();if(s.includes('moto'))return'motorcycle';if(s.includes('voiture')||s.includes('car'))return'car';if(s.includes('outil')||s.includes('tool'))return'tool';if(s.includes('machine'))return'industrial machine';return'object';}
function parseDataUrl(dataUrl){const m=/^data:(image\/(?:png|jpeg|webp));base64,(.+)$/s.exec(dataUrl||'');if(!m)throw new Error('Image invalide');return{type:m[1],buffer:Buffer.from(m[2],'base64')};}
function extFor(type){return type.includes('png')?'png':type.includes('webp')?'webp':'jpg';}
function promptFor(type){return `Use the uploaded reference photo as the ONLY identity reference. Create ONE square 3 by 3 contact sheet containing exactly 9 equal panels, read left-to-right then top-to-bottom. Every panel must show the EXACT SAME ${type} from the reference photo, preserving its distinctive body, proportions, colors, trim, camera viewpoint and visual identity. Do not replace or redesign it. No text, labels, numbers, captions, UI, panel borders or decorative graphics.

This is a progressive technical ExplodeView sequence for a 9-view lenticular animation. Keep a consistent photographic rendering and a simple coherent background in all panels. Panel 1: fully assembled reference object. Panel 2: seat/accessories or equivalent large easy external pieces start separating. Panel 3: large outer body pieces, covers and exhaust-like assemblies separate farther. Panel 4: wheels or equivalent major rotating assemblies separate when applicable. Panel 5: lights, mirrors, controls or other prominent external modules separate. Panel 6: suspension, fork, cooling or equivalent major mechanical modules separate. Panel 7: tank, large shells and remaining major body panels separate. Panel 8: main engine/power unit/central mechanical block separates as ONE LARGE assembly. Panel 9: clean complete exploded view with chassis/frame/core central and all major assemblies logically spaced around it.

CRITICAL: ONLY large meaningful assemblies. ABSOLUTELY NO screws, bolts, nuts, clips, washers, loose cables, tiny brackets or micro-parts. Never disassemble an engine internally. No duplicated wheels or duplicated parts. The progression must be visibly smooth and mechanically logical from panel 1 to panel 9.`;}

async function callOpenAI(key,imageDataUrl,type){
 const src=parseDataUrl(imageDataUrl);
 const form=new FormData();
 form.append('model','gpt-image-2');
 form.append('image[]',new Blob([src.buffer],{type:src.type}),`reference.${extFor(src.type)}`);
 form.append('prompt',promptFor(type));
 // Square + low is deliberately used for the interactive preview: OpenAI documents it as the fastest image-output option.
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
  return res.status(200).json({boardDataUrl:'data:image/jpeg;base64,'+b64,mode:'single-board-3x3-fast'});
 }catch(e){console.error('[explodeview-openai]',e);return res.status(500).json({error:e?.message||'Erreur OpenAI ExplodeView'});}
}
