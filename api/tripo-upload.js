export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const key = process.env.TRIPO_API_KEY;
  if (!key) return res.status(500).json({ error: 'TRIPO_API_KEY manquante dans Vercel.' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const dataUrl = String(body.data_url || '');
    const filename = String(body.filename || 'microplayer.jpg').replace(/[^a-zA-Z0-9._-]/g, '_');
    const m = dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
    if (!m) return res.status(400).json({ error: 'Image invalide. JPEG, PNG ou WebP attendu.' });

    const mime = m[1];
    const bytes = Buffer.from(m[2], 'base64');
    if (!bytes.length) return res.status(400).json({ error: 'Image vide.' });
    if (bytes.length > 8 * 1024 * 1024) return res.status(413).json({ error: 'Image trop volumineuse après compression (8 Mo max).' });

    const form = new FormData();
    form.append('file', new Blob([bytes], { type: mime }), filename);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000);
    try {
      const r = await fetch('https://api.tripo3d.ai/v2/openapi/upload/sts', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}` },
        body: form,
        signal: controller.signal
      });
      const text = await r.text();
      let json;
      try { json = JSON.parse(text); } catch { json = { raw: text }; }
      if (!r.ok || json?.code !== 0) {
        return res.status(r.status || 502).json({ error: 'Échec upload Tripo.', details: json });
      }
      const imageToken = json?.data?.image_token || json?.data?.file_token || json?.data?.token;
      if (!imageToken) return res.status(502).json({ error: 'Tripo n’a pas renvoyé de jeton image.', details: json });
      return res.status(200).json({ image_token: imageToken, bytes: bytes.length, mime });
    } finally {
      clearTimeout(timeout);
    }
  } catch (e) {
    const message = e?.name === 'AbortError' ? 'Délai upload Tripo dépassé.' : (e?.message || 'Erreur upload Tripo');
    return res.status(500).json({ error: message });
  }
}
