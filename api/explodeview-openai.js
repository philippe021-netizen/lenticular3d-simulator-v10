export const config = { api: { bodyParser: { sizeLimit: '10mb' } }, maxDuration: 120 };

function getKey(){return process.env.OPENAI_API_KEY||process.env['CLÉ_API_OPENAI']||process.env.CLE_API_OPENAI;}
function cleanType(v){const s=String(v||'objet').toLowerCase();if(s.includes('moto'))return'motorcycle';if(s.includes('voiture')||s.includes('car'))return'car';if(s.includes('outil')||s.includes('tool'))return'tool';if(s.includes('machine'))return'industrial machine';return'object';}
function promptFor(type){return `Use the uploaded reference photo as the ONLY identity reference. Create ONE clean 3 by 3 contact sheet containing exactly 9 equal panels, read left-to-right then top-to-bottom. Every panel must show the EXACT SAME ${type} from the reference photo, with the same design, proportions, color scheme, camera angle, perspective and visual identity. Do not turn it into another vehicle or machine. Do not add a second object. No text, no labels, no numbers, no captions, no borders, no decorative UI.

This is a progressive technical exploded-view sequence for lenticular animation. Panel 1: fully assembled original object. Panel 2: only the easiest large accessories begin to separate. Panel 3: large outer body pieces / covers / exhaust-like assemblies separate farther. Panel 4: wheels or equivalent major rotating assemblies separate when applicable. Panel 5: lights, mirrors, controls or other prominent external modules separate. Panel 6: suspension, fork, cooling or equivalent major mechanical modules separate. Panel 7: tank, large shells and remaining major body panels separate. Panel 8: main engine / power unit / central mechanical block separates as ONE LARGE assembly. Panel 9: complete clean exploded view with the frame/chassis/core central and all major assemblies logically arranged around it.

CRITICAL: use ONLY large meaningful assemblies. ABSOLUTELY NO screws, bolts, nuts, clips, washers, cables as loose pieces, tiny brackets or micro-parts. Do not disassemble the engine internally. Preserve the same background treatment across all 9 panels. Keep the object centered and similarly scaled in every panel. The progression must be smooth and logical, with each panel visibly more dismantled than the previous one, suitable for a 9-view lenticular 1→9→1 animation.`;}

async function callOpenAI(key,imageDataUrl,type){
 const body={
  model:'gpt-5.6-terra',
  input:[{role:'user',content:[{type:'input_text',text:promptFor(type)},{type:'input_image',image_url:imageDataUrl,detail:'high'}]}],
  tools:[{type:'image_generation',action:'edit',model:'gpt-image-2',quality:'high',size:'1536x1024',output_format:'jpeg',output_compression:92}],
  tool_choice:{type:'image_generation'}
 };
 let r=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify(body)});
 if(!r.ok){const t=await r.text();if((r.status===400||r.status===404)&&/model|gpt-image-2|gpt-5\.6-terra/i.test(t)){
   body.model='gpt-5';body.tools[0].model='gpt-image-1';
   r=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify(body)});
   if(!r.ok)throw new Error(`OpenAI ${r.status}: ${await r.text()}`);
 }else throw new Error(`OpenAI ${r.status}: ${t}`);}
 const j=await r.json();
 const item=(j.output||[]).find(x=>x?.type==='image_generation_call'&&x?.result);
 if(!item?.result)throw new Error('OpenAI n’a retourné aucune image ExplodeView.');
 return item.result;
}

export default async function handler(req,res){
 if(req.method!=='POST')return res.status(405).json({error:'POST only'});
 const key=getKey();if(!key)return res.status(500).json({error:'OPENAI_API_KEY absente sur Vercel'});
 try{
  const {imageDataUrl,objectType='object'}=req.body||{};
  if(!/^data:image\/(png|jpeg|webp);base64,/.test(imageDataUrl||''))return res.status(400).json({error:'Image invalide'});
  const b64=await callOpenAI(key,imageDataUrl,cleanType(objectType));
  res.setHeader('Cache-Control','no-store');
  return res.status(200).json({boardDataUrl:'data:image/jpeg;base64,'+b64,mode:'single-board-3x3'});
 }catch(e){console.error('[explodeview-openai]',e);return res.status(500).json({error:e?.message||'Erreur OpenAI ExplodeView'});}
}
