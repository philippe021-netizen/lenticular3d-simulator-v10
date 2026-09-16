function readOutputText(data){
  if(typeof data?.output_text==='string')return data.output_text;
  const chunks=[];
  for(const item of data?.output||[])for(const c of item?.content||[])if(typeof c?.text==='string')chunks.push(c.text);
  return chunks.join('\n');
}
function bbox(v){
  if(!Array.isArray(v)||v.length!==4)return null;
  const a=v.map(Number); if(a.some(n=>!Number.isFinite(n)))return null;
  const x=Math.max(0,Math.min(1,a[0])),y=Math.max(0,Math.min(1,a[1]));
  const w=Math.max(.01,Math.min(1-x,a[2])),h=Math.max(.01,Math.min(1-y,a[3]));
  return [x,y,w,h];
}
function cleanLayer(o,i){
  const b=bbox(o?.bbox); if(!b)return null;
  const type=['text','logo','qr','object','subject','artwork','signature'].includes(o?.type)?o.type:'object';
  return {
    id:String(o?.id||`${type}-${i+1}`), type,
    label:String(o?.label||o?.text||`${type} ${i+1}`).slice(0,160),
    text:['text','qr','signature'].includes(type)?String(o?.text||'').slice(0,300):'', bbox:b,
    role:String(o?.role||'other').slice(0,80),
    depth:Number.isFinite(Number(o?.depth))?Math.max(-100,Math.min(100,Number(o.depth))):0,
    depth255:Number.isFinite(Number(o?.depth255))?Math.max(0,Math.min(255,Number(o.depth255))):undefined,
    confidence:Number.isFinite(Number(o?.confidence))?Math.max(0,Math.min(1,Number(o.confidence))):undefined,
    animatable:!['text','qr'].includes(type),
    animation_hint:String(o?.animation_hint||'').slice(0,500)
  };
}
export default async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
  const gatewayKey=process.env.AI_GATEWAY_API_KEY||process.env.VERCEL_OIDC_TOKEN;
  const openaiKey=process.env.OPENAI_API_KEY;
  const key=gatewayKey||openaiKey, useGateway=!!gatewayKey;
  if(!key)return res.status(503).json({error:'Analyse IA indisponible.'});
  try{
    const body=typeof req.body==='string'?JSON.parse(req.body):(req.body||{});
    const image=String(body.image||'');
    if(!/^data:image\/(png|jpeg|jpg|webp);base64,/i.test(image))return res.status(400).json({error:'Image invalide.'});
    if(image.length>12_000_000)return res.status(413).json({error:'Image trop lourde.'});
    const instructions=`Tu analyses une carte de visite ou photo souvenir pour HappyHolo. Le but n'est PAS de recréer la carte : il faut préserver l'image originale et la découper en calques exploitables pour un effet lenticulaire.
Détecte :
1) CHAQUE bloc de texte séparé (nom, métier, téléphone, mail, adresse, site, slogan, horaires, etc.). Recopie le texte le plus exactement possible et précise son rôle ;
2) chaque logo/emblème/pictogramme important ;
3) chaque QR code comme type qr, séparé des logos et textes ;
4) les signatures ou monogrammes manuscrits comme type signature ;
5) les illustrations et ornements artistiques importants comme type artwork ;
6) les objets visuels importants pouvant être animés isolément (outil, véhicule, produit, mascotte, animal, machine, objet métier) ;
7) le sujet principal s'il existe.
Pour chaque calque, donne une bbox normalisée [x,y,w,h] origine haut-gauche. Les boîtes doivent être assez serrées mais avec 2 à 4% de marge autour des logos/objets. Ne fusionne pas deux textes distincts. Ne crée pas de calque pour les petits ornements inutiles.
Propose une hauteur depth255 continue : 0 = très loin, 150 = plan stable de la carte, 255 = très proche. Le QR doit être exactement à 150 pour préserver sa lecture ; le logo principal entre 210 et 220 ; le nom entre 195 et 205 ; les coordonnées entre 150 et 165 ; le sujet photo entre 180 et 190. Évite les écarts brutaux supérieurs à 70 entre deux éléments voisins. Conserve aussi depth -100..100 pour compatibilité.
Pour chaque élément animable, donne un animation_hint très court et prudent : caméra verrouillée, élément reste dans sa boîte, mouvement local léger, aucune création de texte/logo, aucune modification du reste de la carte.
Réponds UNIQUEMENT en JSON valide : {"summary":"...","layers":[{"id":"text-1","type":"text|logo|qr|signature|artwork|object|subject","role":"name|title|phone|email|address|website|slogan|hours|service|logo|qr|artwork|subject|other","label":"...","text":"...","bbox":[0,0,0,0],"depth":0,"depth255":180,"confidence":0.9,"animation_hint":"..."}]}.`;
    const endpoint=useGateway?'https://ai-gateway.vercel.sh/v1/responses':'https://api.openai.com/v1/responses';
    const model=useGateway?'openai/gpt-5.6-luna':'gpt-5.6-luna';
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),120000);
    try{
      const r=await fetch(endpoint,{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({model,input:[{role:'user',content:[{type:'input_text',text:instructions},{type:'input_image',image_url:image,detail:'high'}]}],max_output_tokens:3200}),signal:controller.signal});
      const data=await r.json().catch(()=>({}));
      if(!r.ok)return res.status(r.status).json({error:data?.error?.message||'Erreur analyse IA.'});
      const text=readOutputText(data).trim().replace(/^```json\s*/i,'').replace(/```$/,'').trim();
      let parsed; try{parsed=JSON.parse(text)}catch{return res.status(502).json({error:'Réponse IA illisible.'})}
      const layers=(Array.isArray(parsed.layers)?parsed.layers:[]).map(cleanLayer).filter(Boolean);
      const seen=new Set(),unique=[];
      for(const l of layers){const k=`${l.type}:${l.label.toLowerCase()}:${l.bbox.map(n=>n.toFixed(2)).join(',')}`;if(!seen.has(k)){seen.add(k);unique.push(l)}}
      unique.sort((a,b)=>a.bbox[1]-b.bbox[1]||a.bbox[0]-b.bbox[0]);
      return res.status(200).json({summary:String(parsed.summary||''),layers:unique,provider:useGateway?'vercel-ai-gateway':'openai-direct'});
    }finally{clearTimeout(timer)}
  }catch(e){return res.status(500).json({error:e?.name==='AbortError'?'Délai dépassé.':(e?.message||'Erreur analyse carte')})}
}
