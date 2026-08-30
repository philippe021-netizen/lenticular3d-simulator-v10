export default async function handler(req,res){
  if(req.method!=='GET')return res.status(405).json({ok:false,error:'Method not allowed'});
  const key=process.env.OPENAI_API_KEY;
  if(!key)return res.status(503).json({ok:false,stage:'env',error:'OPENAI_API_KEY absente dans Vercel.'});
  const masked=`${key.slice(0,7)}…${key.slice(-4)}`;
  try{
    const r=await fetch('https://api.openai.com/v1/responses',{
      method:'POST',
      headers:{'Authorization':`Bearer ${key}`,'Content-Type':'application/json'},
      body:JSON.stringify({model:'gpt-5.6-luna',input:'Réponds uniquement OK.',max_output_tokens:16})
    });
    const data=await r.json().catch(()=>({}));
    if(!r.ok){
      const err=data?.error||{};
      return res.status(r.status).json({
        ok:false,
        stage:'openai',
        key:masked,
        http:r.status,
        type:err.type||null,
        code:err.code||null,
        message:err.message||'Erreur OpenAI',
        request_id:r.headers.get('x-request-id')||null,
        organization:r.headers.get('openai-organization')||null,
        project:r.headers.get('openai-project')||null
      });
    }
    return res.status(200).json({
      ok:true,
      stage:'openai',
      key:masked,
      http:r.status,
      model:data?.model||'gpt-5.6-luna',
      request_id:r.headers.get('x-request-id')||null,
      organization:r.headers.get('openai-organization')||null,
      project:r.headers.get('openai-project')||null,
      message:'Clé valide, facturation utilisable et modèle accessible.'
    });
  }catch(e){
    return res.status(500).json({ok:false,stage:'network',key:masked,error:e?.message||'Erreur réseau OpenAI'});
  }
}
