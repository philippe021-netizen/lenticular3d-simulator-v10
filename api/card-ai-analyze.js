function readOutputText(data){
  if(typeof data?.output_text==='string')return data.output_text;
  const chunks=[];
  for(const item of data?.output||[])for(const c of item?.content||[])if(typeof c?.text==='string')chunks.push(c.text);
  return chunks.join('\n');
}

function cleanBBox(v){
  if(!Array.isArray(v)||v.length!==4)return null;
  const a=v.map(Number);if(a.some(n=>!Number.isFinite(n)))return null;
  return a.map(n=>Math.max(0,Math.min(1,n)));
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

    const instructions=`Tu es le directeur artistique du mode Carte de visite animée HappyHolo. Analyse la carte fournie.
PRIORITÉ SUJET : si la carte contient déjà un sujet visuel identifiable (personne/visage, animal, machine, véhicule, bâtiment, produit, mascotte, illustration ou dessin métier), ce sujet est une référence à préserver et NON une simple inspiration. Les 3 concepts gardent le même sujet et font varier surtout ambiance, décor secondaire, profondeur et mouvement. Pour une personne : même identité visuelle, visage, âge apparent, coiffure, tenue et pose générale. Pour une machine/véhicule/produit : même type, silhouette, proportions et couleurs. Pour un dessin/mascotte/bâtiment : même géométrie et identité graphique.

PRIORITÉ CARTE / OBJETS INDÉPENDANTS : détecte CHAQUE ligne ou bloc de texte utile comme un objet distinct. Ne fusionne pas le nom, le métier, le téléphone, le mail, l'adresse, le site, le slogan ou les horaires s'ils sont visuellement séparés. Détecte aussi chaque logo, emblème ou pictogramme de marque important comme objet indépendant. Pour chaque objet, donne sa boîte approximative normalisée dans l'image sous forme [x,y,w,h], valeurs entre 0 et 1, origine en haut à gauche. Les boîtes servent seulement au placement initial HappyHolo, elles n'ont pas besoin d'être au pixel près. Ignore les minuscules détails décoratifs sans intérêt client. Pour les textes, renvoie text_objects dans l'ordre visuel. Pour les logos, renvoie logo_objects. protected_text doit rester la liste simple des textes pour compatibilité.

Le texte, les coordonnées, slogans, logos et typographies NE DOIVENT JAMAIS être confiés à PixVerse : ils seront reconstruits séparément par HappyHolo avec position, taille et profondeur lenticulaire indépendantes.

RÈGLE PIXVERSE LENTICULAIRE : fidélité et stabilité entre les 9 vues sont prioritaires. En mode strict, le sujet principal est quasi verrouillé. Pour une personne : zéro geste mains/bras/torse, zéro changement de pose ou rotation de tête. Pour machine/produit/véhicule : silhouette, position et perspective fixes. Pour bâtiment/dessin : géométrie et perspective fixes. Effet venant surtout de zones secondaires : lumière douce, reflet lent, halo local ou parallaxe de fond extrêmement faible. Caméra absolument verrouillée : aucun travelling, zoom, panoramique, rotation, tilt, recadrage ou changement de perspective. Aucun morphing ni nouvel objet recouvrant le sujet.
Pour chaque pixverse_prompt strict, commence par : "LOCKED CAMERA. KEEP MAIN SUBJECT PIXEL-STABLE AND ALMOST MOTIONLESS." Puis décris UN SEUL effet secondaire lent et faible. Le negative_prompt inclut : camera movement, zoom, pan, tilt, dolly, rotation, reframing, perspective shift, body movement, hand movement, arm movement, pose change, head turn, face morphing, identity change, subject drift, subject scale change, geometry change, text, letters, numbers, logo, watermark.

Propose exactement 3 concepts réalistes et commerciaux. Les prompts image demandent de préserver le sujet source et de supprimer texte/logo de la couche animée. Les concepts diffèrent surtout par l'effet secondaire.
Réponds uniquement en JSON valide avec cette structure : {"activity":"...","style":"...","colors":["..."],"protected_text":["..."],"text_objects":[{"id":"text-1","role":"name|title|phone|email|address|website|slogan|hours|service|other","text":"...","bbox":[0.1,0.1,0.3,0.08]}],"logo_objects":[{"id":"logo-1","label":"logo principal","bbox":[0.05,0.05,0.12,0.12]}],"main_subject_present":true,"main_subject_type":"person|animal|machine|vehicle|building|product|mascot|illustration|none|other","main_subject_description":"...","recommended_fidelity":"strict|balanced|free","preserve_features":["..."],"concepts":[{"id":1,"title":"...","visual":"...","animation":"...","image_prompt":"...","pixverse_prompt":"...","negative_prompt":"..."},{"id":2,...},{"id":3,...}]}.`;
    const userText=`Mode demandé par l'opérateur : ${requestedFidelity}. ${comment?`Commentaire facultatif du vendeur/client : ${comment}`:'Aucun commentaire supplémentaire.'}`;
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),120000);
    try{
      const endpoint=useGateway?'https://ai-gateway.vercel.sh/v1/responses':'https://api.openai.com/v1/responses';
      const model=useGateway?'openai/gpt-5.6-luna':'gpt-5.6-luna';
      const r=await fetch(endpoint,{
        method:'POST',headers:{'Authorization':`Bearer ${key}`,'Content-Type':'application/json'},
        body:JSON.stringify({model,input:[{role:'user',content:[{type:'input_text',text:`${instructions}\n\n${userText}`},{type:'input_image',image_url:image,detail:'high'}]}],max_output_tokens:3800}),
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
      parsed.text_objects=(Array.isArray(parsed.text_objects)?parsed.text_objects:[]).map((o,i)=>({id:String(o?.id||`text-${i+1}`),role:String(o?.role||'other'),text:String(o?.text||'').trim(),bbox:cleanBBox(o?.bbox)})).filter(o=>o.text);
      parsed.logo_objects=(Array.isArray(parsed.logo_objects)?parsed.logo_objects:[]).map((o,i)=>({id:String(o?.id||`logo-${i+1}`),label:String(o?.label||`Logo ${i+1}`),bbox:cleanBBox(o?.bbox)})).filter(o=>o.bbox);
      if(!Array.isArray(parsed.protected_text)||!parsed.protected_text.length)parsed.protected_text=parsed.text_objects.map(o=>o.text);
      parsed.provider=useGateway?'vercel-ai-gateway':'openai-direct';
      return res.status(200).json(parsed);
    }finally{clearTimeout(timeout)}
  }catch(e){
    res.status(500).json({error:e?.name==='AbortError'?'Délai d’analyse IA dépassé.':(e?.message||'Erreur analyse carte')});
  }
}
