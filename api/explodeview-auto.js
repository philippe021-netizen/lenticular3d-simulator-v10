export const config = { api: { bodyParser: { sizeLimit: '8mb' } }, maxDuration: 60 };

function getKey(){return process.env.STABILITY_API_KEY||process.env['CLÉ_API_STABILITÉ']||process.env.CLE_API_STABILITE;}
function parseDataUrl(dataUrl){const m=/^data:(image\/(?:png|jpeg|webp));base64,(.+)$/s.exec(dataUrl||'');if(!m)throw new Error('Image invalide');return{type:m[1],buffer:Buffer.from(m[2],'base64')};}
function typeLock(type){
 switch(type){
  case 'car': return 'The reference is a CAR. It must remain the exact same car throughout every stage. Never turn it into a motorcycle, industrial machine, robot, tool, sci-fi object or another vehicle type.';
  case 'motorcycle': return 'The reference is a MOTORCYCLE. It must remain the exact same motorcycle throughout every stage. Never turn it into a car, industrial machine, robot, tool or another vehicle type.';
  case 'tool': return 'The reference is a TOOL. It must remain the exact same tool throughout every stage. Never reinterpret it as a vehicle, industrial machine or unrelated object.';
  case 'industrial-machine': return 'The reference is an INDUSTRIAL MACHINE. It must remain the exact same industrial machine throughout every stage. Never reinterpret it as a car, motorcycle or unrelated object.';
  default: return 'FIRST identify the exact object category visible in the reference image, then LOCK that category for all stages. The object must remain the exact same real-world object type and visual identity. Never reinterpret it as another category.';
 }
}
function stagePrompt(stage,total,type){
 const common=`Photorealistic professional exploded-view reconstruction based on the reference image. ${typeLock(type)} Preserve the SAME object identity, body shape, proportions, distinctive design, colors, camera angle, perspective, lighting and background. Do NOT redesign the object. Do NOT invent a different machine. Separate only real major assemblies that plausibly belong to this exact object. Keep all visible components mechanically plausible and consistent between stages. Use only large meaningful assemblies, never screws, bolts, clips or tiny hardware. No duplicate parts, no extra objects, no text, no labels.`;
 const steps={
  2:'Very early disassembly: move only the easiest large external accessories slightly away from their original positions. Keep the object almost fully assembled.',
  3:'Early disassembly: separate a few large external body/accessory assemblies a little farther while keeping the core object intact.',
  4:'Intermediate disassembly: wheels or other major rolling/rotating assemblies are clearly detached when they exist on this object. Keep chassis/frame and power unit together.',
  5:'Intermediate disassembly: also separate lighting, mirrors, controls or equivalent prominent external modules only if they actually exist on the reference object.',
  6:'Advanced disassembly: separate suspension/fork/cooling or equivalent major mechanical modules only if they actually belong to this object. Keep power unit and main frame mostly together.',
  7:'Advanced disassembly: separate tank/body shells/panels and remaining major outer modules only where appropriate for this exact object. Expose the internal structure clearly.',
  8:'Near-complete exploded view: separate the main power unit or central mechanical assembly from the frame/body when mechanically plausible. Do not split engines or motors into tiny pieces.',
  9:'Complete clean exploded view of this exact object using ONLY large meaningful assemblies arranged around the central structure in a logical service-manual layout. No micro-parts.'
 };
 return `${common}\nStage ${stage} of ${total}. ${steps[stage]||steps[9]} The disassembly must be visibly more advanced than the previous stage but remain a coherent continuation of the exact same object.`;
}

export default async function handler(req,res){
 if(req.method!=='POST')return res.status(405).json({error:'POST only'});
 const key=getKey();if(!key)return res.status(500).json({error:'STABILITY_API_KEY absente'});
 try{
  const {imageDataUrl,stage=2,total=9,objectType='auto',seed=0}=req.body||{};
  const s=Math.max(2,Math.min(9,Number(stage)||2));
  const {type,buffer}=parseDataUrl(imageDataUrl);
  const form=new FormData();
  form.append('image',new Blob([buffer],{type}),'source.'+(type.includes('png')?'png':type.includes('webp')?'webp':'jpg'));
  form.append('prompt',stagePrompt(s,total,objectType));
  form.append('negative_prompt','different object category, industrial machine when reference is a car, factory machine, lathe, milling machine, robot, sci-fi machinery, transformed vehicle type, different vehicle, redesigned body, cartoon, illustration, CGI look, changed camera angle, changed background, duplicate wheels, duplicate parts, deformed geometry, melted parts, impossible mechanics, tiny screws, bolts, nuts, text, labels, watermark');
  form.append('control_strength',String(Math.max(.62,.94-(s-2)*.035)));
  form.append('seed',String(Number(seed)||0));
  form.append('output_format','jpeg');
  const upstream=await fetch('https://api.stability.ai/v2beta/stable-image/control/structure',{method:'POST',headers:{Authorization:`Bearer ${key}`,Accept:'image/*'},body:form});
  if(!upstream.ok){let msg=`Stability ${upstream.status}`;try{msg+=': '+await upstream.text();}catch{}return res.status(upstream.status).json({error:msg});}
  const out=Buffer.from(await upstream.arrayBuffer());
  res.setHeader('Cache-Control','no-store');
  return res.status(200).json({stage:s,imageDataUrl:'data:image/jpeg;base64,'+out.toString('base64')});
 }catch(e){return res.status(500).json({error:e?.message||'Erreur ExplodeView Auto'});}
}
