export default async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
  const key=process.env.OPENAI_API_KEY;
  if(!key)return res.status(503).json({error:'OPENAI_API_KEY absente dans Vercel.'});
  try{
    const body=typeof req.body==='string'?JSON.parse(req.body):(req.body||{});
    const prompt=String(body.prompt||'').trim().slice(0,5000);
    const variant=Math.max(1,Math.min(3,Number(body.variant)||1));
    if(!prompt)return res.status(400).json({error:'Prompt image manquant.'});
    const variation=[
      'Composition A: sujet principal bien lisible, cadrage commercial équilibré, espace négatif propre.',
      'Composition B: angle légèrement plus dynamique mais toujours réaliste et sobre, sujet immédiatement identifiable.',
      'Composition C: rendu premium plus épuré, profondeur visuelle nette, aucune surcharge.'
    ][variant-1];
    const fullPrompt=`${prompt}\n\n${variation}\nIMPORTANT: no text, no letters, no numbers, no logos, no watermark, no signage. Horizontal business-card composition, realistic professional advertising image, suitable for later animation.`;
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),120000);
    try{
      const r=await fetch('https://api.openai.com/v1/images/generations',{
        method:'POST',
        headers:{'Authorization':`Bearer ${key}`,'Content-Type':'application/json'},
        body:JSON.stringify({model:'gpt-image-2',prompt:fullPrompt,size:'1536x1024',quality:'medium',n:1}),
        signal:controller.signal
      });
      const data=await r.json().catch(()=>({}));
      if(!r.ok)return res.status(r.status).json({error:data?.error?.message||'Erreur génération image OpenAI.'});
      const b64=data?.data?.[0]?.b64_json;
      if(!b64)return res.status(502).json({error:'Aucune image retournée par OpenAI.'});
      return res.status(200).json({image:`data:image/png;base64,${b64}`,variant,model:'gpt-image-2'});
    }finally{clearTimeout(timeout)}
  }catch(e){
    return res.status(500).json({error:e?.name==='AbortError'?'Délai de génération image dépassé.':(e?.message||'Erreur génération image')});
  }
}
