export const config = { api: { bodyParser: { sizeLimit: '8mb' } }, maxDuration: 60 };

function getKey(){return process.env.STABILITY_API_KEY||process.env['CLÉ_API_STABILITÉ']||process.env.CLE_API_STABILITE;}
function parseDataUrl(dataUrl){const m=/^data:(image\/(?:png|jpeg|webp));base64,(.+)$/s.exec(dataUrl||'');if(!m)throw new Error('Image invalide');return{type:m[1],buffer:Buffer.from(m[2],'base64')};}
function stagePrompt(stage,total,type){
 const common=`Photorealistic professional exploded-view reconstruction of the EXACT SAME ${type||'machine'} from the reference image. Preserve identity, proportions, colors, camera angle, perspective, lighting and background. Keep all visible components mechanically plausible and consistent between stages. Use only major real assemblies, never screws, bolts, clips or tiny hardware. No duplicate parts, no extra vehicles, no text, no labels.`;
 const steps={
  2:'Very early disassembly: move only the easiest large external accessories slightly away from their original positions, such as seat, luggage or simple covers. Main machine remains almost fully assembled.',
  3:'Early disassembly: external body pieces and large accessories are separated a little farther; include fenders, exhaust assemblies or equivalent large outer parts when visible.',
  4:'Intermediate disassembly: wheels or other major rolling/rotating assemblies are clearly detached and floating near their correct mounting locations. Keep chassis and powertrain together.',
  5:'Intermediate disassembly: also separate lighting units, mirrors, handlebar/control assemblies or equivalent prominent external modules. Keep parts aligned around the machine.',
  6:'Advanced disassembly: suspension/fork assemblies, radiator/cooling module or equivalent major mechanical modules are detached. Keep engine/power unit and main frame mostly together.',
  7:'Advanced disassembly: fuel tank, large body shells/panels and remaining major outer modules are separated. Expose the internal frame and power unit clearly.',
  8:'Near-complete exploded view: the engine/power unit becomes a separate LARGE assembly from the frame; wheels, suspension, tank/body and exhaust remain visibly separated. Do not split the engine into tiny pieces.',
  9:'Complete clean exploded view of the machine using ONLY large meaningful assemblies arranged around the main frame in a logical service-manual layout. Large engine/power unit, wheels, suspension, body/tank, exhaust, lighting/control modules separated. No micro-parts.'
 };
 return `${common}\nStage ${stage} of ${total}. ${steps[stage]||steps[9]} The disassembly must be visibly more advanced than the previous stage but remain a coherent continuation.`;
}

export default async function handler(req,res){
 if(req.method!=='POST')return res.status(405).json({error:'POST only'});
 const key=getKey();if(!key)return res.status(500).json({error:'STABILITY_API_KEY absente'});
 try{
  const {imageDataUrl,stage=2,total=9,objectType='machine',seed=0}=req.body||{};
  const s=Math.max(2,Math.min(9,Number(stage)||2));
  const {type,buffer}=parseDataUrl(imageDataUrl);
  const form=new FormData();
  form.append('image',new Blob([buffer],{type}),'source.'+(type.includes('png')?'png':type.includes('webp')?'webp':'jpg'));
  form.append('prompt',stagePrompt(s,total,objectType));
  form.append('negative_prompt','cartoon, illustration, CGI look, changed camera angle, changed background, different vehicle, duplicate wheels, duplicate parts, deformed geometry, melted parts, impossible mechanics, tiny screws, bolts, nuts, text, labels, watermark');
  form.append('control_strength',String(Math.max(.38,.88-(s-2)*.065)));
  form.append('seed',String(Number(seed)||0));
  form.append('output_format','jpeg');
  const upstream=await fetch('https://api.stability.ai/v2beta/stable-image/control/structure',{method:'POST',headers:{Authorization:`Bearer ${key}`,Accept:'image/*'},body:form});
  if(!upstream.ok){let msg=`Stability ${upstream.status}`;try{msg+=': '+await upstream.text();}catch{}return res.status(upstream.status).json({error:msg});}
  const out=Buffer.from(await upstream.arrayBuffer());
  res.setHeader('Cache-Control','no-store');
  return res.status(200).json({stage:s,imageDataUrl:'data:image/jpeg;base64,'+out.toString('base64')});
 }catch(e){return res.status(500).json({error:e?.message||'Erreur ExplodeView Auto'});}
}
