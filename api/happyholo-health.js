const TRIPO='https://openapi.tripo3d.ai/v3';
const tq=new Set(['standard','detailed','extreme']);
const gq=new Set(['standard','detailed']);

async function tripoFetch(path,key,options={}){
  const c=new AbortController();
  const timeout=setTimeout(()=>c.abort(),120000);
  try{
    const r=await fetch(`${TRIPO}${path}`,{...options,headers:{Authorization:`Bearer ${key}`,...(options.headers||{})},signal:c.signal});
    const text=await r.text(); let json;
    try{json=JSON.parse(text)}catch{json={raw:text}}
    if(!r.ok||json?.code!==0){const e=new Error('Erreur API Tripo');e.status=r.status||502;e.details=json;throw e}
    return json;
  }finally{clearTimeout(timeout)}
}

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store, max-age=0');
  const action=String(req.query?.action||'');

  if(!action){
    if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
    const openAI=process.env.OPENAI_API_KEY||process.env.CLE_API_OPENAI||process.env['CLÉ_API_OPENAI'];
    const gateway=process.env.AI_GATEWAY_API_KEY||process.env.VERCEL_OIDC_TOKEN;
    return res.status(200).json({ok:true,version:'happyholo-v5-tripo-photo-fidelity',services:{local:true,pixverse:Boolean(process.env.PIXVERSE_API_KEY),tripo:Boolean(process.env.TRIPO_API_KEY),analysis:Boolean(gateway||openAI),imageGeneration:Boolean(openAI),explodeview:Boolean(openAI)},environment:process.env.VERCEL_ENV||'local',commit:process.env.VERCEL_GIT_COMMIT_SHA||null});
  }

  const key=process.env.TRIPO_API_KEY;
  if(!key)return res.status(500).json({error:'TRIPO_API_KEY manquante dans Vercel.'});

  try{
    if(action==='tripo-upload'){
      if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
      const body=typeof req.body==='string'?JSON.parse(req.body):(req.body||{});
      const m=String(body.data_url||'').match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
      if(!m)return res.status(400).json({error:'Image invalide. JPEG, PNG ou WebP attendu.'});
      const bytes=Buffer.from(m[2],'base64');
      if(!bytes.length)return res.status(400).json({error:'Image vide.'});
      if(bytes.length>8*1024*1024)return res.status(413).json({error:'Image trop volumineuse après compression.'});
      const form=new FormData();
      form.append('file',new Blob([bytes],{type:m[1]}),'microplayer.jpg');
      const json=await tripoFetch('/files',key,{method:'POST',body:form});
      const token=json?.data?.file_token||json?.data?.token;
      if(!token)return res.status(502).json({error:'Jeton fichier absent dans la réponse Tripo.',details:json});
      return res.status(200).json({image_token:token,bytes:bytes.length});
    }

    if(action==='tripo-create'){
      if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
      const body=typeof req.body==='string'?JSON.parse(req.body):(req.body||{});
      const imageToken=String(body.image_token||'').trim();
      if(!imageToken)return res.status(400).json({error:'image_token manquant.'});
      const payload={
        input:imageToken,
        model:'v3.1-20260211',
        texture:true,
        pbr:true,
        texture_quality:tq.has(body.texture_quality)?body.texture_quality:'extreme',
        geometry_quality:gq.has(body.geometry_quality)?body.geometry_quality:'detailed',
        texture_alignment:'original_image',
        orientation:'align_image',
        export_uv:true
      };
      const json=await tripoFetch('/generation/image-to-model',key,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
      const taskId=json?.data?.task_id;
      if(!taskId)return res.status(502).json({error:'task_id absent dans la réponse Tripo.',details:json});
      return res.status(200).json({task_id:taskId,profile:payload});
    }

    if(action==='tripo-status'){
      if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
      const taskId=String(req.query?.task_id||'').trim();
      if(!taskId)return res.status(400).json({error:'task_id manquant.'});
      const json=await tripoFetch(`/tasks/${encodeURIComponent(taskId)}`,key);
      const d=json?.data||{};
      return res.status(200).json({task_id:d.task_id||taskId,type:d.type,status:d.status,progress:Number(d.progress||0),credits_consumed:Number(d.credits_consumed||0),output:{pbr_model:d.output?.model_url||d.output?.pbr_model||d.output?.model||null,model:d.output?.model_url||d.output?.model||null,base_model:d.output?.base_model||null,rendered_image:d.output?.rendered_image_url||d.output?.rendered_image||null},error:d.error||null});
    }

    return res.status(404).json({error:'Action inconnue.'});
  }catch(e){
    const message=e?.name==='AbortError'?'Délai Tripo dépassé.':(e?.message||'Erreur Tripo');
    console.error('Tripo API error',e?.details||e);
    return res.status(e?.status||500).json({error:message,details:e?.details||null});
  }
}
