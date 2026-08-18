function traceId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });
  const key = process.env.PIXVERSE_API_KEY;
  if (!key) return res.status(500).json({ error: 'PIXVERSE_API_KEY absente sur Vercel.' });

  const videoId = String(req.query?.video_id || '').trim();
  if (!/^\d+$/.test(videoId)) return res.status(400).json({ error: 'video_id invalide.' });

  try {
    const upstream = await fetch(`https://app-api.pixverse.ai/openapi/v2/video/result/${videoId}`, {
      headers: { 'API-KEY': key, 'Ai-trace-id': traceId() }
    });
    const json = await upstream.json().catch(() => null);
    if (!upstream.ok || !json || json.ErrCode !== 0) {
      return res.status(upstream.status || 502).json({ error: json?.ErrMsg || 'Statut PixVerse indisponible.', details: json });
    }
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      ok: true,
      status: json.Resp?.status,
      url: json.Resp?.url || null,
      width: json.Resp?.outputWidth || null,
      height: json.Resp?.outputHeight || null
    });
  } catch (err) {
    return res.status(500).json({ error: err?.message || 'Erreur statut PixVerse.' });
  }
}
