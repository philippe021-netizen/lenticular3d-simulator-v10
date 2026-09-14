export const config = { api: { bodyParser: { sizeLimit: '15mb' } }, maxDuration: 60 };

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'POST requis' });
  }

  const directServiceUrl = process.env.DEPTHFLOW_SERVICE_URL;
  const runpodEndpointId = process.env.RUNPOD_ENDPOINT_ID;
  const runpodApiKey = process.env.RUNPOD_API_KEY;

  if (!directServiceUrl && !(runpodEndpointId && runpodApiKey)) {
    return res.status(503).json({
      error: 'Backend DepthFlow non configuré',
      expected: 'DEPTHFLOW_SERVICE_URL ou RUNPOD_ENDPOINT_ID + RUNPOD_API_KEY'
    });
  }

  try {
    let upstream;

    if (runpodEndpointId && runpodApiKey) {
      upstream = await fetch(`https://api.runpod.ai/v2/${runpodEndpointId}/runsync`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${runpodApiKey}`
        },
        body: JSON.stringify({ input: req.body })
      });
    } else {
      upstream = await fetch(directServiceUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(process.env.DEPTHFLOW_SERVICE_TOKEN
            ? { authorization: `Bearer ${process.env.DEPTHFLOW_SERVICE_TOKEN}` }
            : {})
        },
        body: JSON.stringify(req.body)
      });
    }

    const text = await upstream.text();
    let payload;
    try { payload = JSON.parse(text); }
    catch { payload = { error: text || `Erreur DepthFlow ${upstream.status}` }; }

    if (!upstream.ok) {
      return res.status(upstream.status).json(payload);
    }

    if (runpodEndpointId && runpodApiKey) {
      if (payload?.status && payload.status !== 'COMPLETED') {
        return res.status(502).json({
          error: `Runpod: ${payload.status}`,
          runpod: payload
        });
      }
      payload = payload?.output ?? payload;
    }

    if (payload?.error) {
      return res.status(502).json(payload);
    }

    return res.status(200).json(payload);
  } catch (error) {
    return res.status(502).json({ error: `Service DepthFlow inaccessible: ${error.message}` });
  }
}
