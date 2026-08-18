export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const key = process.env.PIXVERSE_API_KEY;
  if (!key) return res.status(500).json({ error: 'PIXVERSE_API_KEY manquante dans Vercel.' });

  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks);
    const contentType = req.headers['content-type'];
    if (!contentType?.includes('multipart/form-data')) {
      return res.status(400).json({ error: 'multipart/form-data requis' });
    }

    const r = await fetch('https://app-api.pixverse.ai/openapi/v2/image/upload', {
      method: 'POST',
      headers: {
        'API-KEY': key,
        'Ai-trace-id': crypto.randomUUID(),
        'Content-Type': contentType
      },
      body
    });
    const text = await r.text();
    res.status(r.status).setHeader('Content-Type', 'application/json').send(text);
  } catch (e) {
    res.status(500).json({ error: e.message || 'Erreur upload PixVerse' });
  }
}
