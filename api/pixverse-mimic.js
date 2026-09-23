const ALLOWED_QUALITIES = new Set(['360p', '540p', '720p']);

function positiveInt(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const key = process.env.PIXVERSE_API_KEY;
  if (!key) return res.status(500).json({ error: 'PIXVERSE_API_KEY manquante dans Vercel.' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const imgId = positiveInt(body.img_id);
    const videoMediaId = positiveInt(body.video_media_id);
    const sourceVideoId = positiveInt(body.source_video_id);
    const quality = ALLOWED_QUALITIES.has(body.quality) ? body.quality : '540p';

    if (!imgId) return res.status(400).json({ error: 'img_id PixVerse invalide pour Mimic.' });
    if (!videoMediaId && !sourceVideoId) {
      return res.status(400).json({ error: 'Mimic requiert video_media_id ou source_video_id.' });
    }

    const payload = { img_id: imgId, quality };
    if (sourceVideoId) payload.source_video_id = sourceVideoId;
    else payload.video_media_id = videoMediaId;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000);
    try {
      const r = await fetch('https://app-api.pixverse.ai/openapi/v2/video/mimic/generate', {
        method: 'POST',
        headers: {
          'API-KEY': key,
          'Ai-trace-id': crypto.randomUUID(),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      const text = await r.text();
      let data;
      try { data = text ? JSON.parse(text) : {}; }
      catch { return res.status(r.status).send(text); }

      if (data && typeof data === 'object') {
        data._microplayer = { mode: 'mimic', endpoint: '/video/mimic/generate', quality };
      }
      return res.status(r.status).json(data);
    } finally {
      clearTimeout(timeout);
    }
  } catch (e) {
    const message = e?.name === 'AbortError' ? 'Délai PixVerse Mimic dépassé.' : (e?.message || 'Erreur PixVerse Mimic');
    return res.status(500).json({ error: message });
  }
}
