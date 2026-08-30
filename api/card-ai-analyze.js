function readOutputText(data){
  if(typeof data?.output_text==='string')return data.output_text;
  const chunks=[];
  for(const item of data?.output||[])for(const c of item?.content||[])if(typeof c?.text==='string')chunks.push(c.text);
  return chunks.join('\n');
}

export default async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
  const gatewayKey=process.env.AI_GATEWAY_API_KEY||process.env.VERCEL_OIDC_TOKEN;
  const openaiKey=process.env.OPENAI_API_KEY;
  const useGateway=!!gatewayKey;
  const key=gatewayKey||openaiKey;
  if(!key)return res.status(503).json({error:'Analyse IA indisponible : aucune authentification AI Gateway / OpenAI trouvée côté serveur.'});
  try{
    const body=typeof req.body==='string'?JSON.parse(req.body):(req.body||{});
    const image=String(body.image||'');
    const comment=String(body.comment||'').trim().slice(0,2000);
    const requestedFidelity=String(body.fidelity||'auto').toLowerCase();
    if(!/^data:image\/(png|jpeg|jpg|webp);base64,/i.test(image))return res.status(400).json({error:'Image de carte manquante ou invalide.'});
    if(image.length>12_000_000)return res.status(413).json({error:'Image trop lourde pour l’analyse.'});

    const instructions=`Tu es le directeur artistique du mode Carte de visite animée HappyHolo. Analyse la carte fournie. PRIORITÉ ABSOLUE : si la carte contient déjà un sujet visuel identifiable (personne/visage, animal, machine, véhicule, bâtiment, produit, mascotte, illustration ou dessin métier), ce sujet doit être considéré comme une référence à préserver et NON comme une simple inspiration. Les 3 concepts doivent garder le même sujet et faire varier principalement l'ambiance, le décor secondaire, la profondeur et le mouvement. Pour une personne : même identité visuelle, visage, âge apparent, coiffure, tenue et pose générale. Pour une machine/véhicule/produit : même type, silhouette, proportions et couleurs. Pour un dessin/mascotte/bâtiment : même géométrie et identité graphique. Si aucun sujet fort n'est présent, une interprétation plus libre est possible.
Le texte, les coordonnées, le slogan et toute typographie NE DOIVENT JAMAIS être confiés à PixVerse : ils seront reconstruits séparément par HappyHolo avec leur propre profondeur lenticulaire. Propose exactement 3 concepts réalistes, commercialement crédibles et lisibles sur une carte de visite. Les prompts image doivent explicitement demander de préserver le sujet source quand il existe et de supprimer/omettre le texte dans la couche animée. Les prompts PixVerse doivent interdire tout changement d'identité/sujet et privilégier un mouvement subtil.
Réponds uniquement en JSON valide avec cette structure : {"activity":"...","style":"...","colors":["..."],"protected_text":["..."],"main_subject_present":true,"main_subject_type":"person|animal|machine|vehicle|building|product|mascot|illustration|none|other","main_subject_description":"...","recommended_fidelity":"strict|balanced|free","preserve_features":["..."],"concepts":[{"id":1,"title":"...","visual":"...","animation":"...","image_prompt":"...","pixverse_prompt":"...","negative_prompt":"..."},{"id":2,...},{"id":3,...}]}.`;
    const userText=`Mode demandé par l'opérateur : ${requestedFidelity}. ${comment?`Commentaire facultatif du vendeur/client : ${comment}`:'Aucun commentaire supplémentaire.'}`;
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),120000);
    try{
      const endpoint=useGateway?'https://ai-gateway.vercel.sh/v1/responses':'https://api.openai.com/v1/responses';
      const model=useGateway?'openai/gpt-5.6-luna':'gpt-5.6-luna';
      const r=await fetch(endpoint,{
        method:'POST',headers:{'Authorization':`Bearer ${key}`,'Content-Type':'application/json'},
        body:JSON.stringify({model,input:[{role:'user',content:[{type:'input_text',text:`${instructions}\n\n${userText}`},{type:'input_image',image_url:image,detail:'auto'}]}],max_output_tokens:2600}),
        signal:controller.signal
      });
      const data=await r.json().catch(()=>({}));
      if(!r.ok)return res.status(r.status).json({error:data?.error?.message||`Erreur ${useGateway?'AI Gateway':'OpenAI'}.`});
      const text=readOutputText(data).trim().replace(/^```json\s*/i,'').replace(/```$/,'').trim();
      let parsed;
      try{parsed=JSON.parse(text);}catch(_){return res.status(502).json({error:'Réponse IA illisible.',raw:text.slice(0,1000)});}
      if(!Array.isArray(parsed.concepts)||parsed.concepts.length<3)return res.status(502).json({error:'L’IA n’a pas renvoyé 3 concepts exploitables.'});
      const subjectPresent=parsed.main_subject_present===true&&String(parsed.main_subject_type||'none')!=='none';
      if(!['strict','balanced','free'].includes(parsed.recommended_fidelity))parsed.recommended_fidelity=subjectPresent?'strict':'balanced';
      if(requestedFidelity!=='auto'&&['strict','balanced','free'].includes(requestedFidelity))parsed.recommended_fidelity=requestedFidelity;
      parsed.provider=useGateway?'vercel-ai-gateway':'openai-direct';
      return res.status(200).json(parsed);
    }finally{clearTimeout(timeout)}
  }catch(e){
    res.status(500).json({error:e?.name==='AbortError'?'Délai d’analyse IA dépassé.':(e?.message||'Erreur analyse carte')});
  }
}
