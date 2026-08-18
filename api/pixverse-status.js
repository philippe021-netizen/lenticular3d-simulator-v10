export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const key = process.env.PIXVERSE_API_KEY;
  if (!key) return res.status(500).json({ error: 'PIXVERSE_API_KEY manquante dans Vercel.' });
  const id = String(req.query.id || '').replace(/[^0-9]/g, '');
  if (!id) return res.status(400).json({ error: 'video id manquant' });
  try {
    const r = await fetch(`https://app-api.pixverse.ai/openapi/v2/video/result/${id}`, {
      headers: { 'API-KEY': key, 'Ai-trace-id': crypto.randomUUID() }
    });
    const text = await r.text();
    res.status(r.status).setHeader('Content-Type', 'application/json').send(text);
  } catch (e) {
    res.status(500).json({ error: e.message || 'Erreur statut PixVerse' });
  }
}
