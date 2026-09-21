const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const PROMPT_POLICY_MARKER = 'LENTICULAR ONE-WAY MOTION POLICY';
const ONE_WAY_PROMPT_POLICY = `${PROMPT_POLICY_MARKER}: Perform exactly one continuous transition from the source state to one clearly different final state. Move progressively in one direction only. Reach the final state by 65% of the clip, then hold it completely motionless until the end. Never reverse, repeat, bounce, oscillate, loop, or return toward the starting pose. KEEP EVERY ANIMATED SUBJECT COMPLETELY INSIDE THE ORIGINAL FRAME AT ALL TIMES WITH A CLEAR SAFETY MARGIN. The entire visible silhouette of every person, couple, group member, child, animal, vehicle, machine, object and logo must remain visible from first frame to last frame. Hands, fingers, arms, head, hair, feet, paws, ears, tails, wheels, bodywork, machine parts and logo contours never touch or cross an image edge. Never enlarge a subject, move it toward the camera or push it outside its original framing. CAMERA AND BACKGROUND ARE A FROZEN PHOTOGRAPHIC PLATE: no camera shift and no environmental motion. Only the specifically named subjects, body parts or effect may move. Preserve every identity, anatomy, clothing, scale, framing and geometry.`;
const ONE_WAY_NEGATIVE_POLICY = 'reverse motion, return to starting pose, repeated action, bounce, oscillation, loop, cropped subject, partial body, out of frame, subject touching image edge, subject enlargement, subject drift, camera movement, camera shake, zoom, moving background, changing shadows, background regeneration, environmental motion, face change, identity change, extra limbs, extra fingers, duplicate person, duplicate object';

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
    policy: 'lenticular-one-way-v2'
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

export async function getPixVerseDiagnostic() {
  const r = await fetch('/api/pixverse-diag?ts=' + Date.now(), { cache: 'no-store' });
  return readJson(r);
}

export async function uploadPixVerseImage(file) {
  const form = new FormData();
  form.append('image', file, file.name || `microplayer-${Date.now()}.png`);
  const r = await fetch('/api/pixverse-upload?kind=image', { method: 'POST', body: form });
  const data = await readJson(r);
  const imgId = data?.Resp?.img_id ?? data?.img_id ?? data?.data?.img_id;
  if (imgId === undefined || imgId === null || imgId === '') {
    throw new Error(`PixVerse n’a pas renvoyé de img_id${data?.ErrMsg ? ` : ${data.ErrMsg}` : ''}.`);
  }
  return { imgId: Number(imgId), raw: data };
}

export async function uploadPixVerseMedia(file) {
  const form = new FormData();
  form.append('file', file, file.name || `microplayer-guide-${Date.now()}.mp4`);
  const r = await fetch('/api/pixverse-upload?kind=media', { method: 'POST', body: form });
  const data = await readJson(r);
  const mediaId = data?.Resp?.media_id ?? data?.media_id ?? data?.data?.media_id;
  if (mediaId === undefined || mediaId === null || mediaId === '') {
    throw new Error(`PixVerse n’a pas renvoyé de media_id${data?.ErrMsg ? ` : ${data.ErrMsg}` : ''}.`);
  }
  return { mediaId: Number(mediaId), raw: data };
}

export function choosePixVerseMode({ mode = 'auto', endFile, motionGuideFile, keyframeFiles, modify } = {}) {
  if (mode && mode !== 'auto') return mode;
  if (modify) return 'modify';
  if (motionGuideFile) return 'omni';
  if (Array.isArray(keyframeFiles) && keyframeFiles.length) return 'multi_transition';
  if (endFile) return 'transition';
  return 'standard';
}

export function estimatePixVerseCredits({ mode = 'standard', quality = '540p', duration = 2, hasVideoReferences = false, keyframeCount = 0 } = {}) {
  const q = ['360p','540p','720p','1080p'].includes(quality) ? quality : '540p';
  if (mode === 'standard' || mode === 'transition' || mode === 'omni') {
    const table = hasVideoReferences
      ? { '360p':10, '540p':14, '720p':18, '1080p':36 }
      : { '360p':5, '540p':7, '720p':9, '1080p':18 };
    return Math.max(1, Number(duration) || 1) * table[q];
  }
  if (mode === 'multi_transition') {
    const seconds = Math.max(1, Number(duration) || Math.max(1, keyframeCount - 1));
    const tables = {
      '360p':[0,23,27,32,36,45,59,72,90,95,99],
      '540p':[0,23,27,32,36,45,59,72,90,95,99],
      '720p':[0,30,36,42,48,60,78,96,120,126,132],
      '1080p':[0,60,72,84,96,120,156,192,240,252,264]
    };
    const row = tables[q];
    return seconds <= 10 ? row[seconds] : null;
  }
  return null;
}

