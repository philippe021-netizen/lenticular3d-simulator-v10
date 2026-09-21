const ALLOWED_QUALITIES = new Set(['360p', '540p', '720p', '1080p']);
const ALLOWED_MOTION_MODES = new Set(['normal', 'fast']);
const ALLOWED_ASPECT_RATIOS = new Set(['auto','16:9','4:3','1:1','3:4','9:16','2:3','3:2','21:9']);
const ALLOWED_MODES = new Set(['standard','transition','omni','multi_transition','modify']);

const PROMPT_POLICY_MARKER = 'LENTICULAR ONE-WAY MOTION POLICY';
const ONE_WAY_PROMPT_POLICY = `${PROMPT_POLICY_MARKER}: Perform exactly one continuous transition from the source state to one clearly different final state. Move progressively in one direction only. Reach the final state by 65% of the clip, then hold it completely motionless until the end. Never reverse, repeat, bounce, oscillate, loop, or return toward the starting pose. KEEP EVERY ANIMATED SUBJECT COMPLETELY INSIDE THE ORIGINAL FRAME AT ALL TIMES WITH A CLEAR SAFETY MARGIN. The entire visible silhouette of every person, couple, group member, child, animal, vehicle, machine, object and logo must remain visible from first frame to last frame. Hands, fingers, arms, head, hair, feet, paws, ears, tails, wheels, bodywork, machine parts and logo contours never touch or cross an image edge. Never enlarge a subject, move it toward the camera or push it outside its original framing. CAMERA AND BACKGROUND ARE A FROZEN PHOTOGRAPHIC PLATE: no camera shift and no environmental motion. Only the specifically named subjects, body parts or effect may move. Preserve every identity, anatomy, clothing, scale, framing and geometry.`;
const ONE_WAY_NEGATIVE_POLICY = 'reverse motion, return to starting pose, repeated action, bounce, oscillation, loop, cropped subject, partial body, out of frame, subject touching image edge, subject enlargement, subject drift, camera movement, camera shake, zoom, moving background, changing shadows, background regeneration, environmental motion, face change, identity change, extra limbs, extra fingers, duplicate person, duplicate object';

