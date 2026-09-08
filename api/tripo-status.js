export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const key = process.env.TRIPO_API_KEY;
  if (!key) return res.status(500).json({ error: 'TRIPO_API_KEY manquante dans Vercel.' });

  const taskId = String(req.query?.task_id || '').trim();
  if (!taskId) return res.status(400).json({ error: 'task_id manquant.' });

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);
    try {
      const r = await fetch(`https://api.tripo3d.ai/v2/openapi/task/${encodeURIComponent(taskId)}`, {
        headers: { Authorization: `Bearer ${key}` },
        signal: controller.signal
      });
      const text = await r.text();
      let json;
      try { json = JSON.parse(text); } catch { json = { raw: text }; }
      if (!r.ok || json?.code !== 0) {
        return res.status(r.status || 502).json({ error: 'Échec lecture tâche Tripo.', details: json });
      }

      const d = json?.data || {};
      return res.status(200).json({
        task_id: d.task_id || taskId,
        type: d.type,
        status: d.status,
        progress: Number(d.progress || 0),
        output: {
          pbr_model: d.output?.pbr_model || null,
          model: d.output?.model || null,
          base_model: d.output?.base_model || null,
          rendered_image: d.output?.rendered_image || null
        },
        error: d.error || null
      });
    } finally {
      clearTimeout(timeout);
    }
  } catch (e) {
    const message = e?.name === 'AbortError' ? 'Délai statut Tripo dépassé.' : (e?.message || 'Erreur statut Tripo');
    return res.status(500).json({ error: message });
  }
}
