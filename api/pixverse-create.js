export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const key = process.env.PIXVERSE_API_KEY;
  if (!key) return res.status(500).json({ error: 'PIXVERSE_API_KEY manquante dans Vercel.' });
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const payload = {
      duration: 5,
      img_id: Number(body.img_id),
      model: 'v6',
      motion_mode: 'normal',
      prompt: String(body.prompt || ''),
      quality: '720p',
      seed: Number.isFinite(Number(body.seed)) ? Number(body.seed) : 0
    };
    const r = await fetch('https://app-api.pixverse.ai/openapi/v2/video/img/generate', {
      method: 'POST',
      headers: {
        'API-KEY': key,
        'Ai-trace-id': crypto.randomUUID(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    const text = await r.text();
    res.status(r.status).setHeader('Content-Type', 'application/json').send(text);
  } catch (e) {
    res.status(500).json({ error: e.message || 'Erreur création PixVerse' });
  }
}
