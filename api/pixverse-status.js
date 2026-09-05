export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const key = process.env.PIXVERSE_API_KEY;
  if (!key) return res.status(500).json({ error: 'PIXVERSE_API_KEY manquante dans Vercel.' });

  const rawId = String(req.query.id || req.query.video_id || '').trim();
  if (!/^\d+$/.test(rawId)) return res.status(400).json({ error: 'video id PixVerse invalide' });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);

  try {
    const r = await fetch(`https://app-api.pixverse.ai/openapi/v2/video/result/${rawId}`, {
      headers: {
        'API-KEY': key,
        'Ai-trace-id': crypto.randomUUID()
      },
      signal: controller.signal
    });
    const text = await r.text();
    res.status(r.status).setHeader('Content-Type', 'application/json').send(text);
  } catch (e) {
    const message = e?.name === 'AbortError' ? 'Délai statut PixVerse dépassé.' : (e?.message || 'Erreur statut PixVerse');
    res.status(500).json({ error: message });
  } finally {
    clearTimeout(timeout);
  }
}
