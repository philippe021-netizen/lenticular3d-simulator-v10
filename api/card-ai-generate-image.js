function dataUrlToBlob(dataUrl){
  const m=String(dataUrl||'').match(/^data:(image\/(?:png|jpeg|jpg|webp));base64,(.+)$/i);
  if(!m)return null;
  const mime=m[1].toLowerCase()==='image/jpg'?'image/jpeg':m[1].toLowerCase();
  const bytes=Buffer.from(m[2],'base64');
  return new Blob([bytes],{type:mime});
}

export default async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
  const key=process.env.OPENAI_API_KEY;
  if(!key)return res.status(503).json({error:'OPENAI_API_KEY absente dans Vercel.'});
  try{
    const body=typeof req.body==='string'?JSON.parse(req.body):(req.body||{});
    const prompt=String(body.prompt||'').trim().slice(0,5000);
    const source=String(body.source||'');
    const fidelity=String(body.fidelity||'strict').toLowerCase();
    const subject=String(body.subject||'').trim().slice(0,1200);
    const variant=Math.max(1,Math.min(3,Number(body.variant)||1));
    if(!prompt)return res.status(400).json({error:'Prompt image manquant.'});
    const variation=[
      'Composition A: conserver le cadrage et le sujet de référence au maximum, avec un enrichissement discret et commercial.',
      'Composition B: même sujet de référence et même identité, ambiance légèrement plus dynamique sans remplacer ni redessiner le sujet.',
      'Composition C: même sujet de référence et même identité, rendu premium plus épuré, profondeur visuelle nette sans transformation du sujet.'
    ][variant-1];
    const strict=fidelity!=='free';
    const fidelityRule=strict
      ?`FIDELITY RULE — The uploaded source image is the visual authority. Preserve the exact existing main subject. ${subject?`Detected subject: ${subject}. `:''}If it is a person, keep the same face, apparent age, hair, clothing, body proportions and pose; do not substitute another person. If it is a machine, vehicle, building, product, mascot or illustration, preserve its exact type, silhouette, proportions, colors and graphic identity. Modify only surrounding ambience, background treatment, lighting and subtle presentation.`
      :'Creative mode: keep the business identity and palette coherent, but broader visual reinterpretation is allowed.';
    const fullPrompt=`${prompt}\n\n${variation}\n${fidelityRule}\nIMPORTANT: remove or omit all readable text, letters, numbers, contact details and generated typography from the animated visual layer. No watermark, no signage. Keep clean negative-space areas so HappyHolo can restore the original text later. Horizontal business-card composition, realistic professional advertising image, suitable for subtle animation.`;
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),120000);
    try{
      let r;
      const sourceBlob=strict?dataUrlToBlob(source):null;
      if(sourceBlob){
        const form=new FormData();
        form.append('model','gpt-image-2');
        form.append('prompt',fullPrompt);
        form.append('size','1536x1024');
        form.append('quality','medium');
        form.append('image',sourceBlob,sourceBlob.type==='image/png'?'source.png':'source.jpg');
        r=await fetch('https://api.openai.com/v1/images/edits',{
          method:'POST',headers:{'Authorization':`Bearer ${key}`},body:form,signal:controller.signal
        });
      }else{
        r=await fetch('https://api.openai.com/v1/images/generations',{
          method:'POST',headers:{'Authorization':`Bearer ${key}`,'Content-Type':'application/json'},
          body:JSON.stringify({model:'gpt-image-2',prompt:fullPrompt,size:'1536x1024',quality:'medium',n:1}),signal:controller.signal
        });
      }
      const data=await r.json().catch(()=>({}));
      if(!r.ok)return res.status(r.status).json({error:data?.error?.message||'Erreur génération image OpenAI.'});
      const b64=data?.data?.[0]?.b64_json;
      if(!b64)return res.status(502).json({error:'Aucune image retournée par OpenAI.'});
      return res.status(200).json({image:`data:image/png;base64,${b64}`,variant,model:'gpt-image-2',mode:sourceBlob?'edit-fidelity':'generation'});
    }finally{clearTimeout(timeout)}
  }catch(e){
    return res.status(500).json({error:e?.name==='AbortError'?'Délai de génération image dépassé.':(e?.message||'Erreur génération image')});
  }
}
