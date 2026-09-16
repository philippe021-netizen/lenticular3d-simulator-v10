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
  const w=Math.max(.006,Math.min(1-x,a[2])),h=Math.max(.006,Math.min(1-y,a[3]));
  return [x,y,w,h];
}
function cleanLayer(o,i){
  const b=bbox(o?.bbox); if(!b)return null;
  const type=['text','logo','qr','object','subject','artwork','signature'].includes(o?.type)?o.type:'object';
  return {id:String(o?.id||`${type}-${i+1}`),type,label:String(o?.label||o?.text||`${type} ${i+1}`).slice(0,160),text:['text','qr','signature'].includes(type)?String(o?.text||'').slice(0,300):'',bbox:b,role:String(o?.role||'other').slice(0,80),depth:Number.isFinite(Number(o?.depth))?Math.max(-100,Math.min(100,Number(o.depth))):0,depth255:Number.isFinite(Number(o?.depth255))?Math.max(0,Math.min(255,Number(o.depth255))):undefined,confidence:Number.isFinite(Number(o?.confidence))?Math.max(0,Math.min(1,Number(o.confidence))):undefined,animatable:!['text','qr'].includes(type),animation_hint:String(o?.animation_hint||'').slice(0,500)};
}
function overlap(a,b){const ax2=a[0]+a[2],ay2=a[1]+a[3],bx2=b[0]+b[2],by2=b[1]+b[3];const w=Math.max(0,Math.min(ax2,bx2)-Math.max(a[0],b[0])),h=Math.max(0,Math.min(ay2,by2)-Math.max(a[1],b[1]));return w*h/Math.max(.000001,Math.min(a[2]*a[3],b[2]*b[3]));}
export default async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
  const gatewayKey=process.env.AI_GATEWAY_API_KEY||process.env.VERCEL_OIDC_TOKEN,openaiKey=process.env.OPENAI_API_KEY,key=gatewayKey||openaiKey,useGateway=!!gatewayKey;
  if(!key)return res.status(503).json({error:'Analyse IA indisponible.'});
  try{
    const body=typeof req.body==='string'?JSON.parse(req.body):(req.body||{}),image=String(body.image||''),focusBox=bbox(body?.focus?.bbox),focusLabel=String(body?.focus?.label||'élément composite').slice(0,160);
    if(!/^data:image\/(png|jpeg|jpg|webp);base64,/i.test(image))return res.status(400).json({error:'Image invalide.'});
    if(image.length>12_000_000)return res.status(413).json({error:'Image trop lourde.'});
    const focus=focusBox?`MODE MICRO-DÉCOMPOSITION CIBLÉE. Analyse UNIQUEMENT « ${focusLabel} » dans ${JSON.stringify(focusBox)}. Cherche toutes les parties graphiques réellement autonomes, même petites : lettres/monogramme, triangle ou flèche play, pages/panneaux superposés, œil/visage, cercle/anneau, pictogramme, symbole et slogan. Donne à CHAQUE partie sa propre bbox serrée dans les coordonnées normalisées de l'IMAGE ENTIÈRE. Vise 2 à 8 sous-éléments utiles. Ne retourne JAMAIS le parent complet si des sous-parties sont retournées. Les bbox des sous-parties ne doivent pas englober volontairement les voisines. N'inclus rien hors de la zone ciblée.`:'';
    const instructions=`Tu analyses une carte de visite ou image graphique pour MicroPlayer afin de fabriquer des calques de profondeur lenticulaire. L'image originale doit rester intacte : tu identifies seulement des zones.\n${focus}\nRÈGLE DE SEGMENTATION PRIORITAIRE : ne fusionne pas des éléments visuellement séparables. Un logo composite doit être éclaté en composants autonomes. Un bloc de texte distinct = un calque. Un pictogramme distinct = un calque. Si MP, flèche, pages et œil sont discernables, ils doivent être QUATRE calques différents, pas un seul logo.\nDétecte : 1) chaque bloc texte séparé avec transcription et rôle ; 2) chaque composant de logo/emblème/pictogramme ; 3) QR séparé ; 4) signature/monogramme ; 5) illustration/ornement important ; 6) objet important ; 7) sujet principal.\nBBox [x,y,w,h] normalisée, origine haut-gauche. Utilise une marge faible de 0.5 à 2% autour des composants graphiques ; évite les grandes boîtes qui capturent du fond ou un voisin. Pour les très petits éléments, une bbox de moins de 1% est autorisée.\nDepth255 : 0 loin, 150 plan stable, 255 proche. QR=150 ; logo principal 210–220 ; nom 195–205 ; coordonnées 150–165 ; sujet 180–190. Les sous-parties d'un même logo peuvent recevoir des hauteurs différentes espacées de 8 à 25 points pour créer un relief lisible sans excès.\nPour chaque élément animable, animation_hint très court : caméra verrouillée, mouvement local léger, aucun changement du reste.\nRéponds UNIQUEMENT JSON valide : {"summary":"...","layers":[{"id":"...","type":"text|logo|qr|signature|artwork|object|subject","role":"name|title|phone|email|address|website|slogan|hours|service|logo|qr|artwork|subject|other","label":"...","text":"...","bbox":[0,0,0,0],"depth":0,"depth255":180,"confidence":0.9,"animation_hint":"..."}]}.`;
    const endpoint=useGateway?'https://ai-gateway.vercel.sh/v1/responses':'https://api.openai.com/v1/responses',model=useGateway?'openai/gpt-5.6-luna':'gpt-5.6-luna',controller=new AbortController(),timer=setTimeout(()=>controller.abort(),120000);
    try{
      const r=await fetch(endpoint,{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({model,input:[{role:'user',content:[{type:'input_text',text:instructions},{type:'input_image',image_url:image,detail:'high'}]}],max_output_tokens:4200}),signal:controller.signal});
      const data=await r.json().catch(()=>({})); if(!r.ok)return res.status(r.status).json({error:data?.error?.message||'Erreur analyse IA.'});
      const text=readOutputText(data).trim().replace(/^```json\s*/i,'').replace(/```$/,'').trim(); let parsed; try{parsed=JSON.parse(text)}catch{return res.status(502).json({error:'Réponse IA illisible.'})}
      const layers=(Array.isArray(parsed.layers)?parsed.layers:[]).map(cleanLayer).filter(Boolean),unique=[];
      for(const l of layers){const duplicate=unique.some(u=>u.type===l.type&&u.label.toLowerCase()===l.label.toLowerCase()&&overlap(u.bbox,l.bbox)>.92);if(!duplicate)unique.push(l)}
      unique.sort((a,b)=>a.bbox[1]-b.bbox[1]||a.bbox[0]-b.bbox[0]);
      return res.status(200).json({summary:String(parsed.summary||''),layers:unique,provider:useGateway?'vercel-ai-gateway':'openai-direct',segmentation:'v28-fine'});
    }finally{clearTimeout(timer)}
  }catch(e){return res.status(500).json({error:e?.name==='AbortError'?'Délai dépassé.':(e?.message||'Erreur analyse carte')})}
}
