const crypto = require('node:crypto');

const BASE = 'https://app-api.pixverse.ai/openapi/v2';
const TEACHER_IMAGE = 'https://raw.githubusercontent.com/philippe021-netizen/microplayer-action-zones-test-/feature/harmonie-classe-interactive-v2/ardoise-magique/assets/teacher-harmonie.webp';

function cors(res){
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
}

function auth(req,res){
  const expected = process.env.HARMONIE_BRIDGE_TOKEN;
  const got = String(req.query?.token || '');
  if(!expected || got !== expected){
    res.status(403).json({ok:false,error:'forbidden'});
    return false;
  }
  if(!process.env.PIXVERSE_API_KEY){
    res.status(503).json({ok:false,error:'pixverse_key_missing'});
    return false;
  }
  return true;
}

async function pixverse(path, options = {}){
  const headers = {
    'API-KEY': process.env.PIXVERSE_API_KEY,
    'Ai-trace-id': crypto.randomUUID(),
    ...(options.headers || {})
  };
  const r = await fetch(BASE + path, {...options, headers});
  const text = await r.text();
  let data;
  try { data = JSON.parse(text); } catch { data = {raw:text}; }
  if(!r.ok || data?.ErrCode !== 0){
    const err = new Error(data?.ErrMsg || ('PixVerse HTTP '+r.status));
    err.status = r.status;
    err.payload = data;
    throw err;
  }
  return data;
}

module.exports = async function handler(req,res){
  cors(res);
  if(req.method === 'OPTIONS') return res.status(204).end();
  if(req.method !== 'GET') return res.status(405).json({ok:false,error:'GET only'});
  if(!auth(req,res)) return;

  const action = String(req.query?.action || 'balance');

  try{
    if(action === 'balance'){
      const data = await pixverse('/account/balance', {method:'GET'});
      return res.status(200).json({
        ok:true,
        monthly:Number(data.Resp?.credit_monthly || 0),
        package:Number(data.Resp?.credit_package || 0)
      });
    }

    if(action === 'generate'){
      const form = new FormData();
      form.append('image_url', TEACHER_IMAGE);
      const upload = await pixverse('/image/upload', {method:'POST', body:form});
      const imgId = upload.Resp?.img_id;
      if(!imgId) throw new Error('PixVerse upload returned no img_id');

      const prompt = [
        'Photorealistic adult female primary-school teacher, preserve the exact same identity, face, blonde hair and overall appearance from the reference image.',
        'Static camera, medium portrait framing suitable for the left side of an educational tablet game.',
        'She looks warmly toward a child, then naturally raises her right arm holding a slim wooden classroom ruler, points the ruler toward empty space on her right where a chalkboard would be, turns her eyes toward the point she indicates, holds the pointing pose briefly, then lowers the ruler slightly and returns to a calm attentive teaching pose.',
        'Natural shoulder, elbow, wrist and finger motion, realistic ruler physics, subtle breathing and blinking, gentle encouraging expression.',
        'No camera movement, no cuts, no body morphing, no extra arms or fingers, no text, no talking, no background change.'
      ].join(' ');

      const body = {
        duration: 5,
        img_id: imgId,
        model: 'v6',
        motion_mode: 'normal',
        prompt,
        negative_prompt: 'deformed hands, extra fingers, extra arms, warped ruler, face distortion, identity drift, camera motion, zoom, text, subtitles, exaggerated movement, cartoon',
        quality: '720p',
        seed: 0
      };

      const gen = await pixverse('/video/img/generate', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify(body)
      });

      return res.status(200).json({
        ok:true,
        video_id:gen.Resp?.video_id,
        img_id:imgId,
        expected_credits:45
      });
    }

    if(action === 'status'){
      const id = String(req.query?.id || '').replace(/[^0-9]/g,'');
      if(!id) return res.status(400).json({ok:false,error:'missing id'});
      const data = await pixverse('/video/result/' + id, {method:'GET'});
      const r = data.Resp || {};
      return res.status(200).json({
        ok:true,
        status:Number(r.status || 0),
        url:r.url || '',
        width:r.outputWidth || 0,
        height:r.outputHeight || 0,
        size:r.size || 0
      });
    }

    return res.status(400).json({ok:false,error:'unknown action'});
  }catch(err){
    console.error('Harmonie PixVerse bridge', err?.status, err?.payload || err?.message);
    return res.status(502).json({ok:false,error:'pixverse_error',message:String(err?.message || err)});
  }
};