export default function handler(req,res){
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  const openAI=process.env.OPENAI_API_KEY||process.env.CLE_API_OPENAI||process.env['CLÉ_API_OPENAI'];
  const gateway=process.env.AI_GATEWAY_API_KEY||process.env.VERCEL_OIDC_TOKEN;
  res.setHeader('Cache-Control','no-store, max-age=0');
  res.status(200).json({ok:true,version:'happyholo-v4',services:{local:true,pixverse:Boolean(process.env.PIXVERSE_API_KEY),analysis:Boolean(gateway||openAI),imageGeneration:Boolean(openAI),explodeview:Boolean(openAI)},environment:process.env.VERCEL_ENV||'local',commit:process.env.VERCEL_GIT_COMMIT_SHA||null});
}
