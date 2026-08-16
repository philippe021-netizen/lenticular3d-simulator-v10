export const config = { api: { bodyParser: false } };

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function getKey() {
  return process.env.STABILITY_API_KEY ||
    process.env['CLÉ_API_STABILITÉ'] ||
    process.env.CLE_API_STABILITE ||
    Object.entries(process.env).find(([k]) => {
      const n = k.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
      return n === 'CLE_API_STABILITE' || n === 'STABILITY_API_KEY';
    })?.[1];
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const key = getKey();
  if (!key) return res.status(500).json({ error: 'Clé Stability AI introuvable.' });
  try {
    const raw = await readBody(req);
    const contentType = req.headers['content-type'];
    if (!contentType || !contentType.includes('multipart/form-data')) {
      return res.status(400).json({ error: 'multipart/form-data requis.' });
    }
    const upstream = await fetch('https://api.stability.ai/v2beta/stable-image/edit/remove-background', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        Accept: 'image/*',
        'Content-Type': contentType,
        'Stability-Client-ID': 'lenticular3d-simulator',
        'Stability-Client-Version': '1.1.0'
      },
      body: raw
    });
    if (!upstream.ok) {
      let msg = `Remove Background ${upstream.status}`;
      try { msg += `: ${await upstream.text()}`; } catch {}
      return res.status(upstream.status).json({ error: msg });
    }
    const buf = Buffer.from(await upstream.arrayBuffer());
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).send(buf);
  } catch (err) {
    res.status(500).json({ error: err?.message || 'Erreur interne détourage.' });
  }
}
