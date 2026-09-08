const ALLOWED_TEXTURE_QUALITY = new Set(['standard', 'detailed', 'extreme']);
const ALLOWED_GEOMETRY_QUALITY = new Set(['standard', 'detailed']);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const key = process.env.TRIPO_API_KEY;
  if (!key) return res.status(500).json({ error: 'TRIPO_API_KEY manquante dans Vercel.' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const imageToken = String(body.image_token || '').trim();
    if (!imageToken) return res.status(400).json({ error: 'image_token Tripo manquant.' });

    const textureQuality = ALLOWED_TEXTURE_QUALITY.has(body.texture_quality) ? body.texture_quality : 'extreme';
    const geometryQuality = ALLOWED_GEOMETRY_QUALITY.has(body.geometry_quality) ? body.geometry_quality : 'detailed';

    const payload = {
      type: 'image_to_model',
      model_version: 'v3.1-20260211',
      file: { type: 'jpeg', file_token: imageToken },
      texture: true,
      pbr: true,
      texture_quality: textureQuality,
      geometry_quality: geometryQuality,
      export_uv: true
    };

    if (Number.isInteger(body.model_seed)) payload.model_seed = body.model_seed;
    if (Number.isInteger(body.texture_seed)) payload.texture_seed = body.texture_seed;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000);
    try {
      const r = await fetch('https://api.tripo3d.ai/v2/openapi/task', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      const text = await r.text();
      let json;
      try { json = JSON.parse(text); } catch { json = { raw: text }; }
      if (!r.ok || json?.code !== 0) {
        return res.status(r.status || 502).json({ error: 'Échec création Tripo.', details: json });
      }
      const taskId = json?.data?.task_id;
      if (!taskId) return res.status(502).json({ error: 'Tripo n’a pas renvoyé de task_id.', details: json });
      return res.status(200).json({ task_id: taskId, profile: payload });
    } finally {
      clearTimeout(timeout);
    }
  } catch (e) {
    const message = e?.name === 'AbortError' ? 'Délai création Tripo dépassé.' : (e?.message || 'Erreur création Tripo');
    return res.status(500).json({ error: message });
  }
}
