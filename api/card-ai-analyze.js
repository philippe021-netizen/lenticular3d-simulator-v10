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
Le texte, les coordonnées, le slogan et toute typographie NE DOIVENT JAMAIS être confiés à PixVerse : ils seront reconstruits séparément par HappyHolo avec leur propre profondeur lenticulaire.
RÈGLE PIXVERSE LENTICULAIRE : la fidélité et la stabilité entre les 9 vues sont prioritaires sur l'effet vidéo. En mode strict, considérer le sujet principal comme une plaque photographique verrouillée. Sa silhouette, ses contours externes et sa position dans le cadre doivent rester pratiquement identiques de la première à la dernière vue. Pour une personne : ZERO mouvement des mains, bras, épaules ou torse, ZERO changement de pose, ZERO rotation/inclinaison de tête, ZERO déplacement du corps, ZERO modification de coiffure/vêtements/accessoires ; visage quasi fixe. Un micro-clignement peut être proposé uniquement si extrêmement discret, sinon préférer aucun mouvement du visage. Pour une machine/produit/véhicule : carrosserie, silhouette, position et perspective totalement fixes. Pour un bâtiment/dessin : géométrie, lignes et perspective totalement fixes.
L'effet lenticulaire doit venir EN PRIORITÉ de zones secondaires : variation lumineuse douce, reflet très lent, halo local, profondeur d'arrière-plan ou parallaxe extrêmement faible. Ne jamais déplacer simultanément le sujet et le fond. L'amplitude visuelle entre la vue 1 et la vue 9 doit rester faible et régulière, sans saut ni accélération. Caméra ABSOLUMENT VERROUILLÉE : aucun travelling, zoom, dolly, panoramique, rotation, tilt, changement de focale, recadrage ou perspective. Aucun morphing, aucune reconstruction, aucun nouvel objet recouvrant le sujet.
Pour chaque pixverse_prompt en mode strict, commence explicitement par : "LOCKED CAMERA. KEEP MAIN SUBJECT PIXEL-STABLE AND ALMOST MOTIONLESS." Puis décris UN SEUL effet secondaire lent et de faible amplitude. Évite respiration, gestes et mouvement de caméra lorsque l'effet secondaire suffit. Le negative_prompt doit inclure : camera movement, zoom, pan, tilt, dolly, rotation, reframing, perspective shift, body movement, hand movement, arm movement, pose change, head turn, face morphing, identity change, subject drift, subject scale change, geometry change, text, letters, numbers, logo, watermark.
Propose exactement 3 concepts réalistes, commercialement crédibles et lisibles sur une carte de visite. Les prompts image doivent explicitement demander de préserver le sujet source quand il existe et de supprimer/omettre le texte dans la couche animée. Les 3 concepts doivent différer surtout par l'effet secondaire, pas par le sujet.
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
