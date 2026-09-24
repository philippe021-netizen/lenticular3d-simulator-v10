export const MOTION_POLICY_MARKER = 'MICROPLAYER ONE-WAY MOTION V3';

const NEGATIVE_POLICY_MARKER = 'reverse motion, return to starting pose';
const NEGATIVE_POLICY = `${NEGATIVE_POLICY_MARKER}, repeated action, bounce, oscillation, loop, cropped subject, partial body, out of frame, subject touching image edge, subject enlargement, subject drift, camera movement, camera shake, zoom, moving background, changing shadows, background regeneration, environmental motion, face change, identity change, subject replacement, extra limbs, extra fingers, duplicate person, duplicate object`;

function appendOnce(value, addition, marker, separator = ' ') {
  const source = String(value || '').trim();
  if (source.includes(marker)) return source.slice(0, 5000);
  const joiner = source ? separator : '';
  const room = Math.max(0, 5000 - joiner.length - addition.length);
  return `${source.slice(0, room)}${joiner}${addition}`;
}

export function hardenMotionPrompts(prompt = '', negativePrompt = '', motion = {}) {
  const requestedTarget = Number(motion.finalStateTarget);
  const target = Number.isFinite(requestedTarget)
    ? Math.min(0.98, Math.max(0.9, requestedTarget))
    : 0.94;
  const allowed = Array.isArray(motion.allowedZones) && motion.allowedZones.length
    ? ` Only ${motion.allowedZones.join(', ')} may move.`
    : '';
  const locked = Array.isArray(motion.lockedZones) && motion.lockedZones.length
    ? ` Keep ${motion.lockedZones.join(', ')} stable.`
    : '';
  const policy = `${MOTION_POLICY_MARKER}: Perform exactly one continuous A-to-B action. ` +
    `Reach the completed final state between 90% and 98% of useful motion ` +
    `(target ${Math.round(target * 100)}%), then keep only a brief clean final frame. ` +
    `Never reverse, repeat, bounce, oscillate, loop, zoom, reframe or replace the subject.` +
    `${allowed}${locked} Keep the complete subject inside the original frame with a clear safety margin. ` +
    `Keep camera and background as a frozen photographic plate. Preserve identity, anatomy, clothing, scale and geometry.`;

  return {
    prompt: appendOnce(prompt, policy, MOTION_POLICY_MARKER),
    negativePrompt: appendOnce(negativePrompt, NEGATIVE_POLICY, NEGATIVE_POLICY_MARKER, ', '),
    policy: 'microplayer-one-way-v3'
  };
}
