function readOutputText(data) {
  if (typeof data?.output_text === 'string') return data.output_text;
  const chunks = [];
  for (const item of data?.output || []) {
    for (const content of item?.content || []) {
      if (typeof content?.text === 'string') chunks.push(content.text);
    }
  }
  return chunks.join('\n');
}

function localPrompt(idea) {
  return `Use the uploaded image as the exact visual reference. Perform exactly this requested action once: "${idea}" — interpret it as one simple, continuous and physically plausible transition. Animate only the subject or parts explicitly involved in the request. Preserve the exact identity, anatomy, appearance, proportions, colors and geometry of every subject.`;
}

const LOCAL_NEGATIVE = 'extra action, invented action, subject replacement, changed identity, face morphing, anatomy change, geometry change, duplicated subject, extra limbs, extra wheels, added object, text, letters, numbers, logo, watermark';

function fallback(idea, reason = 'local-template') {
  return {
    prompt: localPrompt(idea),
    negativePrompt: LOCAL_NEGATIVE,
    interpretedAction: idea,
    provider: reason
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  res.setHeader('Cache-Control', 'no-store, max-age=0');

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const idea = String(body.idea || '').replace(/\s+/g, ' ').trim().slice(0, 800);
    if (!idea) return res.status(400).json({ error: 'Décris l’action souhaitée en une phrase.' });

    const gatewayKey = process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN;
    const openaiKey = process.env.OPENAI_API_KEY;
    const key = gatewayKey || openaiKey;
    if (!key) return res.status(200).json(fallback(idea));

    const instructions = `You write concise English image-to-video prompts for a 2-second, nine-view lenticular sequence.
Transform the operator's request into ONE action only. Do not invent a second action or a new subject.
The uploaded image is the exact visual reference. Preserve every person's identity and anatomy, and preserve every animal, vehicle, machine, product, object or logo's exact appearance, proportions, colors and geometry.
The action must progress continuously in one direction, reach its final state by 65% of the clip, and then hold completely still. It must never reverse, repeat, bounce, oscillate, loop or return.
Every animated subject must remain entirely inside the original frame with a clear safety margin from first frame to last frame. No hand, foot, paw, tail, wheel, bodywork, machine part or contour may touch or cross an edge. Never zoom or move a subject toward the camera.
The camera and background are frozen. Animate only the explicitly requested subject or part.
Return only valid JSON: {"prompt":"...","negativePrompt":"...","interpretedAction":"..."}.`;
    const endpoint = gatewayKey ? 'https://ai-gateway.vercel.sh/v1/responses' : 'https://api.openai.com/v1/responses';
    const model = gatewayKey ? 'openai/gpt-5.6-luna' : 'gpt-5.6-luna';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45000);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          instructions,
          input: `Operator request: ${idea}`,
          max_output_tokens: 900
        }),
        signal: controller.signal
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) return res.status(200).json(fallback(idea, 'local-fallback'));
      const text = readOutputText(data).trim().replace(/^```json\s*/i, '').replace(/```$/, '').trim();
      let parsed;
      try { parsed = JSON.parse(text); } catch (_) { return res.status(200).json(fallback(idea, 'local-fallback')); }
      const prompt = String(parsed?.prompt || '').trim().slice(0, 3200);
      const negativePrompt = String(parsed?.negativePrompt || parsed?.negative_prompt || LOCAL_NEGATIVE).trim().slice(0, 1800);
      if (!prompt) return res.status(200).json(fallback(idea, 'local-fallback'));
      return res.status(200).json({
        prompt,
        negativePrompt,
        interpretedAction: String(parsed?.interpretedAction || idea).trim().slice(0, 800),
        provider: gatewayKey ? 'vercel-ai-gateway' : 'openai-direct'
      });
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    const body = typeof req.body === 'object' && req.body ? req.body : {};
    const idea = String(body.idea || '').replace(/\s+/g, ' ').trim().slice(0, 800);
    if (idea) return res.status(200).json(fallback(idea, 'local-fallback'));
    return res.status(500).json({ error: error?.message || 'Impossible de préparer le prompt PixVerse.' });
  }
}
