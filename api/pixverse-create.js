const ALLOWED_QUALITIES = new Set(['360p', '540p', '720p', '1080p']);
const ALLOWED_MOTION_MODES = new Set(['normal', 'fast']);

function clampInt(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const key = process.env.PIXVERSE_API_KEY;
  if (!key) return res.status(500).json({ error: 'PIXVERSE_API_KEY manquante dans Vercel.' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const imgId = Number(body.img_id);
    if (!Number.isFinite(imgId) || imgId <= 0) {
      return res.status(400).json({ error: 'img_id PixVerse invalide.' });
    }

    const duration = clampInt(body.duration, 1, 15, 2);
    const quality = ALLOWED_QUALITIES.has(body.quality) ? body.quality : '540p';
    const motionMode = ALLOWED_MOTION_MODES.has(body.motion_mode) ? body.motion_mode : 'normal';
    const prompt = String(body.prompt || '').trim().slice(0, 5000);
    const negativePrompt = String(body.negative_prompt || '').trim().slice(0, 5000);
    const seed = Number.isFinite(Number(body.seed)) ? clampInt(body.seed, 0, 2147483647, 0) : 0;
    const generateAudio = body.generate_audio_switch === true;

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt PixVerse manquant.' });
    }

    const payload = {
      duration,
      img_id: imgId,
      model: 'v6',
      motion_mode: motionMode,
      prompt,
      quality,
      seed,
      generate_audio_switch: generateAudio
    };

    if (negativePrompt) payload.negative_prompt = negativePrompt;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000);

    try {
      const r = await fetch('https://app-api.pixverse.ai/openapi/v2/video/img/generate', {
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
      res.status(r.status).setHeader('Content-Type', 'application/json').send(text);
    } finally {
      clearTimeout(timeout);
    }
  } catch (e) {
    const message = e?.name === 'AbortError' ? 'Délai PixVerse dépassé.' : (e?.message || 'Erreur création PixVerse');
    res.status(500).json({ error: message });
  }
}