function clampInt(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function positiveInt(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function appendPolicy(value, policy, marker = '', separator = ' ') {
  const source = String(value || '').trim();
  if (marker && source.includes(marker)) return source.slice(0, 5000);
  const joiner = source ? separator : '';
  const room = Math.max(0, 5000 - joiner.length - policy.length);
  return `${source.slice(0, room)}${joiner}${policy}`;
}

function cleanRefs(items, max, idField) {
  if (!Array.isArray(items)) return [];
  return items.slice(0, max).map((item, i) => {
    const id = positiveInt(item?.[idField]);
    if (!id) return null;
    const out = { [idField]: id };
    if (item?.ref_name) out.ref_name = String(item.ref_name).replace(/^@/, '').slice(0, 64);
    if (idField === 'img_id' && item?.type) out.type = String(item.type).slice(0, 32);
    if (idField === 'video_media_id' && positiveInt(item?.source_video_id)) {
      delete out.video_media_id;
      out.source_video_id = positiveInt(item.source_video_id);
    }
    return out;
  }).filter(Boolean);
}

async function callPixVerse(key, endpoint, payload, mode, signal) {
  const r = await fetch(`https://app-api.pixverse.ai/openapi/v2${endpoint}`, {
    method: 'POST',
    headers: {
      'API-KEY': key,
      'Ai-trace-id': crypto.randomUUID(),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload),
    signal
  });

  const text = await r.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; }
  catch { return { status:r.status, raw:text, data:null }; }

  if (data && typeof data === 'object') {
    data._microplayer = { mode, endpoint };
  }
  return { status:r.status, raw:JSON.stringify(data), data };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const key = process.env.PIXVERSE_API_KEY;
  if (!key) return res.status(500).json({ error: 'PIXVERSE_API_KEY manquante dans Vercel.' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const mode = ALLOWED_MODES.has(body.mode) ? body.mode : 'standard';
    const quality = ALLOWED_QUALITIES.has(body.quality) ? body.quality : '540p';
    const motionMode = ALLOWED_MOTION_MODES.has(body.motion_mode) ? body.motion_mode : 'normal';
    const seed = Number.isFinite(Number(body.seed)) ? clampInt(body.seed, 0, 2147483647, 0) : 0;
    const generateAudio = body.generate_audio_switch === true;
    const basePrompt = String(body.prompt || '').trim();
    const baseNegativePrompt = String(body.negative_prompt || '').trim();
    const prompt = appendPolicy(basePrompt, ONE_WAY_PROMPT_POLICY, PROMPT_POLICY_MARKER);
    const negativePrompt = appendPolicy(baseNegativePrompt, ONE_WAY_NEGATIVE_POLICY, 'reverse motion, return to starting pose', ', ');
    const aspectRatio = ALLOWED_ASPECT_RATIOS.has(body.aspect_ratio) ? body.aspect_ratio : 'auto';

    if (!basePrompt && mode !== 'multi_transition') {
      return res.status(400).json({ error: 'Prompt PixVerse manquant.' });
    }

    let endpoint = '/video/img/generate';
    let payload;

    if (mode === 'standard') {
      const imgId = positiveInt(body.img_id);
      if (!imgId) return res.status(400).json({ error: 'img_id PixVerse invalide.' });
      payload = {
        duration: clampInt(body.duration, 1, 15, 2),
        img_id: imgId,
        model: 'v6',
        motion_mode: motionMode,
        prompt,
        quality,
        seed,
        generate_audio_switch: generateAudio
      };
      if (negativePrompt) payload.negative_prompt = negativePrompt;
    }

    if (mode === 'transition') {
      endpoint = '/video/transition/generate';
      const first = positiveInt(body.first_frame_img);
      const last = positiveInt(body.last_frame_img);
      if (!first || !last) return res.status(400).json({ error: 'first_frame_img et last_frame_img sont requis.' });
      payload = {
        first_frame_img: first,
        last_frame_img: last,
        model: 'v6',
        prompt,
        duration: clampInt(body.duration, 1, 15, 1),
        quality,
        seed,
        generate_audio_switch: generateAudio
      };
      if (negativePrompt) payload.negative_prompt = negativePrompt;
    }

    if (mode === 'omni') {
      endpoint = '/video/fusion/generate';
      const imageReferences = cleanRefs(body.image_references, 10, 'img_id');
      const videoReferences = cleanRefs(body.video_references, 2, 'video_media_id');
      if (!imageReferences.length && !videoReferences.length) {
        return res.status(400).json({ error: 'Omni requiert au moins une image ou une vidéo de référence.' });
      }
      payload = {
        model: 'v6',
        prompt,
        duration: videoReferences.length ? 0 : clampInt(body.duration, 1, 15, 2),
        quality,
        aspect_ratio: aspectRatio,
        reference_mode: 'omni',
        seed,
        generate_audio_switch: generateAudio
      };
      if (imageReferences.length) payload.image_references = imageReferences;
      if (videoReferences.length) payload.video_references = videoReferences;
      if (negativePrompt) payload.negative_prompt = negativePrompt;
    }

    if (mode === 'multi_transition') {
      endpoint = '/video/multi_transition/generate';
      const src = Array.isArray(body.multi_transition) ? body.multi_transition.slice(0, 7) : [];
      if (src.length < 2) return res.status(400).json({ error: 'Multi-transition requiert 2 à 7 images clés.' });
      const items = src.map((item, i) => {
        const imgId = positiveInt(item?.img_id);
        if (!imgId) return null;
        const isLast = i === src.length - 1;
        const maxDuration = src.length >= 3 ? 5 : 8;
        return {
          img_id: imgId,
          duration: isLast ? 0 : clampInt(item?.duration, 1, maxDuration, 1),
          prompt: String(item?.prompt || '').trim().slice(0, 5000)
        };
      }).filter(Boolean);
      if (items.length !== src.length) return res.status(400).json({ error: 'Une image clé Multi-transition contient un img_id invalide.' });
      payload = {
        multi_transition: items,
        model: 'v5',
        quality
      };
      if (motionMode === 'fast') payload.motion_mode = 'fast';
    }

    if (mode === 'modify') {
      endpoint = '/video/modify/generate';
      const videoMediaId = positiveInt(body.video_media_id);
      if (!videoMediaId) return res.status(400).json({ error: 'video_media_id est requis pour Modify.' });
      payload = {
        video_media_id: videoMediaId,
        prompt: basePrompt.slice(0, 5000),
        quality
      };
      if (Array.isArray(body.img_ids) && body.img_ids.length) {
        payload.img_ids = body.img_ids.map(positiveInt).filter(Boolean).slice(0, 10);
      }
      if (Array.isArray(body.mask_ids) && body.mask_ids.length) {
        payload.mask_ids = body.mask_ids.map(v => String(v)).filter(Boolean).slice(0, 10);
      }
      if (body.keyframe_ids !== undefined && body.keyframe_ids !== null) {
        payload.keyframe_ids = body.keyframe_ids;
      }
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000);
    try {
      const result = await callPixVerse(key, endpoint, payload, mode, controller.signal);
      res.status(result.status).setHeader('Content-Type', 'application/json').send(result.raw);
    } finally {
      clearTimeout(timeout);
    }
  } catch (e) {
    const message = e?.name === 'AbortError' ? 'Délai PixVerse dépassé.' : (e?.message || 'Erreur création PixVerse');
    res.status(500).json({ error: message });
  }
}
