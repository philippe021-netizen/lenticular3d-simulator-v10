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
  const allowedRoles=['name','company','title','phone','email','address','website','social','slogan','hours','service','logo','qr','artwork','subject','other'];
  const role=allowedRoles.includes(o?.role)?o.role:'other';
  return {id:String(o?.id||`${type}-${i+1}`),type,label:String(o?.label||o?.text||`${type} ${i+1}`).slice(0,160),text:['text','qr','signature'].includes(type)?String(o?.text||'').slice(0,300):'',bbox:b,role,groupId:String(o?.groupId||o?.semanticGroup||'').slice(0,100),groupLabel:String(o?.groupLabel||'').slice(0,100),component:String(o?.component||'content').slice(0,40),depth:Number.isFinite(Number(o?.depth))?Math.max(-100,Math.min(100,Number(o.depth))):0,depth255:Number.isFinite(Number(o?.depth255))?Math.max(0,Math.min(255,Number(o.depth255))):undefined,confidence:Number.isFinite(Number(o?.confidence))?Math.max(0,Math.min(1,Number(o.confidence))):undefined,animatable:!['text','qr'].includes(type),animation_hint:String(o?.animation_hint||'').slice(0,500)};
}
function overlap(a,b){const ax2=a[0]+a[2],ay2=a[1]+a[3],bx2=b[0]+b[2],by2=b[1]+b[3];const w=Math.max(0,Math.min(ax2,bx2)-Math.max(a[0],b[0])),h=Math.max(0,Math.min(ay2,by2)-Math.max(a[1],b[1]));return w*h/Math.max(.000001,Math.min(a[2]*a[3],b[2]*b[3]));}
const groupNames={name:'Identité',company:'Entreprise',title:'Fonction',phone:'Téléphone',email:'E-mail',address:'Adresse',website:'Site web',social:'Réseaux sociaux',slogan:'Slogan',hours:'Horaires',service:'Services',logo:'Logo principal',qr:'QR',artwork:'Graphisme',subject:'Sujet',other:'Autre'};
export function pairSemanticGroups(input){
  const layers=(input||[]).map(layer=>({...layer})),contactRoles=new Set(['phone','email','address','website','social','hours']);
  const anchors=layers.filter(layer=>contactRoles.has(layer.role)&&(layer.type==='text'||layer.text));
  anchors.forEach((layer,index)=>{layer.groupId=layer.groupId||`${layer.role}-${index+1}`;layer.groupLabel=layer.groupLabel||groupNames[layer.role]});
  const unclassified=layers.filter(layer=>!layer.groupId&&(layer.role==='other'||(layer.role==='logo'&&layer.type!=='text'))&&['logo','object'].includes(layer.type)&&layer.bbox[2]*layer.bbox[3]<.04);
  for(const icon of unclassified){
    const cy=icon.bbox[1]+icon.bbox[3]/2,right=icon.bbox[0]+icon.bbox[2];let best=null;
    for(const anchor of anchors){const ay=anchor.bbox[1]+anchor.bbox[3]/2,gap=anchor.bbox[0]-right,dy=Math.abs(cy-ay);if(gap<-.035||gap>.14||dy>Math.max(.04,(icon.bbox[3]+anchor.bbox[3])*.7))continue;const score=dy+Math.abs(Math.max(0,gap))*.35;if(!best||score<best.score)best={anchor,score}}
    if(best){icon.role=best.anchor.role;icon.groupId=best.anchor.groupId;icon.groupLabel=best.anchor.groupLabel;icon.component='icon'}
  }
  layers.forEach(layer=>{layer.groupId=layer.groupId||`${layer.role}-${layer.id}`;layer.groupLabel=layer.groupLabel||groupNames[layer.role]||'Autre'});
  return layers;
}
export default async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
  const gatewayKey=process.env.AI_GATEWAY_API_KEY||process.env.VERCEL_OIDC_TOKEN,openaiKey=process.env.OPENAI_API_KEY,key=gatewayKey||openaiKey,useGateway=!!gatewayKey;
  if(!key)return res.status(503).json({error:'Analyse IA indisponible.'});
  try{
    const body=typeof req.body==='string'?JSON.parse(req.body):(req.body||{}),image=String(body.image||''),focusBox=bbox(body?.focus?.bbox),focusLabel=String(body?.focus?.label||'élément composite').slice(0,160);
    if(!/^data:image\/(png|jpeg|jpg|webp);base64,/i.test(image))return res.status(400).json({error:'Image invalide.'});
    if(image.length>12_000_000)return res.status(413).json({error:'Image trop lourde.'});
    const focus=focusBox?`MODE MICRO-DÉCOMPOSITION CIBLÉE. Analyse UNIQUEMENT « ${focusLabel} » dans ${JSON.stringify(focusBox)}. Cherche toutes les parties graphiques réellement autonomes, même petites : lettres/monogramme, triangle ou flèche play, pages/panneaux superposés, œil/visage, cercle/anneau, pictogramme, symbole et slogan. Donne à CHAQUE partie sa propre bbox serrée dans les coordonnées normalisées de l'IMAGE ENTIÈRE. Vise 2 à 8 sous-éléments utiles. Ne retourne JAMAIS le parent complet si des sous-parties sont retournées. Les bbox des sous-parties ne doivent pas englober volontairement les voisines. N'inclus rien hors de la zone ciblée.`:'';
    const instructions=`Tu analyses une carte de visite ou image graphique pour MicroPlayer afin de fabriquer des calques de profondeur lenticulaire. L'image originale doit rester intacte : tu identifies seulement des zones.\n${focus}\nCOMPRENDS D'ABORD LA FONCTION : nom de personne, entreprise, fonction, logo principal, téléphone, e-mail, adresse postale, site web, réseau social, slogan, horaires, service, QR et grand graphisme. Ne classe JAMAIS une petite icône téléphone/e-mail/localisation/réseau comme logo principal. Elle reçoit le même role et le même groupId que l'information qu'elle accompagne : icône téléphone + numéro = role phone et même groupId ; enveloppe + e-mail = email ; repère + adresse = address ; globe + URL = website.\nRÈGLE DE SEGMENTATION : garde l'icône et son texte en calques séparés pour des masques précis, mais relie-les par groupId/groupLabel. Sépare aussi les éléments visuellement autonomes et couvre les GRANDS GRAPHISMES qui donnent du relief. Un logo composite peut être éclaté, tous ses composants partageant groupId logo-main.\nDétecte : 1) identité et entreprise ; 2) fonction ; 3) chaque groupe de coordonnées avec son icône ; 4) composants du logo ; 5) QR ; 6) signature ; 7) grandes courbes, aplats, rubans, formes décoratives ou illustrations ; 8) objets et sujet principal. Au moins un grand artwork doit être décrit lorsqu'une forme décorative importante est visible.\nBBox [x,y,w,h] normalisée, origine haut-gauche. Pour texte/logo, marge faible de 0.5 à 2%. Pour une forme décorative, englobe la forme entière sans prendre toute la carte.\nDepth255 : 0 loin, 128 plan stable, 255 proche. QR=128 ; grand artwork arrière=45–70 ; logo principal=238–250 ; nom=220–230 ; fonction/slogan=205–215 ; téléphone=198 ; e-mail=190 ; adresse=182 ; site=174 ; réseaux sociaux=202. Tous les composants d'un même groupId doivent avoir exactement le même depth255.\nPour chaque élément animable, animation_hint très court : caméra verrouillée, mouvement local léger, aucun changement du reste.\nRéponds UNIQUEMENT JSON valide : {"summary":"...","layers":[{"id":"...","type":"text|logo|qr|signature|artwork|object|subject","role":"name|company|title|phone|email|address|website|social|slogan|hours|service|logo|qr|artwork|subject|other","groupId":"phone-1","groupLabel":"Téléphone","component":"icon|content|logo-part|artwork","label":"...","text":"...","bbox":[0,0,0,0],"depth255":198,"confidence":0.9,"animation_hint":"..."}]}.`;
    const endpoint=useGateway?'https://ai-gateway.vercel.sh/v1/responses':'https://api.openai.com/v1/responses',model=useGateway?'openai/gpt-5.6-luna':'gpt-5.6-luna',controller=new AbortController(),timer=setTimeout(()=>controller.abort(),120000);
    try{
      const r=await fetch(endpoint,{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({model,input:[{role:'user',content:[{type:'input_text',text:instructions},{type:'input_image',image_url:image,detail:'high'}]}],max_output_tokens:4200}),signal:controller.signal});
      const data=await r.json().catch(()=>({})); if(!r.ok)return res.status(r.status).json({error:data?.error?.message||'Erreur analyse IA.'});
      const text=readOutputText(data).trim().replace(/^```json\s*/i,'').replace(/```$/,'').trim(); let parsed; try{parsed=JSON.parse(text)}catch{return res.status(502).json({error:'Réponse IA illisible.'})}
      const layers=(Array.isArray(parsed.layers)?parsed.layers:[]).map(cleanLayer).filter(Boolean),unique=[];
      for(const l of layers){const duplicate=unique.some(u=>u.type===l.type&&u.label.toLowerCase()===l.label.toLowerCase()&&overlap(u.bbox,l.bbox)>.92);if(!duplicate)unique.push(l)}
      const grouped=pairSemanticGroups(unique);grouped.sort((a,b)=>a.bbox[1]-b.bbox[1]||a.bbox[0]-b.bbox[0]);
      const groupPriority={qr:0,logo:1,name:2,company:3,title:4,slogan:5,social:6,phone:7,email:8,address:9,website:10,artwork:11,subject:12,other:99},groupMap=new Map();
      grouped.forEach(layer=>{const current=groupMap.get(layer.groupId);if(!current||(groupPriority[layer.role]??99)<(groupPriority[current.role]??99))groupMap.set(layer.groupId,{id:layer.groupId,label:layer.groupLabel,role:layer.role})});
      return res.status(200).json({summary:String(parsed.summary||''),layers:grouped,groups:[...groupMap.values()],provider:useGateway?'vercel-ai-gateway':'openai-direct',segmentation:'v31-semantic-groups'});
    }finally{clearTimeout(timer)}
  }catch(e){return res.status(500).json({error:e?.name==='AbortError'?'Délai dépassé.':(e?.message||'Erreur analyse carte')})}
}
