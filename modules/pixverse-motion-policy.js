export const PROMPT_POLICY_MARKER='LENTICULAR ONE-WAY MOTION POLICY';
const POLICY=`${PROMPT_POLICY_MARKER}: ONE SINGLE FORWARD PASS FOR LENTICULAR PRINT. Generate a continuous video from which nine progressive views will be sampled, not a grid or montage. Start exactly from the supplied source pose. Progress smoothly and steadily through visibly different intermediate states across the entire clip. Reach the final state at 95% of the clip and hold only for the remaining 5%. Never reverse, repeat, restart, bounce, oscillate, loop, or return toward the source pose. There is no reset in the video: the viewer reverses the physical printed card to read the nine views backward. Any earlier wording about a cycle, return, back-and-forth movement, or early hold is superseded by this single forward pass. Keep the camera, crop, scale, background, lighting and all unmentioned subjects fixed. Preserve identity, anatomy, clothing, text and logo geometry. Keep all originally visible subject parts inside the original frame with a safety margin. Do not enlarge, recrop, invent missing body parts or move the subject toward the camera. For expressive actions, animate one progressive change of expression or pose; for effects, build the effect progressively and retain the final state.`;
const NEGATIVE='reverse motion, return to starting pose, reset, repeated action, second action, loop, boomerang, oscillation, ping pong motion, early freeze, prolonged final hold, storyboard, collage, grid, camera movement, reframing, zoom, changing background, cropped subject, extra limbs, changed identity, altered logo, altered text';
function withoutPolicy(value){const text=String(value||'').trim(),at=text.indexOf(PROMPT_POLICY_MARKER);return (at<0?text:text.slice(0,at)).trim()}
export function hardenPixVersePrompts(prompt,negativePrompt=''){
  const source=withoutPolicy(prompt),policyRoom=5000-POLICY.length-1;
  const rawNegative=String(negativePrompt||'').trim();
  const suffix='LENTICULAR NEGATIVE V2: '+NEGATIVE;
  const at=rawNegative.indexOf('LENTICULAR NEGATIVE V2:');
  const cleanNegative=(at<0?rawNegative:rawNegative.slice(0,at)).replace(/,\s*$/,'').trim();
  return {prompt:`${source.slice(0,policyRoom)} ${POLICY}`.trim(),negativePrompt:`${cleanNegative.slice(0,5000-suffix.length-2)}${cleanNegative?', ':''}${suffix}`,policy:'lenticular-nine-states-v2'};
}
