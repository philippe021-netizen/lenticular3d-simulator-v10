function parseDataUrl(value){
  const match=/^data:(image\/(?:png|jpeg|jpg|webp));base64,(.+)$/is.exec(String(value||''));
  if(!match)throw new Error('Image de réparation invalide.');
  const mime=match[1].toLowerCase()==='image/jpg'?'image/jpeg':match[1].toLowerCase();
  return{mime,buffer:Buffer.from(match[2],'base64')};
}

function cleanSides(value){
  const allowed=new Set(['left','right','top','bottom']);
  return[...new Set((Array.isArray(value)?value:[]).map(String).filter(side=>allowed.has(side)))];
}

function extensionFor(mime){return mime==='image/png'?'png':mime==='image/webp'?'webp':'jpg';}

export default async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'POST only'});
  const key=process.env.OPENAI_API_KEY;
  if(!key)return res.status(503).json({error:'Réparation IA indisponible : OPENAI_API_KEY absente.'});
  try{
    const image=parseDataUrl(req.body?.imageDataUrl);
    const mask=parseDataUrl(req.body?.maskDataUrl);
    const sides=cleanSides(req.body?.sides);
    if(!sides.length)return res.status(400).json({error:'Aucun bord coupé détecté.'});
    if(image.buffer.length>14_000_000||mask.buffer.length>8_000_000)return res.status(413).json({error:'Image trop lourde pour la réparation.'});
    const size=String(req.body?.imageSize)==='1024x1536'?'1024x1536':'1536x1024';
    const sideText=sides.join(', ');
    const prompt=`Repair the transparent masked border area on the ${sideText} side(s) of this exact photograph. The original photograph is the visual authority. Preserve every unmasked pixel, every face, identity, expression, hair, clothing, body proportion, pose, object, lighting and camera geometry exactly. A visible person or subject was truncated by the original image edge: naturally complete only the missing shoulder, arm, hand, body part, animal part, vehicle part or object contour that continues into the masked extension. Extend the real background seamlessly behind it. Do not remove, replace, move, enlarge or redesign any person. Do not invent extra people, limbs, fingers, objects, text or logos. Keep realistic anatomy. The repaired subject must end with a clear safety margin from the new image edge. Produce one clean full-frame photograph with no border, seam, caption or comparison view.`;
    const form=new FormData();
    form.append('model','gpt-image-2');
    form.append('image[]',new Blob([image.buffer],{type:image.mime}),`source.${extensionFor(image.mime)}`);
    form.append('mask',new Blob([mask.buffer],{type:mask.mime}),'repair-mask.png');
    form.append('prompt',prompt);
    form.append('size',size);
    form.append('quality','medium');
    form.append('output_format','png');
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),90000);
    try{
      const upstream=await fetch('https://api.openai.com/v1/images/edits',{method:'POST',headers:{Authorization:`Bearer ${key}`},body:form,signal:controller.signal});
      const text=await upstream.text();let data;
      try{data=JSON.parse(text)}catch{data=null}
      if(!upstream.ok)return res.status(upstream.status).json({error:data?.error?.message||'La réparation du bord a échoué.'});
      const b64=data?.data?.[0]?.b64_json;
      if(!b64)return res.status(502).json({error:'Aucune image réparée reçue.'});
      res.setHeader('Cache-Control','no-store');
      return res.status(200).json({imageDataUrl:`data:image/png;base64,${b64}`,sides,mode:'masked-edge-outpainting'});
    }finally{clearTimeout(timeout)}
  }catch(error){
    console.error('[repair-subject-edge]',error);
    return res.status(500).json({error:error?.name==='AbortError'?'Réparation trop longue : relance-la.':(error?.message||'Erreur de réparation du bord.')});
  }
}
