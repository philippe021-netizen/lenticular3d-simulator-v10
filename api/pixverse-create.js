export const config = { api: { bodyParser: false } };

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function traceId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const key = process.env.PIXVERSE_API_KEY;
  if (!key) return res.status(500).json({ error: 'PIXVERSE_API_KEY absente sur Vercel.' });

  try {
    const contentType = req.headers['content-type'] || '';
    if (!contentType.includes('multipart/form-data')) {
      return res.status(400).json({ error: 'multipart/form-data requis.' });
    }

    const raw = await readBody(req);
    const upload = await fetch('https://app-api.pixverse.ai/openapi/v2/image/upload', {
      method: 'POST',
      headers: {
        'API-KEY': key,
        'Ai-trace-id': traceId(),
        'Content-Type': contentType
      },
      body: raw
    });

    const uploadJson = await upload.json().catch(() => null);
    if (!upload.ok || !uploadJson || uploadJson.ErrCode !== 0 || !uploadJson.Resp?.img_id) {
      return res.status(upload.status || 502).json({
        error: uploadJson?.ErrMsg || 'Échec upload image PixVerse.',
        details: uploadJson
      });
    }

    const prompt = String(req.query?.prompt || '').trim();
    const quality = ['360p','540p','720p','1080p'].includes(String(req.query?.quality))
      ? String(req.query.quality)
      : '540p';
    const durationRaw = Number(req.query?.duration || 2);
    const duration = Math.max(1, Math.min(15, Number.isFinite(durationRaw) ? durationRaw : 2));

    const lockedPrompt = [
      prompt || 'subtle natural motion of the main subject',
      'ABSOLUTELY FIXED CAMERA.',
      'No zoom, no pan, no dolly, no camera rotation.',
      'Preserve the exact identity, face, fur, clothes, proportions and background.',
      'Keep the subject centered and fully visible.',
      'One simple smooth action only, suitable for a short lenticular animation.'
    ].join(' ');

    const generate = await fetch('https://app-api.pixverse.ai/openapi/v2/video/img/generate', {
      method: 'POST',
      headers: {
        'API-KEY': key,
        'Ai-trace-id': traceId(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        duration,
        img_id: uploadJson.Resp.img_id,
        model: 'v6',
        motion_mode: 'normal',
        prompt: lockedPrompt,
        negative_prompt: 'camera movement, zoom, pan, dolly, identity change, face distortion, extra limbs, duplicate subject, scene change, background change, text, watermark',
        quality,
        seed: 0,
        water_mark: false
      })
    });

    const genJson = await generate.json().catch(() => null);
    if (!generate.ok || !genJson || genJson.ErrCode !== 0 || !genJson.Resp?.video_id) {
      return res.status(generate.status || 502).json({
        error: genJson?.ErrMsg || 'Échec génération PixVerse.',
        details: genJson
      });
    }

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ ok: true, video_id: genJson.Resp.video_id });
  } catch (err) {
    return res.status(500).json({ error: err?.message || 'Erreur interne PixVerse.' });
  }
}
