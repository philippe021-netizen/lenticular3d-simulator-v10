const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const PROMPT_POLICY_MARKER = 'LENTICULAR ONE-WAY MOTION POLICY';
const ONE_WAY_PROMPT_POLICY = `${PROMPT_POLICY_MARKER}: Perform exactly one continuous transition from the source state to one clearly different final state. Move progressively in one direction only. Reach the final state by 65% of the clip, then hold it completely motionless until the end. Never reverse, repeat, bounce, oscillate, loop, or return toward the starting pose. KEEP EVERY ANIMATED SUBJECT COMPLETELY INSIDE THE ORIGINAL FRAME AT ALL TIMES WITH A CLEAR SAFETY MARGIN. The entire visible silhouette of every person, couple, group member, child, animal, vehicle, machine, object and logo must remain visible from first frame to last frame. Hands, fingers, arms, head, hair, feet, paws, ears, tails, wheels, bodywork, machine parts and logo contours never touch or cross an image edge. Never enlarge a subject, move it toward the camera or push it outside its original framing. Use compact lateral movement and bend limbs when available space is limited. CAMERA AND BACKGROUND ARE A FROZEN PHOTOGRAPHIC PLATE: no camera shift and no environmental motion; water, waves, foam, foliage, clouds, birds, lights, shadows and every unmentioned person, animal or object remain pixel-stable. Only the specifically named subjects, body parts or effect may move. Preserve every identity, anatomy, clothing, scale, framing and geometry.`;
const ONE_WAY_NEGATIVE_POLICY = 'reverse motion, return to starting pose, return to initial pose, repeated action, second action, bounce, oscillation, boomerang motion, loop, cyclic motion, ping pong motion, cropped subject, partial body, cut off subject, out of frame, subject touching image edge, cropped hands, hands outside frame, cropped arms, arms outside frame, cropped head, cropped hair, cropped feet, feet outside frame, cropped paws, cropped tail, cropped wheels, cropped vehicle, cropped machine, cropped object, cropped logo, limbs crossing image edge, subject enlargement, subject drift, body moving toward camera, moving water, moving waves, moving foam, moving foliage, moving trees, moving clouds, moving birds, bird motion, changing shadows, changing background, background regeneration, environmental motion';

function appendPolicy(value, policy, marker = '', separator = ' ') {
  const source = String(value || '').trim();
  if (marker && source.includes(marker)) return source.slice(0, 5000);
  const joiner = source ? separator : '';
  const room = Math.max(0, 5000 - joiner.length - policy.length);
  return `${source.slice(0, room)}${joiner}${policy}`;
}

export function hardenPixVersePrompts(prompt, negativePrompt = '') {
  return {
    prompt: appendPolicy(prompt, ONE_WAY_PROMPT_POLICY, PROMPT_POLICY_MARKER),
    negativePrompt: appendPolicy(negativePrompt, ONE_WAY_NEGATIVE_POLICY, 'reverse motion, return to starting pose', ', '),
    policy: 'lenticular-one-way-v1'
  };
}

async function readJson(r) {
  const text = await r.text();
  let data = null;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!r.ok) throw new Error(data?.error || data?.message || data?.ErrMsg || `Erreur HTTP ${r.status}`);
  if (Number(data?.ErrCode) && Number(data.ErrCode) !== 0) {
    throw new Error(data?.ErrMsg || `Erreur PixVerse ${data.ErrCode}`);
  }
  return data;
}

export async function uploadPixVerseImage(file) {
  const form = new FormData();
  // PixVerse attend impérativement le champ multipart nommé "image".
  form.append('image', file, file.name || `happyholo-${Date.now()}.png`);
  const r = await fetch('/api/pixverse-upload', { method: 'POST', body: form });
  const data = await readJson(r);
  const imgId = data?.Resp?.img_id ?? data?.img_id ?? data?.data?.img_id;
  if (imgId === undefined || imgId === null || imgId === '') {
    throw new Error(`PixVerse n’a pas renvoyé de img_id${data?.ErrMsg ? ` : ${data.ErrMsg}` : ''}.`);
  }
  return { imgId, raw: data };
}

export async function createPixVerseVideo({ imgId, prompt, negativePrompt = '', duration = 2, quality = '540p', motionMode = 'normal', seed = 0, audio = false }) {
  const r = await fetch('/api/pixverse-create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      img_id: imgId,
      prompt,
      negative_prompt: negativePrompt,
      duration,
      quality,
      motion_mode: motionMode,
      seed,
      generate_audio_switch: audio === true
    })
  });
  const data = await readJson(r);
  const videoId = data?.Resp?.video_id ?? data?.video_id ?? data?.data?.video_id;
  if (videoId === undefined || videoId === null || videoId === '') throw new Error('PixVerse n’a pas renvoyé de video_id.');
  return { videoId, raw: data };
}

export async function getPixVerseStatus(videoId) {
  const r = await fetch(`/api/pixverse-status?id=${encodeURIComponent(videoId)}`, { cache: 'no-store' });
  return readJson(r);
}

export async function waitForPixVerse(videoId, { intervalMs = 4000, timeoutMs = 180000, onStatus } = {}) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const data = await getPixVerseStatus(videoId);
    onStatus?.(data);
    const status = Number(data?.Resp?.status ?? data?.status ?? data?.data?.status);
    const url = data?.Resp?.url ?? data?.url ?? data?.data?.url;
    if (status === 1 && url) return { url, raw: data };
    if (status === 7) throw new Error('PixVerse a refusé la génération (modération).');
    if (status === 8) throw new Error('La génération PixVerse a échoué.');
    await sleep(intervalMs);
  }
  throw new Error('Délai d’attente PixVerse dépassé.');
}

export function proxiedPixVerseVideoUrl(url) {
  return `/api/pixverse-video?url=${encodeURIComponent(url)}`;
}

export async function runPixVerseAction(file, variant, { onStatus } = {}) {
  if (!file) throw new Error('Image source manquante.');
  if (!variant?.prompt) throw new Error('Prompt d’action manquant.');
  const hardened = hardenPixVersePrompts(variant.prompt, variant.negativePrompt || '');
  onStatus?.({ step: 'upload' });
  const { imgId } = await uploadPixVerseImage(file);
  onStatus?.({ step: 'create', imgId });
  const { videoId } = await createPixVerseVideo({
    imgId,
    prompt: hardened.prompt,
    negativePrompt: hardened.negativePrompt,
    duration: variant.duration ?? 2,
    quality: variant.quality || '540p',
    motionMode: variant.motionMode || 'normal',
    seed: variant.seed ?? 0,
    audio: variant.audio === true
  });
  onStatus?.({ step: 'processing', videoId });
  const result = await waitForPixVerse(videoId, { onStatus: s => onStatus?.({ step: 'processing', videoId, response: s }) });
  const videoUrl = proxiedPixVerseVideoUrl(result.url);
  onStatus?.({ step: 'done', videoId, videoUrl });
  return {
    imgId,
    videoId,
    sourceUrl: result.url,
    videoUrl,
    response: result.raw,
    promptUsed: hardened.prompt,
    negativePromptUsed: hardened.negativePrompt,
    promptPolicy: hardened.policy
  };
}