export async function createPixVerseVideo({
  mode = 'standard',
  imgId,
  firstFrameImg,
  lastFrameImg,
  imageReferences,
  videoReferences,
  multiTransition,
  videoMediaId,
  imgIds,
  maskIds,
  keyframeIds,
  prompt,
  negativePrompt = '',
  duration = 2,
  quality = '540p',
  motionMode = 'normal',
  seed = 0,
  audio = false,
  aspectRatio = 'auto'
}) {
  const body = {
    mode,
    prompt,
    negative_prompt: negativePrompt,
    duration,
    quality,
    motion_mode: motionMode,
    seed,
    generate_audio_switch: audio === true,
    aspect_ratio: aspectRatio
  };

  if (imgId) body.img_id = imgId;
  if (firstFrameImg) body.first_frame_img = firstFrameImg;
  if (lastFrameImg) body.last_frame_img = lastFrameImg;
  if (imageReferences?.length) body.image_references = imageReferences;
  if (videoReferences?.length) body.video_references = videoReferences;
  if (multiTransition?.length) body.multi_transition = multiTransition;
  if (videoMediaId) body.video_media_id = videoMediaId;
  if (imgIds?.length) body.img_ids = imgIds;
  if (maskIds?.length) body.mask_ids = maskIds;
  if (keyframeIds !== undefined) body.keyframe_ids = keyframeIds;

  const r = await fetch('/api/pixverse-create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await readJson(r);
  const videoId = data?.Resp?.video_id ?? data?.video_id ?? data?.data?.video_id;
  if (videoId === undefined || videoId === null || videoId === '') throw new Error('PixVerse n’a pas renvoyé de video_id.');
  return { videoId, raw: data, mode: data?._microplayer?.mode || mode };
}


export async function selectPixVerseMasks(videoFile, { keyframeId = 0 } = {}) {
  if (!videoFile) throw new Error('Vidéo source requise pour analyser les masques.');
  const { mediaId } = await uploadPixVerseMedia(videoFile);
  const r = await fetch('/api/pixverse-create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      mode: 'mask_selection',
      video_media_id: mediaId,
      keyframe_id: Math.max(0, Number(keyframeId) || 0)
    })
  });
  const data = await readJson(r);
  return {
    videoMediaId: mediaId,
    keyframeId: data?.Resp?.keyframe_id ?? 0,
    keyframeUrl: data?.Resp?.keyframe_url || '',
    credits: Number(data?.Resp?.credits || 0),
    masks: Array.isArray(data?.Resp?.mask_info) ? data.Resp.mask_info : [],
    raw: data
  };
}

