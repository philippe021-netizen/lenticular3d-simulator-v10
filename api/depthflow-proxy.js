export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'POST requis' });
  }

  const serviceUrl = process.env.DEPTHFLOW_SERVICE_URL;
  if (!serviceUrl) {
    return res.status(503).json({
      error: 'DEPTHFLOW_SERVICE_URL non configurée',
      expected_contract: {
        method: 'POST',
        body: ['image', 'depth_strength', 'camera_amplitude', 'views', 'center_original'],
        response: { views: ['data:image/png;base64,... x9'] }
      }
    });
  }

  try {
    const upstream = await fetch(serviceUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(process.env.DEPTHFLOW_SERVICE_TOKEN
          ? { authorization: `Bearer ${process.env.DEPTHFLOW_SERVICE_TOKEN}` }
          : {})
      },
      body: JSON.stringify(req.body)
    });

    const text = await upstream.text();
    let payload;
    try { payload = JSON.parse(text); }
    catch { payload = { error: text || `Erreur DepthFlow ${upstream.status}` }; }

    return res.status(upstream.status).json(payload);
  } catch (error) {
    return res.status(502).json({ error: `Service DepthFlow inaccessible: ${error.message}` });
  }
}
