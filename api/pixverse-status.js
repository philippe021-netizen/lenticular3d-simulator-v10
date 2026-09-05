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
    if (!r.ok) return res.status(r.status).setHeader('Content-Type', 'application/json').send(text);

    let d;
    try { d = JSON.parse(text); } catch { return res.status(r.status).setHeader('Content-Type', 'application/json').send(text); }

    // Quand PixVerse a terminé, on garde l'URL CDN d'origine pour diagnostic mais
    // on renvoie au navigateur une URL same-origin basée sur le video_id. Le proxy
    // redemande ensuite une URL fraîche côté serveur au moment exact de la lecture.
    const proxyUrl = `/api/pixverse-video?video_id=${encodeURIComponent(rawId)}`;
    if (d?.Resp?.url) { d.Resp.source_url = d.Resp.url; d.Resp.url = proxyUrl; }
    if (d?.Resp?.video_url) { d.Resp.source_video_url = d.Resp.video_url; d.Resp.video_url = proxyUrl; }
    if (d?.url) { d.source_url = d.url; d.url = proxyUrl; }
    if (d?.video_url) { d.source_video_url = d.video_url; d.video_url = proxyUrl; }
    if (d?.data?.url) { d.data.source_url = d.data.url; d.data.url = proxyUrl; }
    if (d?.data?.video_url) { d.data.source_video_url = d.data.video_url; d.data.video_url = proxyUrl; }

    res.status(r.status).json(d);
  } catch (e) {
    const message = e?.name === 'AbortError' ? 'Délai statut PixVerse dépassé.' : (e?.message || 'Erreur statut PixVerse');
    res.status(500).json({ error: message });
  } finally {
    clearTimeout(timeout);
  }
}
