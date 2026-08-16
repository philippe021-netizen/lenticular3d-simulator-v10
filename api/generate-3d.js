export const config = { api: { bodyParser: false } };

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST only' });
    return;
  }
  const key =
    process.env.STABILITY_API_KEY ||
    process.env['CLÉ_API_STABILITÉ'] ||
    process.env.CLE_API_STABILITE ||
    Object.entries(process.env).find(([k]) => {
      const n = k.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
      return n === 'CLE_API_STABILITE' || n === 'STABILITY_API_KEY';
    })?.[1];
  if (!key) {
    res.status(500).json({ error: 'Clé Stability AI introuvable sur le serveur. Noms acceptés : STABILITY_API_KEY ou CLÉ_API_STABILITÉ.' });
    return;
  }

  try {
    const raw = await readBody(req);
    const contentType = req.headers['content-type'];
    if (!contentType || !contentType.includes('multipart/form-data')) {
      res.status(400).json({ error: 'multipart/form-data requis.' });
      return;
    }

    const upstream = await fetch('https://api.stability.ai/v2beta/3d/stable-fast-3d', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        Accept: 'model/gltf-binary',
        'Content-Type': contentType,
        'Stability-Client-ID': 'lenticular3d-simulator',
        'Stability-Client-Version': '1.0.0'
      },
      body: raw
    });

    if (!upstream.ok) {
      let msg = `Stability API ${upstream.status}`;
      try { msg += `: ${await upstream.text()}`; } catch {}
      res.status(upstream.status).json({ error: msg });
      return;
    }

    const buf = Buffer.from(await upstream.arrayBuffer());
    res.setHeader('Content-Type', 'model/gltf-binary');
    res.setHeader('Content-Disposition', 'inline; filename="subject.glb"');
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).send(buf);
  } catch (err) {
    res.status(500).json({ error: err?.message || 'Erreur interne.' });
  }
}
