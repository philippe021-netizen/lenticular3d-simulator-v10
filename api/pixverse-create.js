const ALLOWED_QUALITIES = new Set(['360p', '540p', '720p', '1080p']);
const ALLOWED_MOTION_MODES = new Set(['normal', 'fast']);
const PROMPT_POLICY_MARKER = 'LENTICULAR ONE-WAY MOTION POLICY';
const ONE_WAY_PROMPT_POLICY = `${PROMPT_POLICY_MARKER}: Perform exactly one continuous transition from the source state to one clearly different final state. Move progressively in one direction only. Reach the final state by 65% of the clip, then hold it completely motionless until the end. Never reverse, repeat, bounce, oscillate, loop, or return toward the starting pose. KEEP EVERY ANIMATED SUBJECT COMPLETELY INSIDE THE ORIGINAL FRAME AT ALL TIMES WITH A CLEAR SAFETY MARGIN. The entire visible silhouette of every person, couple, group member, child, animal, vehicle, machine, object and logo must remain visible from first frame to last frame. Hands, fingers, arms, head, hair, feet, paws, ears, tails, wheels, bodywork, machine parts and logo contours never touch or cross an image edge. Never enlarge a subject, move it toward the camera or push it outside its original framing. Use compact lateral movement and bend limbs when available space is limited. CAMERA AND BACKGROUND ARE A FROZEN PHOTOGRAPHIC PLATE: no camera shift and no environmental motion; water, waves, foam, foliage, clouds, birds, lights, shadows and every unmentioned person, animal or object remain pixel-stable. Only the specifically named subjects, body parts or effect may move. Preserve every identity, anatomy, clothing, scale, framing and geometry.`;
const ONE_WAY_NEGATIVE_POLICY = 'reverse motion, return to starting pose, return to initial pose, repeated action, second action, bounce, oscillation, boomerang motion, loop, cyclic motion, ping pong motion, cropped subject, partial body, cut off subject, out of frame, subject touching image edge, cropped hands, hands outside frame, cropped arms, arms outside frame, cropped head, cropped hair, cropped feet, feet outside frame, cropped paws, cropped tail, cropped wheels, cropped vehicle, cropped machine, cropped object, cropped logo, limbs crossing image edge, subject enlargement, subject drift, body moving toward camera, moving water, moving waves, moving foam, moving foliage, moving trees, moving clouds, moving birds, bird motion, changing shadows, changing background, background regeneration, environmental motion';

function clampInt(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function appendPolicy(value, policy, marker = '', separator = ' ') {
  const source = String(value || '').trim();
  if (marker && source.includes(marker)) return source.slice(0, 5000);
  const joiner = source ? separator : '';
  const room = Math.max(0, 5000 - joiner.length - policy.length);
  return `${source.slice(0, room)}${joiner}${policy}`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const key = process.env.PIXVERSE_API_KEY;
  if (!key) return res.status(500).json({ error: 'PIXVERSE_API_KEY manquante dans Vercel.' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const imgId = Number(body.img_id);
    if (!Number.isFinite(imgId) || imgId <= 0) {
      return res.status(400).json({ error: 'img_id PixVerse invalide.' });
    }

    const duration = clampInt(body.duration, 1, 15, 2);
    const quality = ALLOWED_QUALITIES.has(body.quality) ? body.quality : '540p';
    const motionMode = ALLOWED_MOTION_MODES.has(body.motion_mode) ? body.motion_mode : 'normal';
    const basePrompt = String(body.prompt || '').trim();
    const baseNegativePrompt = String(body.negative_prompt || '').trim();
    const prompt = appendPolicy(basePrompt, ONE_WAY_PROMPT_POLICY, PROMPT_POLICY_MARKER);
    const negativePrompt = appendPolicy(baseNegativePrompt, ONE_WAY_NEGATIVE_POLICY, 'reverse motion, return to starting pose', ', ');
    const seed = Number.isFinite(Number(body.seed)) ? clampInt(body.seed, 0, 2147483647, 0) : 0;
    const generateAudio = body.generate_audio_switch === true;

    if (!basePrompt) {
      return res.status(400).json({ error: 'Prompt PixVerse manquant.' });
    }

    const payload = {
      duration,
      img_id: imgId,
      model: 'v6',
      motion_mode: motionMode,
      prompt,
      quality,
      seed,
      generate_audio_switch: generateAudio
    };

    if (negativePrompt) payload.negative_prompt = negativePrompt;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000);

    try {
      const r = await fetch('https://app-api.pixverse.ai/openapi/v2/video/img/generate', {
        method: 'POST',
        headers: {
          'API-KEY': key,
          'Ai-trace-id': crypto.randomUUID(),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      const text = await r.text();
      res.status(r.status).setHeader('Content-Type', 'application/json').send(text);
    } finally {
      clearTimeout(timeout);
    }
  } catch (e) {
    const message = e?.name === 'AbortError' ? 'Délai PixVerse dépassé.' : (e?.message || 'Erreur création PixVerse');
    res.status(500).json({ error: message });
  }
}