export async function modifyPixVerseVideo({
  videoFile,
  videoMediaId,
  maskIds = [],
  keyframeIds,
  prompt,
  referenceImageFiles = [],
  quality = '540p',
  onStatus
} = {}) {
  if (!prompt?.trim()) throw new Error('Prompt de correction Modify manquant.');
  let mediaId = Number(videoMediaId) || 0;
  if (!mediaId) {
    if (!videoFile) throw new Error('Vidéo source Modify manquante.');
    onStatus?.({ step: 'upload-video' });
    mediaId = (await uploadPixVerseMedia(videoFile)).mediaId;
  }

  const imgIds = [];
  for (const file of Array.from(referenceImageFiles || []).slice(0, 10)) {
    onStatus?.({ step: 'upload-reference' });
    imgIds.push((await uploadPixVerseImage(file)).imgId);
  }

  onStatus?.({ step: 'create' });
  const { videoId, raw } = await createPixVerseVideo({
    mode: 'modify',
    videoMediaId: mediaId,
    imgIds,
    maskIds,
    keyframeIds,
    prompt: String(prompt).trim(),
    quality
  });

  onStatus?.({ step: 'processing', videoId });
  const result = await waitForPixVerse(videoId, {
    onStatus: s => onStatus?.({ step: 'processing', videoId, response: s })
  });
  const videoUrl = proxiedPixVerseVideoUrl(result.url, videoId);
  onStatus?.({ step: 'done', videoId, videoUrl });
  return { videoId, videoMediaId: mediaId, sourceUrl: result.url, videoUrl, createResponse: raw, response: result.raw };
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

export function proxiedPixVerseVideoUrl(url, videoId = '') {
  const p = new URLSearchParams();
  if (videoId !== undefined && videoId !== null && String(videoId).trim()) p.set('id', String(videoId).trim());
  if (url) p.set('url', url);
  return `/api/pixverse-video?${p.toString()}`;
}

function enrichOmniPrompt(basePrompt, hasMotionGuide, hasExtraRefs) {
  const refs = [
    'Use @main as the exact visual identity, composition, clothing, proportions, lighting and framing reference.',
    hasMotionGuide ? 'Use @motion only as the motion reference. Reproduce its action timing while preserving @main.' : '',
    hasExtraRefs ? 'Use the additional image references only to reinforce identity and visual details.' : '',
    'Keep the camera static and preserve the background as closely as possible.'
  ].filter(Boolean).join(' ');
  return `${refs} ${basePrompt}`.trim();
}

export async function runPixVerseAction(file, variant, {
  onStatus,
  controls = {}
} = {}) {
  if (!file) throw new Error('Image source manquante.');
  if (!variant?.prompt) throw new Error('Prompt d’action manquant.');

  const hardened = hardenPixVersePrompts(variant.prompt, variant.negativePrompt || '');
  const mode = choosePixVerseMode({
    mode: controls.mode || 'auto',
    endFile: controls.endFile,
    motionGuideFile: controls.motionGuideFile,
    keyframeFiles: controls.keyframeFiles,
    modify: controls.modify
  });

  const quality = controls.quality || variant.quality || '540p';
  const seed = controls.seed ?? variant.seed ?? 0;
  const audio = controls.audio ?? (variant.audio === true);
  const motionMode = controls.motionMode || variant.motionMode || 'normal';
  const requestedDuration = controls.duration ?? variant.duration ?? 2;
  const aspectRatio = controls.aspectRatio || 'auto';

  let createArgs = {
    mode,
    prompt: hardened.prompt,
    negativePrompt: hardened.negativePrompt,
    duration: requestedDuration,
    quality,
    motionMode,
    seed,
    audio,
    aspectRatio
  };

  onStatus?.({ step: 'upload', mode });

  if (mode === 'standard') {
    const { imgId } = await uploadPixVerseImage(file);
    createArgs.imgId = imgId;
  }

  if (mode === 'transition') {
    if (!controls.endFile) throw new Error('Le mode Transition requiert une image finale.');
    const [{ imgId:firstFrameImg }, { imgId:lastFrameImg }] = await Promise.all([
      uploadPixVerseImage(file),
      uploadPixVerseImage(controls.endFile)
    ]);
    createArgs.firstFrameImg = firstFrameImg;
    createArgs.lastFrameImg = lastFrameImg;
  }

  if (mode === 'omni') {
    const main = await uploadPixVerseImage(file);
    const refs = [{ img_id: main.imgId, type: 'subject', ref_name: 'main' }];
    const extraFiles = Array.from(controls.referenceImageFiles || []).slice(0, 9);
    for (let i = 0; i < extraFiles.length; i++) {
      const { imgId } = await uploadPixVerseImage(extraFiles[i]);
      refs.push({ img_id: imgId, type: 'subject', ref_name: `ref${i + 1}` });
    }
    createArgs.imageReferences = refs;

    if (controls.motionGuideFile) {
      const { mediaId } = await uploadPixVerseMedia(controls.motionGuideFile);
      createArgs.videoReferences = [{ video_media_id: mediaId, ref_name: 'motion' }];
      createArgs.duration = 0;
    }
    createArgs.prompt = enrichOmniPrompt(hardened.prompt, Boolean(controls.motionGuideFile), extraFiles.length > 0);
  }

  if (mode === 'multi_transition') {
    const extras = Array.from(controls.keyframeFiles || []).slice(0, 6);
    if (!extras.length) throw new Error('Multi-transition requiert au moins une image clé supplémentaire.');
    const files = [file, ...extras];
    const ids = [];
    for (const f of files) {
      const { imgId } = await uploadPixVerseImage(f);
      ids.push(imgId);
    }
    const segmentDuration = Math.max(1, Math.min(files.length >= 3 ? 5 : 8, Number(controls.segmentDuration || 1)));
    createArgs.multiTransition = ids.map((imgId, i) => ({
      img_id: imgId,
      duration: i === ids.length - 1 ? 0 : segmentDuration,
      prompt: i === ids.length - 1 ? '' : hardened.prompt
    }));
    createArgs.duration = segmentDuration * (ids.length - 1);
  }

  if (mode === 'modify') {
    const m = controls.modify || {};
    if (!m.videoFile) throw new Error('Modify requiert la vidéo à corriger.');
    const { mediaId } = await uploadPixVerseMedia(m.videoFile);
    createArgs.videoMediaId = mediaId;
    createArgs.imgIds = Array.isArray(m.imgIds) ? m.imgIds : [];
    createArgs.maskIds = Array.isArray(m.maskIds) ? m.maskIds : [];
    createArgs.keyframeIds = m.keyframeIds;
    createArgs.prompt = String(m.prompt || variant.prompt || '').trim();
  }

  onStatus?.({ step: 'create', mode });
  const { videoId, raw } = await createPixVerseVideo(createArgs);
  onStatus?.({ step: 'processing', videoId, mode });

  const result = await waitForPixVerse(videoId, {
    onStatus: s => onStatus?.({ step: 'processing', videoId, mode, response: s })
  });

  const videoUrl = proxiedPixVerseVideoUrl(result.url, videoId);
  const estimatedCredits = estimatePixVerseCredits({
    mode,
    quality,
    duration: createArgs.duration || requestedDuration,
    hasVideoReferences: Boolean(createArgs.videoReferences?.length),
    keyframeCount: createArgs.multiTransition?.length || 0
  });

  onStatus?.({ step: 'done', videoId, videoUrl, mode, estimatedCredits });
  return {
    videoId,
    sourceUrl: result.url,
    videoUrl,
    response: result.raw,
    createResponse: raw,
    promptUsed: createArgs.prompt,
    negativePromptUsed: hardened.negativePrompt,
    promptPolicy: hardened.policy,
    modeUsed: mode,
    quality,
    duration: createArgs.duration || requestedDuration,
    seed,
    estimatedCredits
  };
}
